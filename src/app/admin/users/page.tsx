import { prisma } from '../../../lib/prisma';
import { getPasswordPolicy } from '../../../lib/passwordPolicy';
import CreateLocalUserForm from '../../../components/CreateLocalUserForm';
import AdminActionForm from '../../../components/AdminActionForm';
import DeleteUserForm from '../../../components/DeleteUserForm';
import UsersList from '../../../components/UsersList';
import ForcePasswordResetForm from '../../../components/ForcePasswordResetForm';
import RoleMultiSelect from '../../../components/RoleMultiSelect';
import UserSearch from '../../../components/UserSearch';
import Link from 'next/link';
import {
    updateUserRoles,
    createLocalUser,
    deleteUser,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage({
    searchParams,
}: {
    searchParams?: Promise<{ userPage?: string; accessPage?: string; q?: string; error?: string }>;
}) {
    const resolvedParams = await searchParams;
    const pageSize = 5;
    const q = resolvedParams?.q ?? '';

    // Separate page tracking
    const requestedUserPage = Number(resolvedParams?.userPage ?? '1');
    const userPage = Number.isFinite(requestedUserPage) && requestedUserPage > 0 ? requestedUserPage : 1;
    const usersSkip = (userPage - 1) * pageSize;

    const requestedAccessPage = Number(resolvedParams?.accessPage ?? '1');
    const accessPage = Number.isFinite(requestedAccessPage) && requestedAccessPage > 0 ? requestedAccessPage : 1;
    const accessSkip = (accessPage - 1) * pageSize;
    const errorMessage =
        resolvedParams?.error === 'confirm-admin'
            ? 'Confirm the admin grant checkbox before saving admin role changes.'
            : resolvedParams?.error === 'self-admin'
                ? 'You cannot remove your own admin role.'
                : resolvedParams?.error === 'self-delete'
                    ? 'You cannot delete your own account from the admin UI.'
                    : resolvedParams?.error === 'last-admin'
                        ? 'Cannot delete the last remaining admin user.'
                        : null;

    const where = q ? {
        OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
        ]
    } : {};

    const [usersForList, usersForAccess, rolesList, totalUsers, filteredUsersCount, passwordPolicy] = await Promise.all([
        prisma.user.findMany({
            where,
            include: { roles: { include: { role: true } }, accounts: true },
            orderBy: { email: 'asc' },
            skip: usersSkip,
            take: pageSize,
        }),
        prisma.user.findMany({
            include: { roles: { include: { role: true } } },
            orderBy: { email: 'asc' },
            skip: accessSkip,
            take: pageSize,
        }),
        prisma.role.findMany({ orderBy: { name: 'asc' } }),
        prisma.user.count(),
        prisma.user.count({ where }),
        getPasswordPolicy(),
    ]);

    const userTotalPages = Math.max(1, Math.ceil(filteredUsersCount / pageSize));
    const prevUserPage = userPage > 1 ? userPage - 1 : null;
    const nextUserPage = userPage < userTotalPages ? userPage + 1 : null;

    const accessTotalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
    const prevAccessPage = accessPage > 1 ? accessPage - 1 : null;
    const nextAccessPage = accessPage < accessTotalPages ? accessPage + 1 : null;

    const showAccessPaneInline = totalUsers <= 5;

    return (
        <div className="px-6 md:px-12 py-12 space-y-8">
            <section className="card-panel">
                <h1 className="font-serif text-3xl">User management</h1>
                <p className="text-ink-200 mt-2">
                    Create users, assign roles, and manage access.
                </p>
                {errorMessage ? (
                    <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {errorMessage}
                    </div>
                ) : null}
            </section>

            <section className="card-panel md:p-8">
                <h2 className="font-serif text-2xl mb-6">Create local user</h2>
                <CreateLocalUserForm
                    createLocalUser={createLocalUser}
                    roles={rolesList}
                    passwordPolicy={passwordPolicy}
                />
                <p className="text-xs text-ink-300 mt-3">
                    New local users must change their password on first login. Password policy is
                    managed in Settings.
                </p>
            </section>

            <section id="user-access" className="card-panel md:p-8">
                <h2 className="font-serif text-2xl">User access</h2>
                <p className="text-ink-200 mt-2 mb-6">
                    Manage detailed role assignments and permissions for your {totalUsers} users.
                </p>
                <Link href="/admin/users/access#detailed-access" className="btn-primary inline-block">
                    Manage all permissions
                </Link>
            </section>

            <section id="users-list" className="card-panel md:p-8">
                <h2 className="font-serif text-2xl mb-6">Users</h2>
                <UserSearch initialQuery={q} />
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-300">
                    <span>
                        Showing {usersForList.length} of {totalUsers} users
                    </span>
                    <div className="flex items-center gap-2">
                        {prevUserPage ? (
                            <Link
                                href={`/admin/users?userPage=${prevUserPage}${accessPage > 1 ? `&accessPage=${accessPage}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}#users-list`}
                                scroll={false}
                                className="btn-secondary btn-small"
                            >
                                Previous
                            </Link>
                        ) : (
                            <span className="btn-secondary btn-small opacity-50 cursor-not-allowed">
                                Previous
                            </span>
                        )}
                        <span className="text-xs text-ink-400">
                            Page {userPage} of {userTotalPages}
                        </span>
                        {nextUserPage ? (
                            <Link
                                href={`/admin/users?userPage=${nextUserPage}${accessPage > 1 ? `&accessPage=${accessPage}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}#users-list`}
                                scroll={false}
                                className="btn-secondary btn-small"
                            >
                                Next
                            </Link>
                        ) : (
                            <span className="btn-secondary btn-small opacity-50 cursor-not-allowed">
                                Next
                            </span>
                        )}
                    </div>
                </div>
                <UsersList
                    users={usersForList.map((user) => ({
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        roles: user.roles.map((item) => item.role.name),
                        providers: Array.from(new Set(user.accounts.map((account) => account.provider))),
                        isLocal: Boolean(user.passwordHash),
                    }))}
                />
            </section>
        </div>
    );
}
