import { getServerAuthSession } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import PortalView from '../components/PortalView';
import StatsStrip from '../components/StatsStrip';
import { getAverageLatency } from '../lib/audit';
import { sanitizeIconUrl } from '../lib/sanitizeIconUrl';
import { getStorageConfigMap } from '../lib/storageConfig';
import { getFavoriteApps } from './actions/getFavoriteApps';

export const dynamic = 'force-dynamic';

export default async function Home() {
  try {
    const session = await getServerAuthSession();
    const sessionRoles = session?.user?.roles ?? [];

    // Fetch role records for all names in the session, using case-insensitive
    // matching to handle mismatches between local DB (usually lowercase)
    // and SSO providers (which may use Title Case).
    const roleRecords = sessionRoles.length
      ? await prisma.role.findMany({
        where: {
          name: { in: sessionRoles, mode: 'insensitive' }
        },
        select: { id: true }
      })
      : [];
    const roleIds = roleRecords.map((role) => role.id);

    const audienceFilters: Prisma.AppLinkWhereInput[] = [{ audience: 'PUBLIC' }];
    if (session) {
      audienceFilters.push({ audience: 'AUTHENTICATED' });
      audienceFilters.push({
        audience: 'USER',
        userAccesses: { some: { userId: session.user.id } }
      });
    }
    if (roleIds.length) {
      audienceFilters.push({ audience: 'ROLE', roles: { some: { id: { in: roleIds } } } });
    }

    // Wrap storage config in its own try-catch to avoid fatal SSO_MASTER_KEY errors
    let storageMap = new Map();
    try {
      storageMap = await getStorageConfigMap();
    } catch (err) {
      console.error('[PORTAL] Failed to load storage configuration:', err);
    }

    const s3Config = storageMap.get('s3')?.config as { bucket?: string; region?: string; endpoint?: string } | undefined;

    // Calculate the expected S3 hostname to prevent arbitrary bucket injection
    let allowedS3Hostname: string | null = null;
    if (storageMap.get('s3')?.enabled && s3Config?.bucket) {
      if (s3Config.endpoint) {
        try {
          allowedS3Hostname = new URL(s3Config.endpoint).hostname;
        } catch { /* ignore */ }
      } else {
        allowedS3Hostname = `${s3Config.bucket}.s3.${s3Config.region ?? process.env.S3_REGION ?? 'us-east-1'}.amazonaws.com`;
      }
    }

    const [apps, appOrder, averageLatencyValue, favoriteAppIds, personalApps] = await Promise.all([
      prisma.appLink.findMany({
        where: { OR: audienceFilters },
        orderBy: [{ categoryRef: { name: 'asc' } }, { name: 'asc' }],
        include: { categoryRef: true }
      }),
      session?.user?.id ? prisma.userAppOrder.findUnique({
        where: { userId: session.user.id }
      }) : null,
      getAverageLatency(),
      session?.user?.id ? getFavoriteApps() : Promise.resolve([]),
      session?.user?.id ? prisma.personalApp.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([])
    ]);

    // Merge admin apps and personal apps for the portal view
    const adminAppsMapped = apps.map((app: any) => ({
      id: app.id,
      name: app.name,
      url: app.url,
      description: app.description,
      category: app.categoryRef?.name ?? 'General',
      icon: sanitizeIconUrl(app.icon, process.env.NEXTAUTH_URL || 'http://localhost:3000', allowedS3Hostname),
      isPersonal: false,
    }));

    const personalAppsMapped = personalApps.map((app: any) => ({
      id: `personal-${app.id}`,
      name: app.name,
      url: app.url,
      description: app.description,
      category: 'My Apps',
      icon: sanitizeIconUrl(app.icon, process.env.NEXTAUTH_URL || 'http://localhost:3000', allowedS3Hostname),
      isPersonal: true,
    }));

    const allApps = [...personalAppsMapped, ...adminAppsMapped];
    const categories = Array.from(new Set(allApps.map((app: any) => app.category ?? 'General')));
    const displayLatency = averageLatencyValue ?? '< 1s';

    return (
      <div className="px-6 md:px-12 py-12 space-y-12">
        <StatsStrip
          appCount={allApps.length}
          categories={categories.length}
          averageLatency={displayLatency}
        />

        <PortalView
          apps={allApps}
          isAuthenticated={Boolean(session)}
          initialOrder={Array.isArray(appOrder?.order) ? (appOrder?.order as string[]) : []}
          pinnedApps={favoriteAppIds}
        />
      </div>
    );
  } catch (err) {
    console.error('[PORTAL] Fatal error rendering Home page:', err);
    throw err; // Re-throw so error.tsx handles it, but we've logged it!
  }
}
