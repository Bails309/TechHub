import { NextResponse } from 'next/server';
import { cleanupOrphanedIcons } from '@/lib/storage';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

export async function POST(request: Request) {
    // Simple bearer token check for cron security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 1. Fetch all icons currently in use across apps and site config
        const [apps, siteConfigs] = await Promise.all([
            prisma.appLink.findMany({ select: { icon: true } }),
            prisma.siteConfig.findMany({ select: { logoLight: true, logoDark: true, faviconUrl: true, logo: true } })
        ]);

        const activeIcons = new Set<string>();
        apps.forEach(a => { if (a.icon) activeIcons.add(a.icon); });
        siteConfigs.forEach(s => {
            if (s.logoLight) activeIcons.add(s.logoLight);
            if (s.logoDark) activeIcons.add(s.logoDark);
            if (s.faviconUrl) activeIcons.add(s.faviconUrl);
            if (s.logo) activeIcons.add(s.logo);
        });

        // 2. Run cleanup
        const deletedCount = await cleanupOrphanedIcons(Array.from(activeIcons));

        if (deletedCount > 0) {
            await writeAuditLog({
                category: 'config',
                action: 'storage_cleanup',
                details: { deletedCount, source: 'cron' }
            });
        }

        return NextResponse.json({ success: true, deletedCount });
    } catch (err) {
        console.error('[CRON-CLEANUP-ERROR]', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
