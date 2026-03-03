import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/headers to provide a Headers object with a loopback IP
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '127.0.0.1' })
}));

describe('credentials provider authorize behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null when user is not found', async () => {
    vi.mock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));

    // Mock prisma to return no user
    vi.mock('../src/lib/prisma', () => ({ prisma: { user: { findUnique: async () => null } } }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const provider = (opts.providers || []).find((p: any) => typeof p.authorize === 'function') as any;
    expect(provider).toBeDefined();

    const credentials = { email: 'noone@example.com', password: 'irrelevant' };
    const req = { headers: {} } as any;

    const out = await provider.authorize(credentials, req);
    expect(out).toBeNull();
  });

  it('returns null when password verification fails', async () => {
    vi.mock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));

    // Mock prisma to return a user with a passwordHash
    vi.mock('../src/lib/prisma', () => ({
      prisma: {
        user: { findUnique: async () => ({ id: 'u1', email: 'user@example.com', passwordHash: 'hash', roles: [] }) }
      }
    }));

    // Mock password verification to return false
    vi.mock('../src/lib/password', () => ({ verifyPassword: async () => false }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const provider = (opts.providers || []).find((p: any) => typeof p.authorize === 'function') as any;
    expect(provider).toBeDefined();

    const credentials = { email: 'user@example.com', password: 'wrong' };
    const req = { headers: {} } as any;

    const out = await provider.authorize(credentials, req);
    expect(out).toBeNull();
  });
});

