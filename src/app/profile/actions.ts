'use server';

import { prisma } from '@/lib/prisma';
import { getServerAuthSession } from '@/lib/auth';
import { validateCsrf } from '@/lib/csrf';
import { invalidateUserMeta } from '@/lib/userCache';
import { writeAuditLog } from '@/lib/audit';
import { saveIcon, deleteIcon } from '@/lib/storage';

export async function updateProfileImage(formData: FormData): Promise<{ status: 'success' | 'error'; message: string; image?: string }> {
    if (!(await validateCsrf(formData))) {
        return { status: 'error' as const, message: 'Invalid CSRF token' };
    }

    const session = await getServerAuthSession();
    if (!session?.user?.id) {
        return { status: 'error' as const, message: 'Not signed in' };
    }

    const imageFile = formData.get('image') as File | null;
    if (!imageFile || imageFile.size === 0) {
        return { status: 'error' as const, message: 'No image provided' };
    }

    try {
        // Get existing user to delete old icon if necessary
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { image: true }
        });

        // Save new icon
        const iconPath = await saveIcon(imageFile);

        // Update user record
        await prisma.user.update({
            where: { id: session.user.id },
            data: { image: iconPath }
        });

        // Delete old icon if it was a local file/blob
        if (user?.image && user.image !== iconPath) {
            await deleteIcon(user.image).catch(() => null);
        }

        await invalidateUserMeta(session.user.id);

        await writeAuditLog({
            category: 'auth',
            action: 'profile_updated',
            actorId: session.user.id,
            targetId: session.user.id,
            details: { field: 'image', path: iconPath }
        });

        return { status: 'success' as const, message: 'Profile icon updated', image: iconPath };
    } catch (err: any) {
        console.error('Error updating profile image:', err);
        return { status: 'error' as const, message: String(err?.message ?? 'Database error') };
    }
}
