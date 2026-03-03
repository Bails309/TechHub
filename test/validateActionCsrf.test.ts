import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

// Set secrets
const SECRET = 'test-secret-for-action-csrf-tests';
vi.stubEnv('NEXTAUTH_SECRET', SECRET);

// Helper to generate a valid token
function generateToken(nonce: string, sessionId: string) {
    const sig = createHmac('sha256', SECRET)
        .update(nonce + ':' + sessionId)
        .digest('hex');
    return `${nonce}.${sig}`;
}

function generatePublicToken(nonce: string, visitorId: string) {
    const sig = createHmac('sha256', SECRET)
        .update('public:' + nonce + ':' + visitorId)
        .digest('hex');
    return `${nonce}.${sig}`;
}

// Mock next/headers
const mockHeaders = vi.fn(async () => new Headers());
const mockCookies = vi.fn(async () => ({
    get: vi.fn((name: string) => {
        if (name === 'XSRF-TOKEN') return { value: generateToken('nonce1', 'user1') };
        if (name === 'XSRF-TOKEN-PUBLIC') return { value: generatePublicToken('pnonce1', 'visitor1') };
        if (name === 'visitor-id') return { value: 'visitor1' };
        return undefined;
    })
}));

vi.mock('next/headers', () => ({
    headers: () => mockHeaders(),
    cookies: () => mockCookies()
}));

// Mock next-auth/jwt
const mockGetToken = vi.fn();
vi.mock('next-auth/jwt', () => ({
    getToken: (opts: any) => mockGetToken(opts)
}));

describe('validateActionCsrf', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('validates via header x-csrf-token', async () => {
        const validToken = generateToken('nonce1', 'user1');
        mockHeaders.mockResolvedValue(new Headers({ 'x-csrf-token': validToken }));
        mockGetToken.mockResolvedValue({ sub: 'user1' });

        const { validateActionCsrf } = await import('../src/lib/csrf');
        const result = await validateActionCsrf();
        expect(result).toBe(true);
    });

    it('validates via formData fallback', async () => {
        const validToken = generateToken('nonce1', 'user1');
        mockHeaders.mockResolvedValue(new Headers());
        mockGetToken.mockResolvedValue({ sub: 'user1' });

        const formData = new FormData();
        formData.set('csrfToken', validToken);

        const { validateActionCsrf } = await import('../src/lib/csrf');
        const result = await validateActionCsrf(formData);
        expect(result).toBe(true);
    });

    it('rejects if token is missing in both', async () => {
        mockHeaders.mockResolvedValue(new Headers());
        mockGetToken.mockResolvedValue({ sub: 'user1' });

        const { validateActionCsrf } = await import('../src/lib/csrf');
        const result = await validateActionCsrf();
        expect(result).toBe(false);
    });

    it('rejects if token does not match cookie', async () => {
        const validToken = generateToken('nonce1', 'user1');
        mockHeaders.mockResolvedValue(new Headers({ 'x-csrf-token': 'wrong-token' }));
        mockGetToken.mockResolvedValue({ sub: 'user1' });

        const { validateActionCsrf } = await import('../src/lib/csrf');
        const result = await validateActionCsrf();
        expect(result).toBe(false);
    });

    it('supports public CSRF validation fallback', async () => {
        const validToken = generatePublicToken('pnonce1', 'visitor1');
        mockHeaders.mockResolvedValue(new Headers({ 'x-csrf-token': validToken }));
        mockGetToken.mockResolvedValue(null); // Unauthenticated

        const { validateActionCsrf } = await import('../src/lib/csrf');
        const result = await validateActionCsrf();
        expect(result).toBe(true);
    });
});
