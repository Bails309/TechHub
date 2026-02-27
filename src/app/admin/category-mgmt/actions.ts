'use server';

import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { getServerAuthSession } from '../../../lib/auth';
import { writeAuditLog } from '../../../lib/audit';
import { revalidatePath } from 'next/cache';

const categorySchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    icon: z.string().optional(),
    order: z.number().int().default(0),
});

export async function createCategory(formData: FormData) {
    const session = await getServerAuthSession();
    if (!session?.user?.roles?.includes('admin')) {
        return { success: false, error: 'Unauthorized' };
    }

    const payload = {
        name: formData.get('name') as string,
        description: formData.get('description') as string || undefined,
        icon: formData.get('icon') as string || undefined,
        order: Number(formData.get('order') ?? 0),
    };

    const result = categorySchema.safeParse(payload);
    if (!result.success) {
        return { success: false, error: result.error.errors[0]?.message || 'Invalid input' };
    }

    try {
        const category = await prisma.category.create({
            data: result.data,
        });

        writeAuditLog({
            category: 'admin',
            action: 'category_created',
            actorId: session.user.id,
            targetId: category.id,
            details: { name: category.name },
        });

        revalidatePath('/admin/category-mgmt');
        revalidatePath('/admin/apps');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Failed to create category. Use a unique name.' };
    }
}

export async function updateCategory(id: string, formData: FormData) {
    const session = await getServerAuthSession();
    if (!session?.user?.roles?.includes('admin')) {
        return { success: false, error: 'Unauthorized' };
    }

    const payload = {
        name: formData.get('name') as string,
        description: formData.get('description') as string || undefined,
        icon: formData.get('icon') as string || undefined,
        order: Number(formData.get('order') ?? 0),
    };

    const result = categorySchema.safeParse(payload);
    if (!result.success) {
        return { success: false, error: result.error.errors[0]?.message || 'Invalid input' };
    }

    try {
        const category = await prisma.category.update({
            where: { id },
            data: result.data,
        });

        writeAuditLog({
            category: 'admin',
            action: 'category_updated',
            actorId: session.user.id,
            targetId: category.id,
            details: { name: category.name },
        });

        revalidatePath('/admin/category-mgmt');
        revalidatePath('/admin/apps');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Failed to update category' };
    }
}

export async function deleteCategory(id: string) {
    const session = await getServerAuthSession();
    if (!session?.user?.roles?.includes('admin')) {
        return { success: false, error: 'Unauthorized' };
    }

    try {
        const category = await prisma.category.delete({
            where: { id },
        });

        writeAuditLog({
            category: 'admin',
            action: 'category_deleted',
            actorId: session.user.id,
            targetId: category.id,
            details: { name: category.name },
        });

        revalidatePath('/admin/category-mgmt');
        revalidatePath('/admin/apps');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Failed to delete category. Ensure no apps are linked to it.' };
    }
}
