import { prisma } from './prisma';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { decryptSecret } from './crypto';
import { unstable_cache } from 'next/cache';

export type StorageProviderId = 'local' | 's3' | 'azure';

export interface StorageConfigEntry {
  provider: StorageProviderId;
  enabled: boolean;
  config: Record<string, unknown> | null;
  secret: string | null;
}

const loadStorageConfigs = unstable_cache(
  () => prisma.storageConfig.findMany(),
  ['storage-config'],
  { tags: ['storage-config'] }
);

export async function getStorageConfigMap() {
  return getStorageConfigMapWithDeps(loadStorageConfigs, decryptSecret);
}

export async function getStorageConfigMapWithDeps(
  loadFn: () => Promise<Array<{ provider: string; enabled: boolean; config: unknown; secretEnc: string | null }>> = loadStorageConfigs,
  decryptFn: (enc: string) => string | null = decryptSecret
) {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    return new Map<StorageProviderId, StorageConfigEntry>();
  }

  let rows: Array<{ provider: string; enabled: boolean; config: unknown; secretEnc: string | null }> = [];
  try {
    rows = await loadFn();
  } catch {
    return new Map<StorageProviderId, StorageConfigEntry>();
  }

  const map = new Map<StorageProviderId, StorageConfigEntry>();
  for (const row of rows) {
    const provider = row.provider as StorageProviderId;
    let secret: string | null = null;
    if (row.secretEnc) {
      try {
        secret = decryptFn(row.secretEnc);
      } catch {
        throw new Error('FATAL: Failed to decrypt storage secrets. Check SSO_MASTER_KEY.');
      }
      if (!secret) {
        throw new Error('FATAL: Failed to decrypt storage secrets. Check SSO_MASTER_KEY.');
      }
    }
    map.set(provider, {
      provider,
      enabled: row.enabled,
      config: row.config as Record<string, unknown> | null,
      secret
    });
  }

  return map;
}
