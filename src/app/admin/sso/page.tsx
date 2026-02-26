import { prisma } from '../../../lib/prisma';
import { randomUUID } from 'crypto';
import { decryptSecret, hasSecretKey } from '../../../lib/crypto';
import SsoConfigForm from '../../../components/SsoConfigForm';
import LinkSsoAccountForm from '../../../components/LinkSsoAccountForm';
import { linkSsoAccount } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SsoPage() {
    const ssoConfigs = await prisma.ssoConfig.findMany();

    const ssoMap = new Map(ssoConfigs.map((item) => [item.provider, item]));

    const azureConfig = ssoMap.get('azure-ad');
    const keycloakConfig = ssoMap.get('keycloak');
    const credentialsConfig = ssoMap.get('credentials');
    const defaultClientId = randomUUID();

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
            source: azureSource,
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
            source: keycloakSource,
        }
        : null;

    const credentialsConfigPayload = credentialsConfig
        ? {
            enabled: credentialsConfig.enabled,
            hasSecret: false,
            updatedAt: credentialsConfig.updatedAt.toISOString(),
            source: credentialsSource,
        }
        : null;



    return (
        <div className="px-6 md:px-12 py-12 space-y-8">
            <section className="card-panel">
                <h1 className="font-serif text-3xl">SSO</h1>
                <p className="text-ink-200 mt-2">
                    Configure single sign-on providers, link accounts, and review audit logs.
                </p>
            </section>

            <section className="card-panel">
                <h2 className="font-serif text-2xl mb-6">SSO configuration</h2>
                <SsoConfigForm
                    azure={azureConfigPayload}
                    keycloak={keycloakConfigPayload}
                    credentials={credentialsConfigPayload}
                    hasMasterKey={canValidateSecrets}
                    defaultClientId={defaultClientId}
                />
            </section>

            <section className="card-panel">
                <h2 className="font-serif text-2xl mb-6">Link SSO account</h2>
                <LinkSsoAccountForm linkSsoAccount={linkSsoAccount} />
                <p className="text-xs text-ink-300 mt-3">
                    Linking removes local passwords and converts the user to SSO-only.
                </p>
            </section>


        </div>
    );
}
