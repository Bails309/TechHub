import { prisma } from '../../../lib/prisma';
import { randomUUID } from 'crypto';
import DeleteAppForm from '../../../components/DeleteAppForm';
import EditAppForm from '../../../components/EditAppForm';
import NewAppForm from '../../../components/NewAppForm';
import {
    createApp,
    deleteApp,
    updateApp,
} from '../actions';

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
            include: { userAccesses: true },
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
        prisma.user.findMany({
            select: { id: true, name: true, email: true },
            orderBy: { email: 'asc' },
        }),
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

    const userOptions = users
        .filter((user) => Boolean(user.email))
        .map((user) => ({
            value: user.id,
            label: user.name ? `${user.name} (${user.email})` : user.email ?? user.id,
        }));

    const appTotalPages = Math.max(1, Math.ceil(totalApps / pageSize));
    const prevAppPage = appPage > 1 ? appPage - 1 : null;
    const nextAppPage = appPage < appTotalPages ? appPage + 1 : null;

    return (
        <div className="px-6 md:px-12 py-12 space-y-8">
            <section className="glass rounded-[36px] p-8">
                <h1 className="font-serif text-3xl">App catalogue</h1>
                <p className="text-ink-200 mt-2">
                    Add, categorise, and manage apps available to users.
                </p>
            </section>

            <section className="glass rounded-[36px] p-8">
                <h2 className="font-serif text-2xl mb-6">Add a new app</h2>
                <NewAppForm
                    categorySelectOptions={categorySelectOptions}
                    audienceOptions={audienceOptions}
                    roleOptions={roleOptions}
                    userOptions={userOptions}
                    action={createApp}
                />
            </section>

            <section className="glass rounded-[36px] p-8">
                <h2 className="font-serif text-2xl mb-6">Current catalogue</h2>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-300">
                    <span>
                        Showing {apps.length} of {totalApps} apps
                    </span>
                    <div className="flex items-center gap-2">
                        {prevAppPage ? (
                            <a
                                href={`/admin/apps?appPage=${prevAppPage}`}
                                className="rounded-full border border-ink-700 px-3 py-1 text-xs text-ink-200 hover:border-ink-400 transition"
                            >
                                Previous
                            </a>
                        ) : (
                            <span className="rounded-full border border-ink-800 px-3 py-1 text-xs text-ink-500">
                                Previous
                            </span>
                        )}
                        <span className="text-xs text-ink-400">
                            Page {appPage} of {appTotalPages}
                        </span>
                        {nextAppPage ? (
                            <a
                                href={`/admin/apps?appPage=${nextAppPage}`}
                                className="rounded-full border border-ink-700 px-3 py-1 text-xs text-ink-200 hover:border-ink-400 transition"
                            >
                                Next
                            </a>
                        ) : (
                            <span className="rounded-full border border-ink-800 px-3 py-1 text-xs text-ink-500">
                                Next
                            </span>
                        )}
                    </div>
                </div>
                <div className="space-y-4">
                    {apps.map((app) => (
                        <div
                            key={app.id}
                            className="rounded-2xl border border-ink-800 px-5 py-4 space-y-4"
                        >
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                    <p className="font-semibold">{app.name}</p>
                                    <p className="text-xs text-ink-400">{app.url}</p>
                                    {app.category ? (
                                        <p className="text-xs text-ink-300">{app.category}</p>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-3">
                                    <details className="group">
                                        <summary className="cursor-pointer list-none rounded-full border border-ink-700 px-4 py-2 text-xs text-ink-200 hover:border-ink-400 transition">
                                            Edit
                                        </summary>
                                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                                            <EditAppForm
                                                app={app}
                                                categorySelectOptions={categorySelectOptions}
                                                audienceOptions={audienceOptions}
                                                roleOptions={roleOptions}
                                                userOptions={userOptions}
                                                assignedUserIds={app.userAccesses.map((item) => item.userId)}
                                                action={updateApp}
                                            />
                                        </div>
                                    </details>
                                    <DeleteAppForm id={app.id} name={app.name} action={deleteApp} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
