import { prisma } from './prisma';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { decryptSecret } from './crypto';

export type SsoProviderId = 'azure-ad' | 'keycloak' | 'credentials';

export interface SsoConfigEntry {
  provider: SsoProviderId;
  enabled: boolean;
  config: Record<string, unknown> | null;
  clientSecret: string | null;
}

export async function getSsoConfigMap() {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return new Map();
  }
  let rows: Array<{ provider: string; enabled: boolean; config: unknown; clientSecretEnc: string | null }> = [];
  try {
    rows = await prisma.ssoConfig.findMany();
  } catch {
    return new Map();
  }
  const map = new Map<SsoProviderId, SsoConfigEntry>();

  for (const row of rows) {
    const provider = row.provider as SsoProviderId;
    let clientSecret: string | null = null;
    if (row.clientSecretEnc) {
      try {
        clientSecret = decryptSecret(row.clientSecretEnc);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        console.warn(`SSO secret decrypt failed for provider: ${row.provider} (${message})`);
        clientSecret = null;
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
