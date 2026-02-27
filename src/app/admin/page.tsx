import { prisma } from '../../lib/prisma';
import Link from 'next/link';
import { AppWindow, Users, KeyRound, Settings, LayoutGrid } from 'lucide-react';
import AnalyticsDashboard from './AnalyticsDashboard';
import { getAppLaunchStats, getUserActivityStats } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const [
    totalApps,
    totalUsers,
    ssoConfigs,
    storageConfigs,
    totalRoles,
    recentAudits,
    launchStats,
    activityStats
  ] = await Promise.all([
    prisma.appLink.count(),
    prisma.user.count(),
    prisma.ssoConfig.findMany({ where: { enabled: true } }),
    prisma.storageConfig.findMany({ where: { enabled: true } }),
    prisma.role.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    getAppLaunchStats(),
    getUserActivityStats(),
  ]);

  const activeSsoCount = ssoConfigs.length;
  const activeSsoNames = ssoConfigs.map((c: any) => c.provider).join(', ') || 'None configured';
  const activeStorage =
    storageConfigs.find((c: any) => c.enabled)?.provider ?? process.env.STORAGE_PROVIDER ?? 'local';

  // Resolve actor names for recent activity
  const actorIds = Array.from(
    new Set(recentAudits.map((a: any) => a.actorId).filter((id: string | null): id is string => Boolean(id)))
  );
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds as string[] } }, select: { id: true, name: true, email: true } })
    : [];
  const actorMap = new Map(actors.map((u: any) => [u.id, u.email ?? u.name]));

  const cards = [
    {
      href: '/admin/apps',
      icon: AppWindow,
      label: 'Apps',
      stat: totalApps,
      description: 'Manage the app catalogue',
    },
    {
      href: '/admin/users',
      icon: Users,
      label: 'Users',
      stat: totalUsers,
      description: 'Manage users and role assignments',
    },
    {
      href: '/admin/sso',
      icon: KeyRound,
      label: 'SSO',
      stat: `${activeSsoCount} active`,
      detail: activeSsoNames,
      description: 'Configure SSO providers and link accounts',
    },
    {
      href: '/admin/settings',
      icon: Settings,
      label: 'Settings',
      stat: `${totalRoles} roles`,
      detail: `Storage: ${activeStorage}`,
      description: 'Roles, password policy, and storage',
    },
  ];

  return (
    <div className="px-6 md:px-12 py-12 space-y-8">
      <section className="card-panel">
        <h1 className="font-serif text-3xl">Admin command centre</h1>
        <p className="text-ink-200 mt-2">
          Manage apps, users, SSO providers, and system settings.
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card: any) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="glass rounded-[32px] p-6 hover:border-ocean-500/30 border border-transparent transition group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-full bg-ocean-500/10 p-2">
                  <Icon size={20} className="text-ocean-400" />
                </div>
                <h2 className="font-serif text-xl">{card.label}</h2>
              </div>
              <p className="text-2xl font-semibold text-ink-100 mb-1">{card.stat}</p>
              {'detail' in card && card.detail ? (
                <p className="text-xs text-ink-400 mb-2">{card.detail}</p>
              ) : null}
              <p className="text-xs text-ink-300">{card.description}</p>
            </Link>
          );
        })}
      </div>

      <AnalyticsDashboard launchStats={launchStats} activityStats={activityStats} />

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card-panel md:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-2xl">Recent activity</h2>
            <Link href="/admin/audit" className="text-xs font-medium text-ocean-400 hover:text-ocean-300 transition px-4 py-2 rounded-full bg-ocean-500/10 hover:bg-ocean-500/20">
              View full audit log
            </Link>
          </div>

          <div className="space-y-3">
            {recentAudits.length === 0 ? (
              <p className="text-xs text-ink-400">No recent activity.</p>
            ) : (
              recentAudits.map((audit: any) => {
                const actorName = audit.actorId ? actorMap.get(audit.actorId) ?? audit.actorId : 'System';
                return (
                  <div key={audit.id} className="flex items-center justify-between gap-4 rounded-2xl border border-ink-800/50 bg-ink-900/50 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink-100 text-sm">{audit.action}</p>
                      <p className="text-xs text-ink-400 mt-1 truncate">
                        <span className="text-ink-500">Actor:</span> {actorName}
                        {audit.targetId && <><span className="text-ink-600 mx-2">•</span><span className="text-ink-500">Target:</span> {audit.targetId}</>}
                        {audit.provider && <><span className="text-ink-600 mx-2">•</span><span className="text-ink-500">Provider:</span> {audit.provider}</>}
                      </p>
                    </div>
                    <span className="text-xs text-ink-500 whitespace-nowrap">{audit.createdAt.toLocaleString()}</span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

