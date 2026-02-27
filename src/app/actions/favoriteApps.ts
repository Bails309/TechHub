'use server';

import { prisma } from '../../lib/prisma';
import { getServerAuthSession } from '../../lib/auth';
import { revalidatePath } from 'next/cache';

export async function toggleFavoriteApp(appId: string) {
    const session = await getServerAuthSession();

    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized' };
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
