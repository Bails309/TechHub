import { prisma } from '../../../lib/prisma';
import CreateLocalUserForm from '../../../components/CreateLocalUserForm';
import AdminActionForm from '../../../components/AdminActionForm';
import DeleteUserForm from '../../../components/DeleteUserForm';
import UsersList from '../../../components/UsersList';
import ForcePasswordResetForm from '../../../components/ForcePasswordResetForm';
import {
    updateUserRoles,
    createLocalUser,
    deleteUser,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage({
    searchParams,
}: {
    searchParams?: Promise<{ page?: string; error?: string }>;
}) {
    const resolvedParams = await searchParams;
    const pageSize = 50;
    const requestedPage = Number(resolvedParams?.page ?? '1');
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const usersSkip = (page - 1) * pageSize;
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

    const [users, rolesList, totalUsers] = await Promise.all([
        prisma.user.findMany({
            include: { roles: { include: { role: true } }, accounts: true },
            orderBy: { email: 'asc' },
            skip: usersSkip,
            take: pageSize,
        }),
        prisma.role.findMany({ orderBy: { name: 'asc' } }),
        prisma.user.count(),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
    const prevPage = page > 1 ? page - 1 : null;
    const nextPage = page < totalPages ? page + 1 : null;

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
                <CreateLocalUserForm createLocalUser={createLocalUser} roles={rolesList} />
                <p className="text-xs text-ink-300 mt-3">
                    New local users must change their password on first login. Password policy is
                    managed in Settings.
                </p>
            </section>

            <section className="card-panel md:p-8">
                <h2 className="font-serif text-2xl mb-6">User access</h2>
                <p className="text-sm text-ink-200 mb-6">
                    Signed-in users see public + authenticated apps. Assign roles below to unlock
                    role-based apps and admin access.
                </p>
                <div className="space-y-4">
                    {users.map((user) => {
                        const currentRoles = new Set(user.roles.map((item) => item.roleId));
                        return (
                            <div key={user.id} className="space-y-3">
                                <AdminActionForm
                                    action={updateUserRoles}
                                    successMessage="Roles saved."
                                    className="rounded-2xl border border-ink-800 px-5 py-4 space-y-4"
                                >
                                    <input type="hidden" name="userId" value={user.id} />
                                    {user.roles.map((ur) => (
                                        <input key={ur.roleId} type="hidden" name="previousRoles" value={ur.roleId} />
                                    ))}
                                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <p className="font-semibold">{user.name ?? user.email ?? 'Unnamed user'}</p>
                                            <p className="text-xs text-ink-400">{user.email ?? 'No email'}</p>
                                            <p className="text-xs text-ink-300">
                                                Current roles: {user.roles.length ? user.roles.map((item) => item.role.name).join(', ') : 'None'}
                                            </p>
                                        </div>
                                        <button
                                            type="submit"
                                            className="btn-primary btn-small"
                                        >
                                            Save roles
                                        </button>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-3">
                                        {rolesList.map((role) => (
                                            <label key={role.id} className="flex items-center gap-2 text-sm text-ink-200">
                                                <input
                                                    type="checkbox"
                                                    name="roles"
                                                    value={role.id}
                                                    defaultChecked={currentRoles.has(role.id)}
                                                    className="h-4 w-4"
                                                />
                                                {role.name}
                                            </label>
                                        ))}
                                    </div>
                                    <label className="flex items-center gap-2 text-xs text-ink-300">
                                        <input type="checkbox" name="confirmAdminGrant" className="h-4 w-4" />
                                        Confirm granting admin role (required when adding admin)
                                    </label>
                                </AdminActionForm>

                                {user.passwordHash && (
                                    <ForcePasswordResetForm userId={user.id} />
                                )}

                                <div className="flex justify-end">
                                    <DeleteUserForm action={deleteUser} userId={user.id} userEmail={user.email} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="card-panel md:p-8">
                <h2 className="font-serif text-2xl mb-6">Users</h2>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-300">
                    <span>
                        Showing {users.length} of {totalUsers} users
                    </span>
                    <div className="flex items-center gap-2">
                        {prevPage ? (
                            <a
                                href={`/admin/users?page=${prevPage}`}
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
                            Page {page} of {totalPages}
                        </span>
                        {nextPage ? (
                            <a
                                href={`/admin/users?page=${nextPage}`}
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
                <UsersList
                    users={users.map((user) => ({
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
