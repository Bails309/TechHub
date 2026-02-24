import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('credentials provider rate limit handling', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws a safe error message when rate limiter rejects', async () => {
    // prevent SSO loader from running during auth options build
    vi.mock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));

    // Mock rate limiter to always reject (simulate exceeded limit)
    vi.mock('../src/lib/rateLimit', () => ({
      assertRateLimit: async () => {
        throw new Error('limit reached');
      }
    }));

    const { getAuthOptions } = await import('../src/lib/auth');
    const opts = await getAuthOptions();
    const provider = (opts.providers || []).find((p: any) => typeof p.authorize === 'function') as any;
    expect(provider).toBeDefined();

    const credentials = { email: 'user@example.com', password: 'password123' };
    const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any;

    await expect(provider.authorize(credentials, req)).rejects.toThrow('Rate limit exceeded');
  });
});
