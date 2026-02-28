import { prisma } from '../../../lib/prisma';
import { KeyRound, Shield, Settings } from 'lucide-react';
import AuditDetails from './AuditDetails';
import ClientDate from '../../../components/ClientDate';

function CategoryIcon({ category }: { category: string }) {
    if (category === 'auth') return <KeyRound size={16} className="text-ocean-400 shrink-0" />;
    if (category === 'admin') return <Shield size={16} className="text-purple-400 shrink-0" />;
    if (category === 'config') return <Settings size={16} className="text-amber-400 shrink-0" />;
    return <KeyRound size={16} className="text-ink-400 shrink-0" />;
}

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

interface AuditListProps {
    where: any;
    skip: number;
    take: number;
    page: number;
    categoryFilter?: string;
    actionFilter?: string;
    providerFilter?: string;
}

export default async function AuditList({ where, skip, take, page, categoryFilter, actionFilter, providerFilter }: AuditListProps) {
    const startMany = Date.now();
    // Fetch take + 1 to check if there is a next page without doing a full count
    const auditsWithNext = await prisma.auditLog.findMany({
        where,
        select: {
            id: true,
            category: true,
            action: true,
            actorId: true,
            targetId: true,
            provider: true,
            ip: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: take + 1,
    });
    console.log(`[AuditList] findMany took ${Date.now() - startMany}ms`);

    const hasNextPage = auditsWithNext.length > take;
    const audits = auditsWithNext.slice(0, take);
    const prevPage = page > 1 ? page - 1 : null;
    const nextPage = hasNextPage ? page + 1 : null;

    const actorIds = Array.from(new Set(audits.map(a => a.actorId).filter((id): id is string => !!id)));
    const targetIds = Array.from(new Set(audits.map(a => a.targetId).filter((id): id is string => !!id)));
    const allUserIds = Array.from(new Set([...actorIds, ...targetIds]));

    const [users, apps, roles] = await Promise.all([
        allUserIds.length ? prisma.user.findMany({ where: { id: { in: allUserIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
        targetIds.length ? prisma.appLink.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
        targetIds.length ? prisma.role.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);

    const userMap = new Map(users.map(u => [u.id, u]));
    const appMap = new Map(apps.map(a => [a.id, a]));
    const roleMap = new Map(roles.map(r => [r.id, r]));

    const getTargetName = (id?: string | null) => {
        if (!id) return null;
        if (userMap.has(id)) return userMap.get(id)?.email ?? userMap.get(id)?.name;
        if (appMap.has(id)) return appMap.get(id)?.name;
        if (roleMap.has(id)) return roleMap.get(id)?.name;
        return id;
    };

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h2 className="font-serif text-2xl">Recent events</h2>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-ink-300">
                        Page {page}
                    </span>
                    <div className="flex items-center gap-2">
                        {prevPage ? (
                            <a href={`/admin/audit?page=${prevPage}${categoryFilter ? `&category=${categoryFilter}` : ''}${actionFilter ? `&action=${actionFilter}` : ''}${providerFilter ? `&provider=${providerFilter}` : ''}`} className="btn-secondary btn-small">Previous</a>
                        ) : (
                            <span className="btn-secondary btn-small opacity-50 cursor-not-allowed">Previous</span>
                        )}
                        {nextPage ? (
                            <a href={`/admin/audit?page=${nextPage}${categoryFilter ? `&category=${categoryFilter}` : ''}${actionFilter ? `&action=${actionFilter}` : ''}${providerFilter ? `&provider=${providerFilter}` : ''}`} className="btn-secondary btn-small">Next</a>
                        ) : (
                            <span className="btn-secondary btn-small opacity-50 cursor-not-allowed">Next</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-3 mt-4">
                {audits.length === 0 ? (
                    <p className="text-sm text-ink-400">No audit entries found matching the current filters.</p>
                ) : (
                    audits.map((audit) => (
                        <div key={audit.id} className="rounded-2xl border border-white/5 p-5 shadow-inner bg-white/[0.03] hover:border-ocean-500/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-ink-800 rounded-lg">
                                    <CategoryIcon category={audit.category} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-4">
                                        <p className="font-semibold text-ink-100">{audit.action}</p>
                                        <span className="text-xs text-ink-400 whitespace-nowrap"><ClientDate date={audit.createdAt.toISOString()} /></span>
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
                                        {audit.ip && <span className="flex items-center gap-1.5"><span className="text-ink-500">IP:</span> {audit.ip}</span>}
                                    </div>
                                </div>
                            </div>
                            <AuditDetails auditId={audit.id} />
                        </div>
                    ))
                )}
            </div>
        </>
    );
}
