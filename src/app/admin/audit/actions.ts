'use server';

import { prisma } from '../../../lib/prisma';
import { getServerAuthSession } from '../../../lib/auth';

export async function getAuditDetails(auditId: string) {
    const session = await getServerAuthSession();
    if (!session?.user?.roles?.includes('admin')) {
        throw new Error('Unauthorized');
    }

    const audit = await prisma.auditLog.findUnique({
        where: { id: auditId },
        select: { details: true },
    });

    return audit?.details;
}
