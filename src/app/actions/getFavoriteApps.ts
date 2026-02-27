'use server';

import { prisma } from '../../lib/prisma';
import { getServerAuthSession } from '../../lib/auth';

export async function getFavoriteApps() {
    const session = await getServerAuthSession();

    if (!session?.user?.id) {
        return [];
    }

    try {
        const favorites = await prisma.userFavoriteApp.findMany({
            where: {
                userId: session.user.id
            },
            select: {
                appId: true
            }
        });

        return favorites.map(f => f.appId);
    } catch (error) {
        console.error('Error fetching favorite apps:', error);
        return [];
    }
}
