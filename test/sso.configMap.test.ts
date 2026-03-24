import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma to control DB calls
const mockFindMany = vi.fn().mockResolvedValue([]);
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    ssoConfig: { findMany: mockFindMany }
  }
}));

// Mock crypto to simulate decryptSecret
const mockDecryptSecret = vi.fn().mockReturnValue('decrypted-secret');
vi.mock('../src/lib/crypto', () => ({
  decryptSecret: (...a: any[]) => mockDecryptSecret(...a)
}));

vi.mock('next/constants', () => ({
  PHASE_PRODUCTION_BUILD: 'phase-production-build',
}));

describe('sso.ts – getSsoConfigMap (wrapper function)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('calls Prisma findMany and returns a populated map', async () => {
    mockFindMany.mockResolvedValue([
      { provider: 'azure-ad', enabled: true, config: { clientId: 'abc' }, clientSecretEnc: 'enc-secret' },
    ]);
    mockDecryptSecret.mockReturnValue('secret-value');

    // Must re-import to pick up fresh module state
    vi.resetModules();
    const { getSsoConfigMap } = await import('../src/lib/sso');
    const map = await getSsoConfigMap();

    expect(mockFindMany).toHaveBeenCalledOnce();
    expect(mockDecryptSecret).toHaveBeenCalledWith('enc-secret');
    expect(map.size).toBe(1);
    expect(map.get('azure-ad')?.clientSecret).toBe('secret-value');
    expect(map.get('azure-ad')?.enabled).toBe(true);
  });

  it('returns empty map when DB returns no rows', async () => {
    mockFindMany.mockResolvedValue([]);

    vi.resetModules();
    const { getSsoConfigMap } = await import('../src/lib/sso');
    const map = await getSsoConfigMap();

    expect(map.size).toBe(0);
  });

  it('returns empty map when Prisma throws', async () => {
    mockFindMany.mockRejectedValue(new Error('DB connection refused'));

    vi.resetModules();
    const { getSsoConfigMap } = await import('../src/lib/sso');
    const map = await getSsoConfigMap();

    expect(map.size).toBe(0);
  });
});
