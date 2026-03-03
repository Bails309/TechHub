'use server';

import { prisma } from '@/lib/prisma';
import { getServerAuthSession } from '@/lib/auth';
import { validateCsrf } from '@/lib/csrf';
import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/lib/audit';
import { saveIcon, deleteIcon } from '@/lib/storage';

const MAX_PERSONAL_APPS = 25;
const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 2048;
const MAX_DESC_LENGTH = 500;

/** Only allow http and https schemes to prevent XSS via javascript: / data: URIs */
function isAllowedUrl(raw: string): boolean {
    try {
        const url = new URL(raw);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

export async function createPersonalApp(_prevState: any, formData: FormData): Promise<{ status: 'success' | 'error'; message: string; app?: any }> {
    if (!(await validateCsrf(formData))) {
        return { status: 'error', message: 'Invalid CSRF token' };
    }

    const session = await getServerAuthSession();
    if (!session?.user?.id) {
        return { status: 'error', message: 'Not signed in' };
    }

    const name = String(formData.get('name') ?? '').trim();
    const url = String(formData.get('url') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();

    if (!name || name.length > MAX_NAME_LENGTH) {
        return { status: 'error', message: `Name is required (max ${MAX_NAME_LENGTH} chars)` };
    }
    if (!url || url.length > MAX_URL_LENGTH) {
        return { status: 'error', message: 'A valid URL is required' };
    }
    if (!isAllowedUrl(url)) {
        return { status: 'error', message: 'URL must use http:// or https://' };
    }
    if (description.length > MAX_DESC_LENGTH) {
        return { status: 'error', message: `Description too long (max ${MAX_DESC_LENGTH} chars)` };
    }

    // Enforce per-user limit
    const count = await prisma.personalApp.count({ where: { userId: session.user.id } });
    if (count >= MAX_PERSONAL_APPS) {
        return { status: 'error', message: `You can have at most ${MAX_PERSONAL_APPS} personal apps` };
    }

    try {
        // Handle optional icon upload
        let iconPath: string | null = null;
        const iconFile = formData.get('icon') as File | null;
        if (iconFile && iconFile.size > 0) {
            iconPath = await saveIcon(iconFile);
        }

        const app = await prisma.personalApp.create({
            data: {
                name,
                url,
                description: description || null,
                icon: iconPath,
                userId: session.user.id,
            },
        });

        await writeAuditLog({
            category: 'user',
            action: 'personal_app_created',
            actorId: session.user.id,
            details: { appName: name, appUrl: url },
        });

        revalidatePath('/');
        revalidatePath('/profile');
        return { status: 'success', message: 'App created', app };
    } catch (err: any) {
        console.error('Error creating personal app:', err);
        return { status: 'error', message: String(err?.message ?? 'Database error') };
    }
}

export async function updatePersonalApp(_prevState: any, formData: FormData): Promise<{ status: 'success' | 'error'; message: string }> {
    if (!(await validateCsrf(formData))) {
        return { status: 'error', message: 'Invalid CSRF token' };
    }

    const session = await getServerAuthSession();
    if (!session?.user?.id) {
        return { status: 'error', message: 'Not signed in' };
    }

    const appId = String(formData.get('appId') ?? '');
    if (!appId) {
        return { status: 'error', message: 'Missing app ID' };
    }

    // Ownership check
    const existing = await prisma.personalApp.findUnique({ where: { id: appId } });
    if (!existing || existing.userId !== session.user.id) {
        return { status: 'error', message: 'App not found' };
    }

    const name = String(formData.get('name') ?? '').trim();
    const url = String(formData.get('url') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();

    if (!name || name.length > MAX_NAME_LENGTH) {
        return { status: 'error', message: `Name is required (max ${MAX_NAME_LENGTH} chars)` };
    }
    if (!url || url.length > MAX_URL_LENGTH) {
        return { status: 'error', message: 'A valid URL is required' };
    }
    if (!isAllowedUrl(url)) {
        return { status: 'error', message: 'URL must use http:// or https://' };
    }
    if (description.length > MAX_DESC_LENGTH) {
        return { status: 'error', message: `Description too long (max ${MAX_DESC_LENGTH} chars)` };
    }

    try {
        // Handle optional icon upload
        let iconPath = existing.icon;
        const iconFile = formData.get('icon') as File | null;
        if (iconFile && iconFile.size > 0) {
            iconPath = await saveIcon(iconFile);
            // Delete old icon if it existed
            if (existing.icon && existing.icon !== iconPath) {
                await deleteIcon(existing.icon).catch(() => null);
            }
        }

        await prisma.personalApp.update({
            where: { id: appId },
            data: {
                name,
                url,
                description: description || null,
                icon: iconPath,
            },
        });

        await writeAuditLog({
            category: 'user',
            action: 'personal_app_updated',
            actorId: session.user.id,
            details: { appId, appName: name },
        });

        revalidatePath('/');
        revalidatePath('/profile');
        return { status: 'success', message: 'App updated' };
    } catch (err: any) {
        console.error('Error updating personal app:', err);
        return { status: 'error', message: String(err?.message ?? 'Database error') };
    }
}

export async function deletePersonalApp(_prevState: any, formData: FormData): Promise<{ status: 'success' | 'error'; message: string }> {
    if (!(await validateCsrf(formData))) {
        return { status: 'error', message: 'Invalid CSRF token' };
    }

    const session = await getServerAuthSession();
    if (!session?.user?.id) {
        return { status: 'error', message: 'Not signed in' };
    }

    const appId = String(formData.get('appId') ?? '');
    if (!appId) {
        return { status: 'error', message: 'Missing app ID' };
    }

    // Ownership check
    const existing = await prisma.personalApp.findUnique({ where: { id: appId } });
    if (!existing || existing.userId !== session.user.id) {
        return { status: 'error', message: 'App not found' };
    }

    try {
        // Delete icon if it existed
        if (existing.icon) {
            await deleteIcon(existing.icon).catch(() => null);
        }

        await prisma.personalApp.delete({ where: { id: appId } });

        await writeAuditLog({
            category: 'user',
            action: 'personal_app_deleted',
            actorId: session.user.id,
            details: { appId, appName: existing.name },
        });

        revalidatePath('/');
        revalidatePath('/profile');
        return { status: 'success', message: 'App deleted' };
    } catch (err: any) {
        console.error('Error deleting personal app:', err);
        return { status: 'error', message: String(err?.message ?? 'Database error') };
    }
}
