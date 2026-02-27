import { prisma } from '../../../lib/prisma';
import { decryptSecret, hasSecretKey } from '../../../lib/crypto';
import StorageConfigForm from '../../../components/StorageConfigForm';
import AdminActionForm from '../../../components/AdminActionForm';
import {
    createRole,
    deleteRole,
    updatePasswordPolicy,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
    const [rolesList, passwordPolicy, storageConfigs] = await Promise.all([
        prisma.role.findMany({ orderBy: { name: 'asc' } }),
        prisma.passwordPolicy.findFirst(),
        prisma.storageConfig.findMany(),
    ]);

    const storageMap = new Map(storageConfigs.map((item) => [item.provider, item]));
    const canValidateSecrets = hasSecretKey();

    const azureStorageConfig = storageMap.get('azure');
    const s3StorageConfig = storageMap.get('s3');
    const localStorageConfig = storageMap.get('local');

    const azureStorageSecretValid =
        azureStorageConfig?.secretEnc && canValidateSecrets
            ? (() => {
                try {
                    decryptSecret(azureStorageConfig.secretEnc);
                    return true;
                } catch {
                    return false;
                }
            })()
            : null;
    const s3StorageSecretValid =
        s3StorageConfig?.secretEnc && canValidateSecrets
            ? (() => {
                try {
                    decryptSecret(s3StorageConfig.secretEnc);
                    return true;
                } catch {
                    return false;
                }
            })()
            : null;

    const azureStorageSource: 'db' | 'env' | null = azureStorageConfig
        ? 'db'
        : process.env.AZURE_STORAGE_CONNECTION_STRING ||
            (process.env.AZURE_STORAGE_ACCOUNT && process.env.AZURE_STORAGE_KEY && process.env.AZURE_BLOB_CONTAINER)
            ? 'env'
            : null;

    const s3EnvConfigured = Boolean(process.env.S3_BUCKET);
    const s3StorageSource: 'db' | 'env' | null = s3StorageConfig
        ? 'db'
        : s3EnvConfigured
            ? 'env'
            : null;

    const localStorageSource: 'db' | 'env' | null = localStorageConfig
        ? 'db'
        : process.env.STORAGE_PROVIDER === 'local' || !process.env.STORAGE_PROVIDER
            ? 'env'
            : null;

    const azureStorageConfigPayload = azureStorageConfig
        ? {
            enabled: azureStorageConfig.enabled,
            container: (azureStorageConfig.config as Record<string, unknown> | null)?.container as string | undefined,
            account: (azureStorageConfig.config as Record<string, unknown> | null)?.account as string | undefined,
            endpoint: (azureStorageConfig.config as Record<string, unknown> | null)?.endpoint as string | undefined,
            authMode: (azureStorageConfig.config as Record<string, unknown> | null)?.authMode as
                | 'connection-string'
                | 'account-key'
                | undefined,
            hasSecret: Boolean(azureStorageConfig.secretEnc),
            secretValid: azureStorageSecretValid,
            updatedAt: azureStorageConfig.updatedAt.toISOString(),
            source: azureStorageSource,
        }
        : null;

    const s3StorageConfigPayload = s3StorageConfig
        ? {
            enabled: s3StorageConfig.enabled,
            bucket: (s3StorageConfig.config as Record<string, unknown> | null)?.bucket as string | undefined,
            region: (s3StorageConfig.config as Record<string, unknown> | null)?.region as string | undefined,
            endpoint: (s3StorageConfig.config as Record<string, unknown> | null)?.endpoint as string | undefined,
            accessKeyId: (s3StorageConfig.config as Record<string, unknown> | null)?.accessKeyId as string | undefined,
            forcePathStyle: (s3StorageConfig.config as Record<string, unknown> | null)?.forcePathStyle as boolean | undefined,
            hasSecret: Boolean(s3StorageConfig.secretEnc),
            secretValid: s3StorageSecretValid,
            updatedAt: s3StorageConfig.updatedAt.toISOString(),
            source: s3StorageSource,
        }
        : null;

    const localStorageConfigPayload = localStorageConfig
        ? {
            enabled: localStorageConfig.enabled,
            hasSecret: false,
            updatedAt: localStorageConfig.updatedAt.toISOString(),
            source: localStorageSource,
        }
        : null;

    const activeStorageProvider: 'local' | 's3' | 'azure' = storageMap.get('s3')?.enabled
        ? 's3'
        : storageMap.get('azure')?.enabled
            ? 'azure'
            : storageMap.get('local')?.enabled
                ? 'local'
                : (process.env.STORAGE_PROVIDER as 'local' | 's3' | 'azure') || 'local';

    return (
        <div className="px-6 md:px-12 py-12 space-y-8">
            <section className="card-panel">
                <h1 className="font-serif text-3xl">Settings</h1>
                <p className="text-ink-200 mt-2">
                    Manage roles, password policy, and upload storage configuration.
                </p>
            </section>

            <section className="card-panel md:p-8">
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
                            className="input-field"
                        />
                        <button
                            type="submit"
                            className="btn-primary btn-small"
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
                                        className="btn-secondary btn-small ml-auto"
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

            <section className="card-panel md:p-8">
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
                                className="input-field"
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
                                className="input-field"
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
                        className="btn-primary btn-small"
                    >
                        Save policy
                    </button>
                </AdminActionForm>
            </section>

            <section className="card-panel md:p-8">
                <h2 className="font-serif text-2xl mb-6">Upload storage</h2>
                <StorageConfigForm
                    activeProvider={activeStorageProvider}
                    local={localStorageConfigPayload}
                    s3={s3StorageConfigPayload}
                    azure={azureStorageConfigPayload}
                    hasMasterKey={canValidateSecrets}
                />
            </section>
        </div>
    );
}
