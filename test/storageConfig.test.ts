import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getStorageConfigMapWithDeps', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('SSO_MASTER_KEY', Buffer.alloc(32, 1).toString('base64'));
    });

    it('returns an empty map when loadFn returns empty array', async () => {
        vi.mock('next/constants', () => ({ PHASE_PRODUCTION_BUILD: 'phase-production-build' }));
        vi.mock('next/cache', () => ({ unstable_cache: (fn: Function) => fn }));
        vi.mock('@/lib/prisma', () => ({ prisma: {} }));

        const { getStorageConfigMapWithDeps } = await import('../src/lib/storageConfig');
        const map = await getStorageConfigMapWithDeps(async () => [], () => null);
        expect(map.size).toBe(0);
    });

    it('maps storage providers correctly', async () => {
        vi.mock('next/constants', () => ({ PHASE_PRODUCTION_BUILD: 'phase-production-build' }));
        vi.mock('next/cache', () => ({ unstable_cache: (fn: Function) => fn }));
        vi.mock('@/lib/prisma', () => ({ prisma: {} }));

        const { getStorageConfigMapWithDeps } = await import('../src/lib/storageConfig');
        const rows = [
            { provider: 'local', enabled: true, config: { path: '/uploads' }, secretEnc: null },
            { provider: 's3', enabled: false, config: { bucket: 'test' }, secretEnc: null },
        ];
        const map = await getStorageConfigMapWithDeps(async () => rows, () => null);
        expect(map.size).toBe(2);
        expect(map.get('local')?.enabled).toBe(true);
        expect(map.get('s3')?.enabled).toBe(false);
    });

    it('decrypts secrets for providers with secretEnc', async () => {
        vi.mock('next/constants', () => ({ PHASE_PRODUCTION_BUILD: 'phase-production-build' }));
        vi.mock('next/cache', () => ({ unstable_cache: (fn: Function) => fn }));
        vi.mock('@/lib/prisma', () => ({ prisma: {} }));

        const { getStorageConfigMapWithDeps } = await import('../src/lib/storageConfig');
        const rows = [
            { provider: 'azure', enabled: true, config: {}, secretEnc: 'encrypted-value' },
        ];
        const map = await getStorageConfigMapWithDeps(async () => rows, () => 'decrypted-secret');
        expect(map.get('azure')?.secret).toBe('decrypted-secret');
    });

    it('throws when decryption fails', async () => {
        vi.mock('next/constants', () => ({ PHASE_PRODUCTION_BUILD: 'phase-production-build' }));
        vi.mock('next/cache', () => ({ unstable_cache: (fn: Function) => fn }));
        vi.mock('@/lib/prisma', () => ({ prisma: {} }));

        const { getStorageConfigMapWithDeps } = await import('../src/lib/storageConfig');
        const rows = [
            { provider: 'azure', enabled: true, config: {}, secretEnc: 'bad' },
        ];
        await expect(
            getStorageConfigMapWithDeps(async () => rows, () => { throw new Error('bad key'); })
        ).rejects.toThrow('FATAL');
    });

    it('throws when decryption returns null', async () => {
        vi.mock('next/constants', () => ({ PHASE_PRODUCTION_BUILD: 'phase-production-build' }));
        vi.mock('next/cache', () => ({ unstable_cache: (fn: Function) => fn }));
        vi.mock('@/lib/prisma', () => ({ prisma: {} }));

        const { getStorageConfigMapWithDeps } = await import('../src/lib/storageConfig');
        const rows = [
            { provider: 'azure', enabled: true, config: {}, secretEnc: 'enc' },
        ];
        await expect(
            getStorageConfigMapWithDeps(async () => rows, () => null)
        ).rejects.toThrow('FATAL');
    });
});
