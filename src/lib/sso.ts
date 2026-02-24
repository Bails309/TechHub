import { prisma } from './prisma';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { decryptSecret } from './crypto';
import { unstable_cache } from 'next/cache';

export type SsoProviderId = 'azure-ad' | 'keycloak' | 'credentials';

export interface SsoConfigEntry {
  provider: SsoProviderId;
  enabled: boolean;
  config: Record<string, unknown> | null;
  clientSecret: string | null;
}

const loadSsoConfigs = unstable_cache(
  () => prisma.ssoConfig.findMany(),
  ['sso-config'],
  { tags: ['sso-config'] }
);

export async function getSsoConfigMap() {
  return getSsoConfigMapWithDeps(loadSsoConfigs, decryptSecret);
}

export async function getSsoConfigMapWithDeps(
  loadFn: () => Promise<Array<{ provider: string; enabled: boolean; config: unknown; clientSecretEnc: string | null }>> = loadSsoConfigs,
  decryptFn: (enc: string) => string | null = decryptSecret
) {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return new Map();
  }
  let rows: Array<{ provider: string; enabled: boolean; config: unknown; clientSecretEnc: string | null }> = [];
  try {
    rows = await loadFn();
  } catch {
    return new Map();
  }
  const map = new Map<SsoProviderId, SsoConfigEntry>();

  for (const row of rows) {
    const provider = row.provider as SsoProviderId;
    let clientSecret: string | null = null;
    if (row.clientSecretEnc) {
      try {
        clientSecret = decryptFn(row.clientSecretEnc);
      } catch {
        throw new Error('FATAL: Failed to decrypt SSO secrets. Check SSO_MASTER_KEY.');
      }
      if (!clientSecret) {
        throw new Error('FATAL: Failed to decrypt SSO secrets. Check SSO_MASTER_KEY.');
      }
    }
    map.set(provider, {
      provider,
      enabled: row.enabled,
      config: row.config as Record<string, unknown> | null,
      clientSecret
    });
  }

  return map;
}
