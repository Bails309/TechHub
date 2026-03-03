import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Absolute session timeout', () => {
    beforeEach(() => {
        vi.resetModules();
        // Set a short absolute max for testing (10 seconds)
        process.env.SESSION_MAX_AGE_SECONDS = '10';
        // Force DB check on every call
        process.env.JWT_CHECK_INTERVAL_MS = '0';
        vi.doMock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
        vi.doMock('../src/lib/audit', () => ({ writeAuditLog: vi.fn() }));
    });

    it('revokes token when absolute session lifetime is exceeded', async () => {
        vi.doMock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));

        const findUnique = vi.fn(async () => ({
            roles: [{ role: { name: 'user' } }],
            mustChangePassword: false,
            updatedAt: new Date().toISOString()
        }));
        vi.doMock('../src/lib/prisma', () => ({ prisma: { user: { findUnique } } }));

        const { getAuthOptions } = await import('../src/lib/auth');
        const opts = await getAuthOptions();
        const jwtCb = opts.callbacks?.jwt as any;

        // Simulate a token issued 30 seconds ago (iat is in seconds, exceeds 10s max)
        const issuedAt = Math.floor(Date.now() / 1000) - 30;
        const token = { sub: 'u1', iat: issuedAt } as any;
        const out = await jwtCb({ token });

        expect(out.revoked).toBe(true);
    });

    it('keeps token alive when within absolute session lifetime', async () => {
        vi.doMock('../src/lib/sso', () => ({ getSsoConfigMap: async () => new Map() }));

        const findUnique = vi.fn(async () => ({
            roles: [{ role: { name: 'user' } }],
            mustChangePassword: false,
            updatedAt: new Date().toISOString()
        }));
        vi.doMock('../src/lib/prisma', () => ({ prisma: { user: { findUnique } } }));

        const { getAuthOptions } = await import('../src/lib/auth');
        const opts = await getAuthOptions();
        const jwtCb = opts.callbacks?.jwt as any;

        // Simulate a token issued 2 seconds ago (within 10s max)
        const issuedAt = Math.floor(Date.now() / 1000) - 2;
        const token = { sub: 'u1', iat: issuedAt } as any;
        const out = await jwtCb({ token });

        expect(out.revoked).toBeUndefined();
    });
});
