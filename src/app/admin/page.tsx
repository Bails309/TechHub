import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { getServerAuthSession } from '@/lib/auth';
import { decryptSecret, hasSecretKey } from '@/lib/crypto';
import DeleteAppForm from '@/components/DeleteAppForm';
import EditAppForm from '@/components/EditAppForm';
import NewAppForm from '@/components/NewAppForm';
import SsoConfigForm from '@/components/SsoConfigForm';
import SsoRotationForm from '@/components/SsoRotationForm';
import CreateLocalUserForm from '@/components/CreateLocalUserForm';
import LinkSsoAccountForm from '@/components/LinkSsoAccountForm';
import UsersList from '@/components/UsersList';
import AdminActionForm from '@/components/AdminActionForm';
import {
  createApp,
  deleteApp,
  updateApp,
  updateUserRoles,
  createRole,
  deleteRole,
  createLocalUser,
  linkSsoAccount,
  updatePasswordPolicy,
  rotateSsoSecretsAction
} from './actions';


export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; page?: string; appPage?: string }>;
}) {
  const resolvedParams = await searchParams;
  const pageSize = 50;
  const requestedPage = Number(resolvedParams?.page ?? '1');
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const usersSkip = (page - 1) * pageSize;
  const requestedAppPage = Number(resolvedParams?.appPage ?? '1');
  const appPage =
    Number.isFinite(requestedAppPage) && requestedAppPage > 0 ? requestedAppPage : 1;
  const appsSkip = (appPage - 1) * pageSize;
  const session = await getServerAuthSession();
  const roles = session?.user?.roles ?? [];
  const errorMessage =
    resolvedParams?.error === 'confirm-admin'
      ? 'Confirm the admin grant checkbox before saving admin role changes.'
      : resolvedParams?.error === 'self-admin'
        ? 'You cannot remove your own admin role.'
        : null;

  if (!session || !roles.includes('admin')) {
    return (
      <div className="px-6 md:px-12 py-16">
        <div className="glass rounded-[32px] p-8 max-w-xl">
          <h1 className="font-serif text-2xl">Admin access required</h1>
          <p className="text-ink-200 mt-4">
            Your account does not have permission to manage the app catalogue.
          </p>
        </div>
      </div>
    );
  }

  const [
    apps,
    rolesList,
    categories,
    ssoConfigs,
    users,
    passwordPolicy,
    totalUsers,
    totalApps,
    rotationHistory
  ] =
    await Promise.all([
      prisma.appLink.findMany({
        orderBy: { createdAt: 'desc' },
        include: { userAccesses: true },
        skip: appsSkip,
        take: pageSize
      }),
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
    prisma.appLink.findMany({
      distinct: ['category'],
      select: { category: true },
      where: { category: { not: null } },
      orderBy: { category: 'asc' }
    }),
    prisma.ssoConfig.findMany(),
    prisma.user.findMany({
      include: { roles: { include: { role: true } }, accounts: true },
      orderBy: { email: 'asc' },
      skip: usersSkip,
      take: pageSize
    }),
    prisma.passwordPolicy.findFirst(),
      prisma.user.count(),
      prisma.appLink.count(),
      prisma.ssoAudit.findMany({
        where: { action: 'rotate' },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

  const ssoMap = new Map(ssoConfigs.map((item) => [item.provider, item]));

  const azureConfig = ssoMap.get('azure-ad');
  const keycloakConfig = ssoMap.get('keycloak');
  const credentialsConfig = ssoMap.get('credentials');
  const defaultClientId = randomUUID();

  const azureSource: 'db' | 'env' | null = azureConfig
    ? 'db'
    : process.env.AZURE_AD_CLIENT_ID
      ? 'env'
      : null;
  const keycloakSource: 'db' | 'env' | null = keycloakConfig
    ? 'db'
    : process.env.KEYCLOAK_CLIENT_ID
      ? 'env'
      : null;
  const credentialsSource: 'db' | 'env' | null = credentialsConfig
    ? 'db'
    : process.env.ENABLE_CREDENTIALS === 'false'
      ? null
      : 'env';

  const canValidateSecrets = hasSecretKey();
  const azureSecretValid =
    azureConfig?.clientSecretEnc && canValidateSecrets
      ? (() => {
          try {
            decryptSecret(azureConfig.clientSecretEnc);
            return true;
          } catch {
            return false;
          }
        })()
      : null;
  const keycloakSecretValid =
    keycloakConfig?.clientSecretEnc && canValidateSecrets
      ? (() => {
          try {
            decryptSecret(keycloakConfig.clientSecretEnc);
            return true;
          } catch {
            return false;
          }
        })()
      : null;

  const azureConfigPayload = azureConfig
    ? {
        enabled: azureConfig.enabled,
        clientId: (azureConfig.config as Record<string, unknown> | null)?.clientId as
          | string
          | undefined,
        tenantId: (azureConfig.config as Record<string, unknown> | null)?.tenantId as
          | string
          | undefined,
        hasSecret: Boolean(azureConfig.clientSecretEnc),
        secretValid: azureSecretValid,
        updatedAt: azureConfig.updatedAt.toISOString(),
        source: azureSource
      }
    : null;

  const keycloakConfigPayload = keycloakConfig
    ? {
        enabled: keycloakConfig.enabled,
        clientId: (keycloakConfig.config as Record<string, unknown> | null)?.clientId as
          | string
          | undefined,
        issuer: (keycloakConfig.config as Record<string, unknown> | null)?.issuer as
          | string
          | undefined,
        hasSecret: Boolean(keycloakConfig.clientSecretEnc),
        secretValid: keycloakSecretValid,
        updatedAt: keycloakConfig.updatedAt.toISOString(),
        source: keycloakSource
      }
    : null;

  const credentialsConfigPayload = credentialsConfig
    ? {
        enabled: credentialsConfig.enabled,
        hasSecret: false,
        updatedAt: credentialsConfig.updatedAt.toISOString(),
        source: credentialsSource
      }
    : null;

  const categoryOptions = categories
    .map((item) => item.category)
    .filter((item): item is string => Boolean(item));

  const categorySelectOptions = [
    { value: 'none', label: 'Select existing' },
    ...categoryOptions.map((category) => ({ value: category, label: category }))
  ];

  const audienceOptions = [
    { value: 'PUBLIC', label: 'Public' },
    { value: 'AUTHENTICATED', label: 'Authenticated' },
    { value: 'ROLE', label: 'Role-based' },
    { value: 'USER', label: 'Specific users' }
  ];

  const roleOptions = [
    { value: '', label: 'No role required (public/authenticated)' },
    ...rolesList.map((role) => ({ value: role.id, label: role.name }))
  ];

  const userOptions = users
    .filter((user) => Boolean(user.email))
    .map((user) => ({
      value: user.id,
      label: user.name ? `${user.name} (${user.email})` : user.email ?? user.id
    }));

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const appTotalPages = Math.max(1, Math.ceil(totalApps / pageSize));
  const prevAppPage = appPage > 1 ? appPage - 1 : null;
  const nextAppPage = appPage < appTotalPages ? appPage + 1 : null;

  return (
    <div className="px-6 md:px-12 py-12 space-y-8">
      <section className="glass rounded-[36px] p-8">
        <h1 className="font-serif text-3xl">Admin command centre</h1>
        <p className="text-ink-200 mt-2">
          Add, categorise, and lock apps to the right audiences.
        </p>
        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}
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
        <h2 className="font-serif text-2xl mb-6">SSO configuration</h2>
        <SsoConfigForm
          azure={azureConfigPayload}
          keycloak={keycloakConfigPayload}
          credentials={credentialsConfigPayload}
          hasMasterKey={hasSecretKey()}
          defaultClientId={defaultClientId}
        />
      </section>

      <section className="glass rounded-[36px] p-8">
        <h2 className="font-serif text-2xl mb-6">SSO key rotation</h2>
        <SsoRotationForm rotateSsoSecrets={rotateSsoSecretsAction} />
        <div className="mt-6 space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-400">
            Recent rotation runs
          </p>
          {rotationHistory.length ? (
            <div className="space-y-2">
              {rotationHistory.map((entry) => {
                const changes = (entry.changes ?? {}) as Record<string, unknown>;
                const updated = typeof changes.updated === 'number' ? changes.updated : null;
                const skipped = typeof changes.skipped === 'number' ? changes.skipped : null;
                const failed = typeof changes.failed === 'number' ? changes.failed : null;
                const targetKeyId =
                  typeof changes.targetKeyId === 'string' ? changes.targetKeyId : null;
                const fromKeyId = typeof changes.fromKeyId === 'string' ? changes.fromKeyId : null;
                const trigger = typeof changes.trigger === 'string' ? changes.trigger : 'unknown';
                const dryRun = changes.dryRun === true ? 'dry run' : 'applied';

                return (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-ink-800 px-4 py-3 text-xs text-ink-200"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold text-ink-100">{trigger}</span>
                      <span>{dryRun}</span>
                      <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-2 text-ink-300">
                      Updated: {updated ?? '-'} · Skipped: {skipped ?? '-'} · Failed: {failed ?? '-'}
                    </div>
                    <div className="mt-1 text-ink-300">
                      Target key: {targetKeyId ?? '-'}
                      {fromKeyId ? ` · From key: ${fromKeyId}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-ink-300">No rotation runs recorded yet.</p>
          )}
        </div>
      </section>

      <section className="glass rounded-[36px] p-8">
        <h2 className="font-serif text-2xl mb-6">Roles</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <AdminActionForm
            action={createRole}
            successMessage="Role saved."
            className="space-y-3"
          >
            <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
              Add role
            </label>
            <input
              name="name"
              placeholder="role name"
              className="input-surface w-full rounded-full px-4 py-2 text-sm text-ink-100"
            />
            <button
              type="submit"
              className="rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
            >
              Create role
            </button>
          </AdminActionForm>
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-ink-400">Remove role</p>
            <div className="space-y-2">
              {rolesList.map((role) => (
                <AdminActionForm
                  key={role.id}
                  action={deleteRole}
                  successMessage="Role deleted."
                  className="flex items-center gap-3"
                >
                  <input type="hidden" name="roleId" value={role.id} />
                  <span className="text-sm text-ink-200">{role.name}</span>
                  <button
                    type="submit"
                    disabled={role.name === 'admin'}
                    className="ml-auto rounded-full border border-ink-700 px-3 py-1 text-xs text-ink-200 hover:border-ink-400 transition disabled:opacity-50"
                  >
                    Delete
                  </button>
                </AdminActionForm>
              ))}
            </div>
            <p className="text-xs text-ink-400">
              Roles must be unassigned from users and apps before deletion.
            </p>
          </div>
        </div>
      </section>

      <section className="glass rounded-[36px] p-8">
        <h2 className="font-serif text-2xl mb-6">Create local user</h2>
        <CreateLocalUserForm createLocalUser={createLocalUser} roles={rolesList} />
        <p className="text-xs text-ink-300 mt-3">
          New local users must change their password on first login. Password policy is
          managed below.
        </p>
      </section>

      <section className="glass rounded-[36px] p-8">
        <h2 className="font-serif text-2xl mb-6">Link SSO account</h2>
        <LinkSsoAccountForm linkSsoAccount={linkSsoAccount} />
        <p className="text-xs text-ink-300 mt-3">
          Linking removes local passwords and converts the user to SSO-only.
        </p>
      </section>

      <section className="glass rounded-[36px] p-8">
        <h2 className="font-serif text-2xl mb-6">Password policy</h2>
        <AdminActionForm
          action={updatePasswordPolicy}
          successMessage="Password policy saved."
          className="space-y-4"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
                Minimum password length
              </label>
              <input
                name="minLength"
                type="number"
                min={8}
                max={64}
                defaultValue={passwordPolicy?.minLength ?? 12}
                className="input-surface rounded-full px-4 py-2 text-sm text-ink-100"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-ink-400">
                Password history depth
              </label>
              <input
                name="historyCount"
                type="number"
                min={0}
                max={20}
                defaultValue={passwordPolicy?.historyCount ?? 5}
                className="input-surface rounded-full px-4 py-2 text-sm text-ink-100"
              />
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                name="requireUpper"
                defaultChecked={passwordPolicy?.requireUpper ?? true}
                className="h-4 w-4"
              />
              Require uppercase letters
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                name="requireLower"
                defaultChecked={passwordPolicy?.requireLower ?? true}
                className="h-4 w-4"
              />
              Require lowercase letters
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                name="requireNumber"
                defaultChecked={passwordPolicy?.requireNumber ?? true}
                className="h-4 w-4"
              />
              Require numbers
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                name="requireSymbol"
                defaultChecked={passwordPolicy?.requireSymbol ?? true}
                className="h-4 w-4"
              />
              Require symbols
            </label>
          </div>
          <button
            type="submit"
            className="rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
          >
            Save policy
          </button>
        </AdminActionForm>
      </section>

      <section className="glass rounded-[36px] p-8">
        <h2 className="font-serif text-2xl mb-6">User access</h2>
        <p className="text-sm text-ink-200 mb-6">
          Signed-in users see public + authenticated apps. Assign roles below to unlock
          role-based apps and admin access.
        </p>
        <div className="space-y-4">
          {users.map((user) => {
            const currentRoles = new Set(user.roles.map((item) => item.roleId));
            return (
              <AdminActionForm
                key={user.id}
                action={updateUserRoles}
                successMessage="Roles saved."
                className="rounded-2xl border border-ink-800 px-5 py-4 space-y-4"
              >
                <input type="hidden" name="userId" value={user.id} />
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold">
                      {user.name ?? user.email ?? 'Unnamed user'}
                    </p>
                    <p className="text-xs text-ink-400">{user.email ?? 'No email'}</p>
                    <p className="text-xs text-ink-300">
                      Current roles: {user.roles.length ? user.roles.map((item) => item.role.name).join(', ') : 'None'}
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
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
            );
          })}
        </div>
      </section>

      <section className="glass rounded-[36px] p-8">
        <h2 className="font-serif text-2xl mb-6">Users</h2>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-300">
          <span>
            Showing {users.length} of {totalUsers} users
          </span>
          <div className="flex items-center gap-2">
            {prevPage ? (
              <a
                href={`/admin?page=${prevPage}&appPage=${appPage}`}
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
              Page {page} of {totalPages}
            </span>
            {nextPage ? (
              <a
                href={`/admin?page=${nextPage}&appPage=${appPage}`}
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
        <UsersList
          users={users.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            roles: user.roles.map((item) => item.role.name),
            providers: Array.from(new Set(user.accounts.map((account) => account.provider))),
            isLocal: Boolean(user.passwordHash)
          }))}
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
                href={`/admin?appPage=${prevAppPage}&page=${page}`}
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
                href={`/admin?appPage=${nextAppPage}&page=${page}`}
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
