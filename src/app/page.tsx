import { getServerAuthSession } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import PortalView from '../components/PortalView';
import StatsStrip from '../components/StatsStrip';
import { getAverageLatency } from '../lib/audit';
import { sanitizeIconUrl } from '../lib/sanitizeIconUrl';
import { getStorageConfigMap } from '../lib/storageConfig';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getServerAuthSession();
  const roles = session?.user?.roles ?? [];

  const roleRecords = roles.length
    ? await prisma.role.findMany({ where: { name: { in: roles } } })
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
    audienceFilters.push({ audience: 'ROLE', roleId: { in: roleIds } });
  }

  const storageMap = await getStorageConfigMap();
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

  const [apps, appOrder, averageLatencyValue, favoriteAppIds] = await Promise.all([
    prisma.appLink.findMany({
      where: { OR: audienceFilters },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { categoryRef: true }
    }),
    session?.user?.id ? prisma.userAppOrder.findUnique({
      where: { userId: session.user.id }
    }) : null,
    getAverageLatency(),
    session?.user?.id ? import('./actions/getFavoriteApps').then(m => m.getFavoriteApps()) : Promise.resolve([])
  ]);

  const categories = Array.from(new Set(apps.map((app) => app.categoryRef?.name ?? app.category ?? 'General')));
  const displayLatency = averageLatencyValue ?? '< 1s';

  return (
    <div className="px-6 md:px-12 py-12 space-y-12">
      <StatsStrip
        appCount={apps.length}
        categories={categories.length}
        averageLatency={displayLatency}
      />

      <PortalView
        apps={apps.map((app) => ({
          id: app.id,
          name: app.name,
          url: app.url,
          description: app.description,
          category: app.categoryRef?.name ?? app.category ?? 'General',
          icon: sanitizeIconUrl(app.icon, process.env.NEXTAUTH_URL || 'http://localhost:3000', allowedS3Hostname)
        }))}
        isAuthenticated={Boolean(session)}
        initialOrder={Array.isArray(appOrder?.order) ? (appOrder?.order as string[]) : []}
        pinnedApps={favoriteAppIds}
      />
    </div>
  );
}
