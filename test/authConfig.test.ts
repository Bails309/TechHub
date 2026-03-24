import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('auth-config', () => {
    beforeEach(() => {
        vi.resetModules();
        delete process.env.SESSION_MAX_AGE_SECONDS;
        delete process.env.SESSION_IDLE_TIMEOUT_MS;
    });

    describe('getSessionMaxAgeSeconds', () => {
        it('returns default 28800 when env is not set', async () => {
            const { getSessionMaxAgeSeconds } = await import('../src/lib/auth-config');
            expect(getSessionMaxAgeSeconds()).toBe(28800);
        });

        it('respects SESSION_MAX_AGE_SECONDS env var', async () => {
            process.env.SESSION_MAX_AGE_SECONDS = '3600';
            const { getSessionMaxAgeSeconds } = await import('../src/lib/auth-config');
            expect(getSessionMaxAgeSeconds()).toBe(3600);
        });

        it('returns default for zero or negative values', async () => {
            process.env.SESSION_MAX_AGE_SECONDS = '0';
            const { getSessionMaxAgeSeconds } = await import('../src/lib/auth-config');
            expect(getSessionMaxAgeSeconds()).toBe(28800);
        });

        it('returns default for non-numeric values', async () => {
            process.env.SESSION_MAX_AGE_SECONDS = 'abc';
            const { getSessionMaxAgeSeconds } = await import('../src/lib/auth-config');
            expect(getSessionMaxAgeSeconds()).toBe(28800);
        });
    });

    describe('getSessionIdleTimeoutMs', () => {
        it('returns default 1200000 when env is not set', async () => {
            const { getSessionIdleTimeoutMs } = await import('../src/lib/auth-config');
            expect(getSessionIdleTimeoutMs()).toBe(1200000);
        });

        it('respects SESSION_IDLE_TIMEOUT_MS env var', async () => {
            process.env.SESSION_IDLE_TIMEOUT_MS = '60000';
            const { getSessionIdleTimeoutMs } = await import('../src/lib/auth-config');
            expect(getSessionIdleTimeoutMs()).toBe(60000);
        });

        it('returns default for zero or negative values', async () => {
            process.env.SESSION_IDLE_TIMEOUT_MS = '-100';
            const { getSessionIdleTimeoutMs } = await import('../src/lib/auth-config');
            expect(getSessionIdleTimeoutMs()).toBe(1200000);
        });
    });
});
