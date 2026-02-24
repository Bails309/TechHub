import { prisma } from '../../lib/prisma';
import { getServerAuthSession } from '../../lib/auth';

export const dynamic = 'force-dynamic';

export default async function SsoAuditPage() {
  const session = await getServerAuthSession();
  if (!session?.user?.roles?.includes('admin')) {
    return (
      <div className="px-6 md:px-12 py-16">
        <div className="glass rounded-[32px] p-8 max-w-xl">
          <h1 className="font-serif text-2xl">Admin access required</h1>
          <p className="text-ink-200 mt-4">Your account does not have permission to view SSO audit logs.</p>
        </div>
      </div>
    );
  }

  const audits = await prisma.ssoAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });

  // Resolve actor names/emails for better readability in the UI
  const actorIds = Array.from(
    new Set(audits.map((a) => a.actorId).filter((id): id is string => id !== null && id !== undefined))
  );
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
    : [];
  const actorMap = new Map(actors.map((u) => [u.id, u]));

  return (
    <div className="px-6 md:px-12 py-12">
      <section className="glass rounded-[36px] p-8">
        <h1 className="font-serif text-3xl">SSO Audit log</h1>
        <p className="text-ink-200 mt-2">Recent SSO link events recorded when admins link accounts.</p>
      </section>

      <section className="glass rounded-[36px] p-8">
        <div className="space-y-3">
          {audits.length === 0 ? (
            <p className="text-xs text-ink-400">No SSO audit entries found.</p>
          ) : (
            audits.map((audit) => (
              <div key={audit.id} className="rounded-2xl border border-ink-800 px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{audit.provider} — {audit.action}</p>
                    <p className="text-xs text-ink-400">Actor: {audit.actorId ? (actorMap.get(audit.actorId)?.name ?? actorMap.get(audit.actorId)?.email ?? audit.actorId) : 'system'}</p>
                    <p className="text-xs text-ink-400">When: {audit.createdAt.toISOString()}</p>
                  </div>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-md bg-black/10 p-3 text-xs text-ink-200">{JSON.stringify(audit.changes, null, 2)}</pre>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
