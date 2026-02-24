import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getSsoConfigMap decryption failures', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws a fatal error when decryptSecret fails', async () => {
    // Ensure unstable_cache does not capture real prisma at module init.
    vi.mock('next/cache', () => ({ unstable_cache: (fn: Function) => fn }));

    // Mock prisma.ssoConfig.findMany to return one provider with an encrypted secret
    vi.mock('@/lib/prisma', () => ({
      prisma: { ssoConfig: { findMany: async () => [{ provider: 'azure-ad', enabled: true, config: { clientId: 'x' }, clientSecretEnc: 'enc' }] } }
    }));

    // Mock decryptSecret to throw (mock the relative path used by the module)
    vi.mock('@/lib/crypto', async () => {
      const actual = await vi.importActual('@/lib/crypto');
      return { ...actual, decryptSecret: () => { throw new Error('bad key'); } };
    });

    const { getSsoConfigMapWithDeps } = await import('../src/lib/sso');
    const fakeLoader = async () => [{ provider: 'azure-ad', enabled: true, config: { clientId: 'x' }, clientSecretEnc: 'enc' }];
    const fakeDecrypt = () => { throw new Error('bad key'); };
    await expect(getSsoConfigMapWithDeps(fakeLoader, fakeDecrypt)).rejects.toThrow('FATAL: Failed to decrypt SSO secrets');
  });
});
