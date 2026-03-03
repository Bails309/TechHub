import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set the secret before importing the module
vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-action-csrf-tests');

// Mock next/headers
vi.mock('next/headers', () => ({
    headers: async () => new Headers(),
    cookies: async () => ({ get: (name: string) => ({ value: 'mock-cookie-value' }) })
}));

// Mock getSessionIdFromCookie and others
vi.mock('../src/lib/csrf', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        getSessionIdFromCookie: async () => 'user1',
        getVisitorIdFromCookie: async () => 'visitor1',
        readCookieValue: async (name: string) => {
            if (name === 'XSRF-TOKEN') return 'valid-session-token';
            if (name === 'XSRF-TOKEN-PUBLIC') return 'valid-public-token';
            return null;
        },
        validateCsrfToken: (token: string, sessionId: string) => token === 'valid-session-token' && sessionId === 'user1',
        validatePublicCsrfToken: (token: string, visitorId: string) => token === 'valid-public-token' && visitorId === 'visitor1',
    };
});

describe('validateActionCsrf', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('validates via header x-csrf-token', async () => {
        const { headers } = await import('next/headers');
        vi.mocked(headers).mockResolvedValue(new Headers({ 'x-csrf-token': 'valid-session-token' }));

        const { validateActionCsrf } = await import('../src/lib/csrf');
        const result = await validateActionCsrf();
        expect(result).toBe(true);
    });

    it('validates via formData fallback', async () => {
        const { headers } = await import('next/headers');
        vi.mocked(headers).mockResolvedValue(new Headers());

        const formData = new FormData();
        formData.set('csrfToken', 'valid-session-token');

        const { validateActionCsrf } = await import('../src/lib/csrf');
        const result = await validateActionCsrf(formData);
        expect(result).toBe(true);
    });

    it('rejects if token is missing in both', async () => {
        const { headers } = await import('next/headers');
        vi.mocked(headers).mockResolvedValue(new Headers());

        const { validateActionCsrf } = await import('../src/lib/csrf');
        const result = await validateActionCsrf();
        expect(result).toBe(false);
    });

    it('rejects if token does not match cookie', async () => {
        const { headers } = await import('next/headers');
        vi.mocked(headers).mockResolvedValue(new Headers({ 'x-csrf-token': 'wrong-token' }));

        const { validateActionCsrf } = await import('../src/lib/csrf');
        const result = await validateActionCsrf();
        expect(result).toBe(false);
    });

    it('supports public CSRF validation fallback', async () => {
        const { headers } = await import('next/headers');
        vi.mocked(headers).mockResolvedValue(new Headers({ 'x-csrf-token': 'valid-public-token' }));

        const { getSessionIdFromCookie, validateActionCsrf } = await import('../src/lib/csrf');
        vi.mocked(getSessionIdFromCookie).mockResolvedValue('');

        const result = await validateActionCsrf();
        expect(result).toBe(true);
    });
});
