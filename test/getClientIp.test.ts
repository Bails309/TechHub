import { describe, it, expect, beforeEach, vi } from 'vitest';

async function loadAuthModule() {
  // Ensure module reload so env changes take effect
  vi.resetModules();
  const { getClientIp, getRateLimitKey } = await import('../src/test-exports');
  return { getClientIp, getRateLimitKey };
}

describe('getClientIp and getRateLimitKey', () => {
  beforeEach(() => {
    // Clear envs used by the module so each test controls them explicitly
    delete process.env.TRUST_PROXY;
    delete process.env.TRUSTED_PROXIES;
  });

  it('prefers immediate remote address when not trusting proxies', async () => {
    const auth = await loadAuthModule();
    const ip = auth.getClientIp({}, '203.0.113.5');
    expect(ip).toBe('203.0.113.5');

    const key = auth.getRateLimitKey({}, 'User@Example.COM', '203.0.113.5');
    expect(key).toBe('ip:203.0.113.5|user:user@example.com');
  });

  it('accepts x-client-ip from trusted proxy when TRUST_PROXY=true', async () => {
    process.env.TRUST_PROXY = 'true';
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const auth = await loadAuthModule();

    const headers = { 'x-client-ip': '198.51.100.9' } as Record<string, string>;
    const ip = auth.getClientIp(headers, '10.1.2.3');
    expect(ip).toBe('198.51.100.9');

    const key = auth.getRateLimitKey(headers, 'Admin@Example.COM', '10.1.2.3');
    expect(key).toBe('ip:198.51.100.9|user:admin@example.com');
  });

  it('falls back to x-forwarded-for when x-client-ip missing', async () => {
    process.env.TRUST_PROXY = 'true';
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const auth = await loadAuthModule();

    const headers = { 'x-forwarded-for': '198.51.100.1, 198.51.100.2' } as Record<string, string>;
    const ip = auth.getClientIp(headers, '10.9.8.7');
    // With right-to-left parsing (skipping trusted proxies) we pick the
    // first untrusted address starting from the right-hand side.
    expect(ip).toBe('198.51.100.2');
  });

  it('ignores proxy headers when remote is not a trusted proxy', async () => {
    process.env.TRUST_PROXY = 'true';
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const auth = await loadAuthModule();

    const headers = { 'x-client-ip': '198.51.100.9' } as Record<string, string>;
    // remoteAddr is outside the trusted CIDR
    const ip = auth.getClientIp(headers, '203.0.113.7');
    expect(ip).toBe('203.0.113.7');
  });

  it('normalizes ipv6 addresses and bracketed addresses with ports', async () => {
    process.env.TRUST_PROXY = 'false';
    const auth = await loadAuthModule();
    const ip1 = auth.getClientIp({}, '[2001:db8::1]:1234');
    expect(ip1).toBe('2001:db8::1');

    const ip2 = auth.getClientIp({ 'x-real-ip': '198.51.100.55:54321' } as Record<string, string>, undefined);
    // With TRUST_PROXY=false we must NOT trust proxy-supplied headers like `x-real-ip`.
    // The function should therefore return undefined when the immediate remote is not provided.
    expect(ip2).toBeUndefined();
  });

  it('admin server actions throw when session.mustChangePassword is true', async () => {
    // Reload modules and mock auth to simulate a locked admin session
    vi.resetModules();
    vi.mock('@/lib/auth', () => ({
      getServerAuthSession: async () => ({
        user: { id: 'admin1', roles: ['admin'], mustChangePassword: true, authProvider: 'credentials' }
      })
    }));
    vi.mock('@/lib/prisma', () => ({ prisma: {} }));
    vi.mock('@/lib/storage', () => ({ saveIcon: async () => '/uploads/fake.png', deleteIcon: async () => {} }));

    const { createApp } = await import('../src/app/admin/actions');
    const form = { get: () => null, getAll: () => [] } as unknown as FormData;
    await expect(createApp(form)).rejects.toThrow('Unauthorized: must_change_password');
  });
});
