import { getServerAuthSession } from '../../../lib/auth';
import { redirect } from 'next/navigation';
import { KeyRound, Shield, Settings } from 'lucide-react';
import { Suspense } from 'react';
import AuditList from './AuditList';

export const dynamic = 'force-dynamic';

function AuditSkeleton() {
    return (
        <div className="animate-pulse space-y-4 pt-4">
            <div className="flex justify-between items-center mb-6">
                <div className="h-8 w-32 bg-ink-800 rounded-lg"></div>
                <div className="h-6 w-48 bg-ink-800 rounded-lg"></div>
            </div>
            {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 w-full bg-ink-900/50 rounded-2xl border border-white/5"></div>
            ))}
        </div>
    );
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
    const requestedPage = Number(resolvedParams.page ?? '1');
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = 40;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (categoryFilter) where.category = categoryFilter;
    if (actionFilter) where.action = actionFilter;
    if (providerFilter) where.provider = providerFilter;

    return (
        <div className="px-6 md:px-12 py-12 space-y-8">
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

            <section className="card-panel md:p-8 min-h-[400px]">
                <Suspense fallback={<AuditSkeleton />}>
                    <AuditList
                        where={where}
                        skip={skip}
                        take={pageSize}
                        page={page}
                        categoryFilter={categoryFilter}
                        actionFilter={actionFilter}
                        providerFilter={providerFilter}
                    />
                </Suspense>
            </section>
        </div>
    );
}
