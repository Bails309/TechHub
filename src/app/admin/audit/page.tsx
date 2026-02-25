import { prisma } from '../../../lib/prisma';
import { getServerAuthSession } from '../../../lib/auth';
import { redirect } from 'next/navigation';
import { KeyRound, Shield, Settings } from 'lucide-react';

export const dynamic = 'force-dynamic';

function MicrosoftIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 21 21" fill="none" className={className} width="16" height="16">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
    );
}

function KeycloakIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={className} width="16" height="16">
            <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="#4d4d4d" />
            <path d="M12 2L3 7l9 5 9-5-9-5z" fill="#e0e0e0" />
            <path d="M12 12l-9-5v10l9 5V12z" fill="#b3b3b3" />
            <path d="M12 12v10l9-5V7l-9 5z" fill="#808080" />
            <circle cx="12" cy="10" r="3" fill="#fff" />
        </svg>
    );
}

function CategoryIcon({ category }: { category: string }) {
    if (category === 'auth') return <KeyRound size={16} className="text-ocean-400 shrink-0" />;
    if (category === 'admin') return <Shield size={16} className="text-purple-400 shrink-0" />;
    if (category === 'config') return <Settings size={16} className="text-amber-400 shrink-0" />;
    return <KeyRound size={16} className="text-ink-400 shrink-0" />;
}

function ProviderIcon({ provider }: { provider?: string | null }) {
    if (!provider) return null;
    if (provider === 'azure-ad') return <MicrosoftIcon className="shrink-0" />;
    if (provider === 'keycloak') return <KeycloakIcon className="shrink-0" />;
    return <KeyRound size={16} className="text-ink-400 shrink-0" />;
}

function providerLabel(provider?: string | null): string {
    if (!provider) return '';
    if (provider === 'azure-ad') return 'Microsoft Entra ID';
    if (provider === 'keycloak') return 'Keycloak';
    if (provider === 'credentials') return 'Credentials';
    return provider;
}

export default async function AuditPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const session = await getServerAuthSession();
    if (!session?.user?.roles?.includes('admin')) {
        redirect('/');
    }

    const resolvedParams = await props.searchParams;
    const categoryFilter = resolvedParams.category as string | undefined;
    const actionFilter = resolvedParams.action as string | undefined;
    const providerFilter = resolvedParams.provider as string | undefined;

    const where: any = {};
    if (categoryFilter) where.category = categoryFilter;
    if (actionFilter) where.action = actionFilter;
    if (providerFilter) where.provider = providerFilter;

    const audits = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
    });

    const actorIds = Array.from(
        new Set(audits.map((a: any) => a.actorId).filter((id: string | null): id is string => id !== null && id !== undefined))
    );
    const targetIds = Array.from(
        new Set(audits.map((a: any) => a.targetId).filter((id: string | null): id is string => id !== null && id !== undefined))
    );
    const allUserIds = Array.from(new Set([...actorIds, ...targetIds]));

    const users = allUserIds.length
        ? await prisma.user.findMany({ where: { id: { in: allUserIds as string[] } }, select: { id: true, name: true, email: true } })
        : [];
    const userMap = new Map(users.map((u: any) => [u.id, u]));

    const apps = targetIds.length
        ? await prisma.appLink.findMany({ where: { id: { in: targetIds as string[] } }, select: { id: true, name: true } })
        : [];
    const appMap = new Map(apps.map((a: any) => [a.id, a]));

    const roles = targetIds.length
        ? await prisma.role.findMany({ where: { id: { in: targetIds as string[] } }, select: { id: true, name: true } })
        : [];
    const roleMap = new Map(roles.map((r: any) => [r.id, r]));


    const getTargetName = (id?: string | null) => {
        if (!id) return null;
        if (userMap.has(id)) return userMap.get(id)?.email ?? userMap.get(id)?.name;
        if (appMap.has(id)) return appMap.get(id)?.name;
        if (roleMap.has(id)) return roleMap.get(id)?.name;
        return id;
    };


    return (
        <div className="px-6 md:px-12 py-12 space-y-8 max-w-7xl mx-auto">
            <section className="card-panel md:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="font-serif text-3xl">Audit Log</h1>
                        <p className="text-ink-200 mt-2">
                            Comprehensive record of authentication events, admin actions, and configuration changes.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <a href="/admin/audit" className={`btn-small ${!categoryFilter ? 'btn-primary' : 'btn-secondary'}`}>All</a>
                        <a href="/admin/audit?category=auth" className={`flex items-center gap-2 btn-small ${categoryFilter === 'auth' ? 'btn-primary' : 'btn-secondary'}`}><KeyRound size={16} /> Auth</a>
                        <a href="/admin/audit?category=admin" className={`flex items-center gap-2 btn-small ${categoryFilter === 'admin' ? 'btn-primary' : 'btn-secondary'}`}><Shield size={16} /> Admin</a>
                        <a href="/admin/audit?category=config" className={`flex items-center gap-2 btn-small ${categoryFilter === 'config' ? 'btn-primary' : 'btn-secondary'}`}><Settings size={16} /> Config</a>
                    </div>
                </div>
            </section>

            <section className="card-panel md:p-8">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-serif text-2xl">Recent events</h2>
                    <span className="rounded-full bg-ink-800 px-3 py-1 text-xs text-ink-300">
                        Showing latest {audits.length}
                    </span>
                </div>

                <div className="space-y-3 mt-4">
                    {audits.length === 0 ? (
                        <p className="text-sm text-ink-400">No audit entries found matching the current filters.</p>
                    ) : (
                        audits.map((audit: any) => (
                            <div key={audit.id} className="rounded-2xl border border-ink-800 px-5 py-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-ink-800 rounded-lg">
                                        <CategoryIcon category={audit.category} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-4">
                                            <p className="font-semibold text-ink-100">
                                                {audit.action}
                                            </p>
                                            <span className="text-xs text-ink-400 whitespace-nowrap">{audit.createdAt.toLocaleString()}</span>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-300 mt-1.5">
                                            <span className="flex items-center gap-1.5">
                                                <span className="text-ink-500">Actor:</span>
                                                <span className="font-medium">{audit.actorId ? (userMap.get(audit.actorId)?.email ?? userMap.get(audit.actorId)?.name ?? audit.actorId) : 'System'}</span>
                                            </span>
                                            {audit.targetId && (
                                                <span className="flex items-center gap-1.5">
                                                    <span className="text-ink-500">Target:</span>
                                                    <span className="font-medium text-ink-200">{getTargetName(audit.targetId)}</span>
                                                </span>
                                            )}
                                            {audit.provider && (
                                                <span className="flex items-center gap-1.5">
                                                    <span className="text-ink-500">Provider:</span>
                                                    <ProviderIcon provider={audit.provider} />
                                                    {providerLabel(audit.provider)}
                                                </span>
                                            )}
                                            {audit.ip && (
                                                <span className="flex items-center gap-1.5">
                                                    <span className="text-ink-500">IP:</span> {audit.ip}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {(audit.details && Object.keys(audit.details as object).length > 0) && (
                                    <details className="mt-3">
                                        <summary className="cursor-pointer text-xs text-ocean-400 hover:text-ocean-300 transition list-none flex items-center gap-1 pt-2 border-t border-ink-800/50">
                                            <span className="transition [details[open]>&]:rotate-90">▶</span>
                                            View details
                                        </summary>
                                        <div className="mt-2 bg-ink-900 border border-ink-800/50 rounded-xl overflow-hidden">
                                            <pre className="overflow-x-auto p-4 textxs text-ink-200 font-mono">
                                                {JSON.stringify(audit.details, null, 2)}
                                            </pre>
                                        </div>
                                    </details>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
