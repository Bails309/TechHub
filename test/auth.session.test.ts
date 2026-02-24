import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('NextAuth session callback - stateless mapping', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('populates session.user roles and mustChangePassword from JWT token', async () => {
    // Mock SSO loader to avoid DB calls during auth options build
    vi.mock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const sessionCallback = opts.callbacks?.session as any;

    const session = { user: {} } as any;
    const token = { sub: 'user-123', roles: ['admin', 'user'], mustChangePassword: true, authProvider: 'credentials' } as any;

    const out = await sessionCallback({ session, token });
    expect(out.user.id).toBe('user-123');
    expect(out.user.roles).toEqual(['admin', 'user']);
    expect(out.user.mustChangePassword).toBe(true);
    expect(out.user.authProvider).toBe('credentials');
  });
});
