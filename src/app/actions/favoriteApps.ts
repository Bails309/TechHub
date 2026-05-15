'use server';

import { prisma } from '../../lib/prisma';
import { getServerAuthSession } from '../../lib/auth';
import { revalidatePath } from 'next/cache';
import { validateCsrf } from '../../lib/csrf';

export async function toggleFavoriteApp(formData: FormData) {
    if (!(await validateCsrf(formData))) {
        return { success: false, error: 'Invalid CSRF token' };
    }

    const appId = String(formData.get('appId') ?? '');
    if (!appId) {
        return { success: false, error: 'Missing app id' };
    }

    const session = await getServerAuthSession();

    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized' };
    }

    // Verify the target app actually exists in AppLink to avoid FK violations
    const appExists = await prisma.appLink.findUnique({
        where: { id: appId },
        select: { id: true },
    });
    if (!appExists) {
        return { success: false, error: 'App not found' };
    }

    const userId = session.user.id;

    try {
        const existing = await prisma.userFavoriteApp.findUnique({
            where: {
                userId_appId: {
                    userId,
                    appId
                }
            }
        });

        if (existing) {
            // Remove from favorites
            await prisma.userFavoriteApp.delete({
                where: {
                    userId_appId: {
                        userId,
                        appId
                    }
                }
            });
        } else {
            // Add to favorites
            await prisma.userFavoriteApp.create({
                data: {
                    userId,
                    appId
                }
            });
        }

        revalidatePath('/');
        return { success: true, isFavorited: !existing };
    } catch (error) {
        console.error('Failed to toggle favorite app:', error);
        return { success: false, error: 'Failed to update preferences.' };
    }
}
