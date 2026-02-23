import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import PortalView from '@/components/PortalView';
import StatsStrip from '@/components/StatsStrip';

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

  const apps = await prisma.appLink.findMany({
    where: {
      OR: audienceFilters
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }]
  });

  const categories = Array.from(new Set(apps.map((app) => app.category ?? 'General')));

  const appOrder = session?.user?.id
    ? await prisma.userAppOrder.findUnique({
        where: { userId: session.user.id }
      })
    : null;

  return (
    <div className="px-6 md:px-12 py-12 space-y-12">
      <StatsStrip appCount={apps.length} categories={categories.length} />

      <PortalView
        apps={apps.map((app) => ({
          id: app.id,
          name: app.name,
          url: app.url,
          description: app.description,
          category: app.category,
          icon: app.icon
        }))}
        isAuthenticated={Boolean(session)}
        initialOrder={Array.isArray(appOrder?.order) ? (appOrder?.order as string[]) : []}
      />
    </div>
  );
}
