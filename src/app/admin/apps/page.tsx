import { prisma } from '../../../lib/prisma';
import { randomUUID } from 'crypto';
import DeleteAppForm from '../../../components/DeleteAppForm';
import EditAppForm from '../../../components/EditAppForm';
import NewAppForm from '../../../components/NewAppForm';
import {
    createApp,
    deleteApp,
    updateApp,
    triggerStorageCleanup
} from '../actions';
import StorageCleanupForm from '../../../components/StorageCleanupForm';

export const dynamic = 'force-dynamic';

export default async function AppsPage({
    searchParams,
}: {
    searchParams?: Promise<{ appPage?: string }>;
}) {
    const resolvedParams = await searchParams;
    const pageSize = 50;
    const requestedAppPage = Number(resolvedParams?.appPage ?? '1');
    const appPage =
        Number.isFinite(requestedAppPage) && requestedAppPage > 0 ? requestedAppPage : 1;
    const appsSkip = (appPage - 1) * pageSize;

    const [apps, rolesList, categories, totalApps, users] = await Promise.all([
        prisma.appLink.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                userAccesses: {
                    include: {
                        user: { select: { id: true, name: true, email: true } }
                    }
                }
            },
            skip: appsSkip,
            take: pageSize,
        }),
        prisma.role.findMany({ orderBy: { name: 'asc' } }),
        prisma.appLink.findMany({
            distinct: ['category'],
            select: { category: true },
            where: { category: { not: null } },
            orderBy: { category: 'asc' },
        }),
        prisma.appLink.count(),
        prisma.appLink.count(),
    ]);

    const categoryOptions = categories
        .map((item) => item.category)
        .filter((item): item is string => Boolean(item));

    const categorySelectOptions = [
        { value: 'none', label: 'Select existing' },
        ...categoryOptions.map((category) => ({ value: category, label: category })),
    ];

    const audienceOptions = [
        { value: 'PUBLIC', label: 'Public' },
        { value: 'AUTHENTICATED', label: 'Authenticated' },
        { value: 'ROLE', label: 'Role-based' },
        { value: 'USER', label: 'Specific users' },
    ];

    const roleOptions = [
        { value: '', label: 'No role required (public/authenticated)' },
        ...rolesList.map((role) => ({ value: role.id, label: role.name })),
    ];

    const appTotalPages = Math.max(1, Math.ceil(totalApps / pageSize));
    const prevAppPage = appPage > 1 ? appPage - 1 : null;
    const nextAppPage = appPage < appTotalPages ? appPage + 1 : null;

    return (
        <div className="px-6 md:px-12 py-12 space-y-8">
            <section className="card-panel">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="font-serif text-3xl">App catalogue</h1>
                        <p className="text-ink-200 mt-2">
                            Add, categorise, and manage apps available to users.
                        </p>
                    </div>
                    <StorageCleanupForm action={triggerStorageCleanup} />
                </div>
            </section>

            <section className="card-panel">
                <h2 className="font-serif text-2xl mb-6">Add a new app</h2>
                <NewAppForm
                    categorySelectOptions={categorySelectOptions}
                    audienceOptions={audienceOptions}
                    roleOptions={roleOptions}
                    action={createApp}
                />
            </section>

            <section className="card-panel">
                <h2 className="font-serif text-2xl mb-6">Current catalogue</h2>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-300">
                    <span>
                        Showing {apps.length} of {totalApps} apps
                    </span>
                    <div className="flex items-center gap-2">
                        {prevAppPage ? (
                            <a
                                href={`/admin/apps?appPage=${prevAppPage}`}
                                className="btn-secondary btn-small"
                            >
                                Previous
                            </a>
                        ) : (
                            <span className="btn-secondary btn-small opacity-50 cursor-not-allowed">
                                Previous
                            </span>
                        )}
                        <span className="text-xs text-ink-400">
                            Page {appPage} of {appTotalPages}
                        </span>
                        {nextAppPage ? (
                            <a
                                href={`/admin/apps?appPage=${nextAppPage}`}
                                className="btn-secondary btn-small"
                            >
                                Next
                            </a>
                        ) : (
                            <span className="btn-secondary btn-small opacity-50 cursor-not-allowed">
                                Next
                            </span>
                        )}
                    </div>
                </div>
                <div className="space-y-4">
                    {apps.map((app) => (
                        <div key={app.id} className="card-panel !p-0 overflow-hidden">
                            <details className="group">
                                <summary className="list-none cursor-pointer p-5 block w-full hover:bg-white/5 transition">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-ink-100">{app.name}</p>
                                            <p className="text-xs text-ink-400">{app.url}</p>
                                            {app.category && (
                                                <span className="inline-block mt-1 text-[10px] uppercase tracking-wider text-ocean-400 bg-ocean-500/10 px-2 py-0.5 rounded-full">
                                                    {app.category}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="btn-secondary btn-small group-open:bg-ocean-500/20 group-open:text-ocean-300 transition">
                                                Edit
                                            </span>
                                            <DeleteAppForm id={app.id} name={app.name} action={deleteApp} />
                                        </div>
                                    </div>
                                </summary>

                                <div className="p-5 border-t border-white/5 bg-black/10">
                                    <EditAppForm
                                        app={app}
                                        categorySelectOptions={categorySelectOptions}
                                        audienceOptions={audienceOptions}
                                        roleOptions={roleOptions}
                                        initialUsers={app.userAccesses.map((item) => item.user)}
                                        action={updateApp}
                                    />
                                </div>
                            </details>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
