import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('isFromTrustedProxy', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.TRUST_PROXY;
    delete process.env.TRUSTED_PROXIES;
  });

  it('returns false when no TRUSTED_PROXIES configured', async () => {
    process.env.TRUSTED_PROXIES = '';
    const { isFromTrustedProxy } = await import('../src/lib/ip');
    expect(isFromTrustedProxy('10.0.0.1')).toBe(false);
  });

  it('returns false for undefined remoteIp', async () => {
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const { isFromTrustedProxy } = await import('../src/lib/ip');
    expect(isFromTrustedProxy(undefined)).toBe(false);
  });

  it('returns true when IP is within trusted CIDR', async () => {
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const { isFromTrustedProxy } = await import('../src/lib/ip');
    expect(isFromTrustedProxy('10.1.2.3')).toBe(true);
  });

  it('returns false when IP is outside trusted CIDR', async () => {
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const { isFromTrustedProxy } = await import('../src/lib/ip');
    expect(isFromTrustedProxy('192.168.1.1')).toBe(false);
  });

  it('supports multiple comma-separated CIDRs', async () => {
    process.env.TRUSTED_PROXIES = '10.0.0.0/8, 172.16.0.0/12';
    const { isFromTrustedProxy } = await import('../src/lib/ip');
    expect(isFromTrustedProxy('10.1.1.1')).toBe(true);
    expect(isFromTrustedProxy('172.20.0.1')).toBe(true);
    expect(isFromTrustedProxy('192.168.0.1')).toBe(false);
  });

  it('returns false for invalid IP input', async () => {
    process.env.TRUSTED_PROXIES = '10.0.0.0/8';
    const { isFromTrustedProxy } = await import('../src/lib/ip');
    expect(isFromTrustedProxy('not-an-ip')).toBe(false);
  });

  it('ignores malformed CIDR entries gracefully', async () => {
    process.env.TRUSTED_PROXIES = 'invalid-cidr, 10.0.0.0/8';
    const { isFromTrustedProxy } = await import('../src/lib/ip');
    expect(isFromTrustedProxy('10.1.1.1')).toBe(true);
  });
});
