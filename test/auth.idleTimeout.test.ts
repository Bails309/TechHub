import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Idle session timeout', () => {
    beforeEach(() => {
        vi.resetModules();
        // Set a short idle timeout for testing (5 seconds)
        process.env.SESSION_IDLE_TIMEOUT_MS = '5000';
        // Force DB check on every call
        process.env.JWT_CHECK_INTERVAL_MS = '0';
        vi.doMock('@next-auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
        vi.doMock('../src/lib/audit', () => ({ writeAuditLog: vi.fn() }));
    });

    it('revokes token when lastActivity exceeds idle timeout', async () => {
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

        // Simulate a token with lastActivity 10 seconds ago (exceeds 5s timeout)
        const staleTime = Date.now() - 10000;
        const token = { sub: 'u1', lastActivity: staleTime } as any;
        const out = await jwtCb({ token });

        expect(out.revoked).toBe(true);
    });

    it('keeps token alive when lastActivity is fresh', async () => {
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

        // Simulate a token with lastActivity 1 second ago (within 5s timeout)
        const freshTime = Date.now() - 1000;
        const token = { sub: 'u1', lastActivity: freshTime } as any;
        const out = await jwtCb({ token });

        expect(out.revoked).toBeUndefined();
        expect(typeof out.lastActivity).toBe('number');
        // lastActivity should have been refreshed to ~now
        expect(out.lastActivity).toBeGreaterThanOrEqual(freshTime);
    });

    it('sets lastActivity on first login (no prior value)', async () => {
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

        // No lastActivity set yet (first request after login)
        const token = { sub: 'u1' } as any;
        const user = { id: 'u1' };
        const out = await jwtCb({ token, user });

        expect(out.revoked).toBeUndefined();
        expect(typeof out.lastActivity).toBe('number');
    });

    it('revokes token when absolute session lifetime is exceeded', async () => {
        // Set a short absolute max for testing (10 seconds)
        process.env.SESSION_MAX_AGE_SECONDS = '10';
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
        const token = { sub: 'u1', iat: issuedAt, lastActivity: Date.now() } as any;
        const out = await jwtCb({ token });

        expect(out.revoked).toBe(true);
    });
});
