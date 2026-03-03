import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@prisma/client', () => ({
  PrismaClient: class { },
  Prisma: {}
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {}
}));

vi.mock('../src/lib/prisma', () => ({
  prisma: {}
}));

vi.mock('@/lib/redis', () => ({
  redis: {}
}));

vi.mock('../src/lib/redis', () => ({
  redis: {}
}));

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
  }, 30000);

  it('accepts x-azure-clientip from trusted proxy when TRUST_PROXY=true', async () => {
    process.env.TRUST_PROXY = 'true';
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const auth = await loadAuthModule();

    const headers = { 'x-azure-clientip': '198.51.100.9' } as Record<string, string>;
    const ip = auth.getClientIp(headers, '10.1.2.3');
    expect(ip).toBe('198.51.100.9');

    const key = auth.getRateLimitKey(headers, 'Admin@Example.COM', '10.1.2.3');
    expect(key).toBe('ip:198.51.100.9|user:admin@example.com');
  }, 30000);

  it('ignores spoofed x-client-ip even if from trusted proxy', async () => {
    process.env.TRUST_PROXY = 'true';
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const auth = await loadAuthModule();

    const headers = { 'x-client-ip': '198.51.100.9' } as Record<string, string>;
    const ip = auth.getClientIp(headers, '10.1.2.3');
    // Should NOT trust x-client-ip, so falls back to immediate remote
    expect(ip).toBe('10.1.2.3');
  }, 30000);

  it('falls back to x-forwarded-for when x-client-ip missing', async () => {
    process.env.TRUST_PROXY = 'true';
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const auth = await loadAuthModule();

    const headers = { 'x-forwarded-for': '198.51.100.1, 198.51.100.2' } as Record<string, string>;
    const ip = auth.getClientIp(headers, '10.9.8.7');
    // With right-to-left parsing (skipping trusted proxies) we pick the
    // first untrusted address starting from the right-hand side.
    expect(ip).toBe('198.51.100.2');
  }, 30000);

  it('ignores proxy headers when remote is not a trusted proxy', async () => {
    process.env.TRUST_PROXY = 'true';
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const auth = await loadAuthModule();

    const headers = { 'x-azure-clientip': '198.51.100.9' } as Record<string, string>;
    // remoteAddr is outside the trusted CIDR
    const ip = auth.getClientIp(headers, '203.0.113.7');
    expect(ip).toBe('203.0.113.7');
  }, 30000);

  it('normalizes ipv6 addresses and bracketed addresses with ports', async () => {
    process.env.TRUST_PROXY = 'false';
    const auth = await loadAuthModule();
    const ip1 = auth.getClientIp({}, '[2001:db8::1]:1234');
    expect(ip1).toBe('2001:db8::1');

    const ip2 = auth.getClientIp({ 'x-azure-clientip': '198.51.100.55:54321' } as Record<string, string>, undefined);
    // With TRUST_PROXY=false we must NOT trust proxy-supplied headers like `x-azure-clientip`.
    // The function should therefore return undefined when the immediate remote is not provided.
    expect(ip2).toBeUndefined();
  }, 30000);


});
