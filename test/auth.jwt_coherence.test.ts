import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('JWT coherence (periodic DB validation)', () => {
  beforeEach(() => {
    vi.resetModules();
    // Force check on every jwt callback invocation
    process.env.JWT_CHECK_INTERVAL_MS = '0';
    // Mock PrismaAdapter globally for these tests
    vi.doMock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
  });

  it('refreshes token fields when user exists', async () => {
    vi.doMock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));
    // Stub the PrismaAdapter import used by auth module to avoid adapter side-effects
    vi.doMock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));

    const returned = {
      roles: [{ role: { name: 'admin' } }],
      mustChangePassword: true,
      updatedAt: new Date().toISOString()
    };

    const findUnique = vi.fn(async () => returned);
    vi.doMock('../src/lib/prisma', () => ({ prisma: { user: { findUnique } } }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const jwtCb = opts.callbacks?.jwt as any;

    const token = { sub: 'u1' } as any;
    const out = await jwtCb({ token });

    expect(out.roles).toEqual(['admin']);
    expect(out.mustChangePassword).toBe(true);
    expect(typeof out.userUpdatedAt).toBe('number');
    expect(typeof out.lastCheckedAt).toBe('number');
  });

  it('marks token revoked when user is deleted', async () => {
    vi.doMock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));

    const findUnique = vi.fn(async () => null);
    vi.doMock('../src/lib/prisma', () => ({ prisma: { user: { findUnique } } }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const jwtCb = opts.callbacks?.jwt as any;

    const token = { sub: 'u-deleted' } as any;
    const out = await jwtCb({ token });
    expect(out.revoked).toBe(true);
  });

  it('does not crash if DB throws; schedules next check', async () => {
    vi.doMock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));

    const findUnique = vi.fn(async () => { throw new Error('db down'); });
    vi.doMock('../src/lib/prisma', () => ({ prisma: { user: { findUnique } } }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const jwtCb = opts.callbacks?.jwt as any;

    const token = { sub: 'u-error' } as any;
    const out = await jwtCb({ token });
    expect(typeof out.lastCheckedAt).toBe('number');
  });

  it('skips DB lookup when lastCheckedAt is fresh', async () => {
    vi.resetModules();
    vi.doMock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));

    // spyable mock that would fail the test if called
    const findUnique = vi.fn(async () => { throw new Error('should not be called'); });
    vi.doMock('../src/lib/prisma', () => ({ prisma: { user: { findUnique } } }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const jwtCb = opts.callbacks?.jwt as any;

    const now = Date.now();
    const token = { sub: 'u1', lastCheckedAt: now } as any;
    const out = await jwtCb({ token });
    expect(findUnique).not.toHaveBeenCalled();
    expect(out.lastCheckedAt).toBe(now);
  });
});
