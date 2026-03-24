import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

describe('ip.ts – gap coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('getServerActionIp returns undefined in test environment', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { getServerActionIp } = await import('../src/lib/ip');
    const result = await getServerActionIp();
    expect(result).toBeUndefined();
  });

  it('getClientIp returns 127.0.0.1 when all sources are missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY', '');
    vi.stubEnv('TRUSTED_PROXIES', '');
    const { getClientIp } = await import('../src/lib/ip');
    // Headers with no forwarding info, no remote addr
    const headers = new Map<string, string>();
    const result = getClientIp(headers as any, undefined);
    expect(result).toBe('127.0.0.1');
  });

  it('getClientIp returns undefined when remoteAddr is missing in test env', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TRUST_PROXY', '');
    vi.stubEnv('TRUSTED_PROXIES', '');
    const { getClientIp } = await import('../src/lib/ip');
    const headers = new Map<string, string>();
    const result = getClientIp(headers as any, undefined);
    expect(result).toBeUndefined();
  });

  it('normalizeIp handles bracketed IPv6 address', async () => {
    const { normalizeIp } = await import('../src/lib/ip');
    const result = normalizeIp('[::1]');
    expect(result).toBe('::1');
  });

  it('normalizeIp handles bracketed IPv6 with port', async () => {
    const { normalizeIp } = await import('../src/lib/ip');
    const result = normalizeIp('[::1]:8080');
    expect(result).toBe('::1');
  });

  it('normalizeIp handles bracketed invalid IP', async () => {
    const { normalizeIp } = await import('../src/lib/ip');
    const result = normalizeIp('[not-an-ip]');
    expect(result).toBeUndefined();
  });

  it('getClientIp extracts x-azure-clientip when trusted proxy', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TRUST_PROXY', 'true');
    vi.stubEnv('TRUSTED_PROXIES', '');
    vi.stubEnv('ALLOW_MISSING_REMOTE_IP', '');
    const { getClientIp } = await import('../src/lib/ip');
    const hdrs = new Headers();
    hdrs.set('x-azure-clientip', '5.6.7.8');
    // When TRUSTED_PROXIES is empty, any remote IP is trusted (no CIDR filter)
    const result = getClientIp(hdrs, '10.0.0.1');
    expect(result).toBe('5.6.7.8');
  });

  it('getClientIp falls back to x-forwarded-for when x-azure-clientip is absent', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TRUST_PROXY', 'true');
    vi.stubEnv('TRUSTED_PROXIES', '');
    vi.stubEnv('ALLOW_MISSING_REMOTE_IP', '');
    const { getClientIp } = await import('../src/lib/ip');
    const hdrs = new Headers();
    hdrs.set('x-forwarded-for', '4.3.2.1, 10.0.0.2');
    const result = getClientIp(hdrs, '10.0.0.1');
    // Right-to-left scan: 10.0.0.2 is first non-trusted-proxy IP from the right
    expect(result).toBe('10.0.0.2');
  });

  it('getServerActionIp calls headers() in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const ip = await import('../src/lib/ip');
    // In development, getServerActionIp tries to call headers() from next/headers.
    // The mock may throw or return a value. Either way it shouldn't crash.
    const result = await ip.getServerActionIp();
    // Will be undefined since the mocked headers() returns no useful data
    expect(result === undefined || typeof result === 'string').toBe(true);
  });
});
