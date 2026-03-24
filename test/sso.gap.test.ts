import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/constants', () => ({
  PHASE_PRODUCTION_BUILD: 'phase-production-build',
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { ssoConfig: { findMany: vi.fn().mockResolvedValue([]) } }
}));

vi.mock('@/lib/crypto', () => ({
  decryptSecret: vi.fn()
}));

describe('sso.ts – gap coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns empty map during production build phase', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    const { getSsoConfigMapWithDeps } = await import('../src/lib/sso');
    const result = await getSsoConfigMapWithDeps(
      async () => [{ provider: 'azure-ad', enabled: true, config: {}, clientSecretEnc: null }]
    );
    expect(result.size).toBe(0);
  });

  it('returns empty map when loadFn throws', async () => {
    const { getSsoConfigMapWithDeps } = await import('../src/lib/sso');
    const result = await getSsoConfigMapWithDeps(
      async () => { throw new Error('DB error'); }
    );
    expect(result.size).toBe(0);
  });

  it('maps multiple providers correctly', async () => {
    const { getSsoConfigMapWithDeps } = await import('../src/lib/sso');
    const result = await getSsoConfigMapWithDeps(
      async () => [
        { provider: 'azure-ad', enabled: true, config: { clientId: 'abc', tenantId: 'xyz' }, clientSecretEnc: null },
        { provider: 'keycloak', enabled: false, config: { issuer: 'https://kc.example.com' }, clientSecretEnc: null },
        { provider: 'credentials', enabled: true, config: null, clientSecretEnc: null }
      ]
    );
    expect(result.size).toBe(3);
    expect(result.get('azure-ad')?.enabled).toBe(true);
    expect(result.get('keycloak')?.enabled).toBe(false);
    expect(result.get('credentials')?.clientSecret).toBeNull();
  });

  it('decrypts client secrets when present', async () => {
    const { getSsoConfigMapWithDeps } = await import('../src/lib/sso');
    const mockDecrypt = vi.fn().mockReturnValue('decrypted-secret');
    const result = await getSsoConfigMapWithDeps(
      async () => [
        { provider: 'azure-ad', enabled: true, config: {}, clientSecretEnc: 'v2:encrypted:data' }
      ],
      mockDecrypt
    );
    expect(result.get('azure-ad')?.clientSecret).toBe('decrypted-secret');
    expect(mockDecrypt).toHaveBeenCalledWith('v2:encrypted:data');
  });

  it('throws when decryptFn returns null', async () => {
    const { getSsoConfigMapWithDeps } = await import('../src/lib/sso');
    await expect(getSsoConfigMapWithDeps(
      async () => [
        { provider: 'azure-ad', enabled: true, config: {}, clientSecretEnc: 'v2:encrypted:data' }
      ],
      () => null
    )).rejects.toThrow('FATAL');
  });

  it('throws when decryptFn throws', async () => {
    const { getSsoConfigMapWithDeps } = await import('../src/lib/sso');
    await expect(getSsoConfigMapWithDeps(
      async () => [
        { provider: 'azure-ad', enabled: true, config: {}, clientSecretEnc: 'v2:encrypted:data' }
      ],
      () => { throw new Error('key error'); }
    )).rejects.toThrow('FATAL');
  });

  it('handles empty row list', async () => {
    const { getSsoConfigMapWithDeps } = await import('../src/lib/sso');
    const result = await getSsoConfigMapWithDeps(async () => []);
    expect(result.size).toBe(0);
  });
});
