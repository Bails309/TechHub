import { prisma } from './prisma';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { decryptSecret } from './crypto';

export type StorageProviderId = 'local' | 's3' | 'azure';

export interface StorageConfigEntry {
  provider: StorageProviderId;
  enabled: boolean;
  config: Record<string, unknown> | null;
  secret: string | null;
}

// Simple TTL cache replacing unstable_cache (removed in Next.js 16)
let _cachedStorageConfigs: Awaited<ReturnType<typeof prisma.storageConfig.findMany>> | null = null;
let _storageConfigCacheTime = 0;
const STORAGE_CONFIG_CACHE_TTL_MS = 60_000;

async function loadStorageConfigs() {
  const now = Date.now();
  if (_cachedStorageConfigs && now - _storageConfigCacheTime < STORAGE_CONFIG_CACHE_TTL_MS) {
    return _cachedStorageConfigs;
  }
  const rows = await prisma.storageConfig.findMany();
  _cachedStorageConfigs = rows;
  _storageConfigCacheTime = now;
  return rows;
}

/** Invalidate the in-memory storage config cache (e.g. after admin changes). */
export function invalidateStorageConfigCache() {
  _cachedStorageConfigs = null;
  _storageConfigCacheTime = 0;
}

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
