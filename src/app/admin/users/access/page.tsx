import { prisma } from '../../../../lib/prisma';
import AdminActionForm from '../../../../components/AdminActionForm';
import RoleMultiSelect from '../../../../components/RoleMultiSelect';
import ForcePasswordResetForm from '../../../../components/ForcePasswordResetForm';
import DeleteUserForm from '../../../../components/DeleteUserForm';
import UserSearch from '../../../../components/UserSearch';
import Link from 'next/link';
import {
    updateUserRoles,
    deleteUser,
} from '../../actions';

export const dynamic = 'force-dynamic';

export default async function UserAccessPage({
    searchParams,
}: {
    searchParams?: Promise<{ accessPage?: string; q?: string; error?: string }>;
}) {
    const resolvedParams = await searchParams;
    const pageSize = 5; // Reduced to 5 as requested
    const q = resolvedParams?.q ?? '';
    const requestedAccessPage = Number(resolvedParams?.accessPage ?? '1');
    const accessPage = Number.isFinite(requestedAccessPage) && requestedAccessPage > 0 ? requestedAccessPage : 1;
    const accessSkip = (accessPage - 1) * pageSize;

    const errorMessage =
        resolvedParams?.error === 'confirm-admin'
            ? 'Confirm the admin grant checkbox before saving admin role changes.'
            : resolvedParams?.error === 'self-admin'
                ? 'You cannot remove your own admin role.'
                : resolvedParams?.error === 'self-delete'
                    ? 'You cannot delete your own account.'
                    : resolvedParams?.error === 'last-admin'
                        ? 'Cannot delete the last remaining admin user.'
                        : null;

    const where = q ? {
        OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
        ]
    } : {};

    const [users, rolesList, filteredUsersCount] = await Promise.all([
        prisma.user.findMany({
            where,
            include: { roles: { include: { role: true } } },
            orderBy: { email: 'asc' },
            skip: accessSkip,
            take: pageSize,
        }),
        prisma.role.findMany({ orderBy: { name: 'asc' } }),
        prisma.user.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(filteredUsersCount / pageSize));
    const prevPage = accessPage > 1 ? accessPage - 1 : null;
    const nextPage = accessPage < totalPages ? accessPage + 1 : null;

    return (
        <div className="px-6 md:px-12 py-12 space-y-8">
            <section className="card-panel">
                <div className="flex items-center gap-4 mb-2">
                    <Link href="/admin/users#user-access" className="text-ocean-400 hover:text-ocean-300 text-sm flex items-center gap-1">
                        ← Back to User Management
                    </Link>
                </div>
                <h1 className="font-serif text-3xl">Detailed user access</h1>
                <p className="text-ink-200 mt-2">
                    Manage role-based permissions and account security for all users.
                </p>
                {errorMessage && (
                    <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {errorMessage}
                    </div>
                )}
            </section>

            <section id="detailed-access" className="card-panel md:p-8">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-4 w-full md:w-auto">
                        <h2 className="font-serif text-2xl">Manage permissions</h2>
                        <UserSearch initialQuery={q} anchor="detailed-access" />
                    </div>
                    <div className="flex items-center gap-2">
                        {prevPage ? (
                            <Link href={`/admin/users/access?accessPage=${prevPage}${q ? `&q=${encodeURIComponent(q)}` : ''}#detailed-access`} scroll={false} className="btn-secondary btn-small">Previous</Link>
                        ) : (
                            <span className="btn-secondary btn-small opacity-50 cursor-not-allowed">Previous</span>
                        )}
                        <span className="text-xs text-ink-400">Page {accessPage} of {totalPages}</span>
                        {nextPage ? (
                            <Link href={`/admin/users/access?accessPage=${nextPage}${q ? `&q=${encodeURIComponent(q)}` : ''}#detailed-access`} scroll={false} className="btn-secondary btn-small">Next</Link>
                        ) : (
                            <span className="btn-secondary btn-small opacity-50 cursor-not-allowed">Next</span>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    {users.map((user) => {
                        const currentRoles = new Set(user.roles.map((item) => item.roleId));
                        return (
                            <div key={user.id} className="card-panel !bg-white/5 border-white/5">
                                <AdminActionForm
                                    action={updateUserRoles}
                                    successMessage="Roles saved."
                                    className="space-y-4"
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
                                                Current: {user.roles.length ? user.roles.map((item) => item.role.name).join(', ') : 'None'}
                                            </p>
                                        </div>
                                        <button type="submit" className="btn-primary btn-small shrink-0">
                                            Save roles
                                        </button>
                                    </div>
                                    <RoleMultiSelect
                                        options={rolesList.map(r => ({ value: r.id, label: r.name }))}
                                        initialSelected={Array.from(currentRoles)}
                                    />
                                    <label className="flex items-center gap-2 text-[10px] text-ink-400 uppercase tracking-wider">
                                        <input type="checkbox" name="confirmAdminGrant" className="h-3 w-3" />
                                        Confirm admin grant
                                    </label>
                                </AdminActionForm>

                                <div className="mt-6 pt-6 border-t border-white/5 flex flex-wrap items-center justify-between gap-4">
                                    {user.passwordHash && <ForcePasswordResetForm userId={user.id} />}
                                    <DeleteUserForm action={deleteUser} userId={user.id} userEmail={user.email} />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-8 flex justify-center gap-2">
                    {prevPage && <Link href={`/admin/users/access?accessPage=${prevPage}${q ? `&q=${encodeURIComponent(q)}` : ''}#detailed-access`} scroll={false} className="btn-secondary btn-small px-6">Previous</Link>}
                    {nextPage && <Link href={`/admin/users/access?accessPage=${nextPage}${q ? `&q=${encodeURIComponent(q)}` : ''}#detailed-access`} scroll={false} className="btn-secondary btn-small px-6">Next</Link>}
                </div>
            </section>
        </div>
    );
}
