import { describe, it, expect, vi } from 'vitest';

// Set the secret before importing the module
vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-csrf-replay-tests');

// Dynamic import after env is set
const {
    createCsrfToken,
    validateCsrfToken,
    createPublicCsrfToken,
    validatePublicCsrfToken
} = await import('../src/lib/csrf');

describe('CSRF Security Hardening (Session Replay)', () => {
    const SESSION_A = 'session-a';
    const SESSION_B = 'session-b';
    const EMPTY_SESSION = '';
    const VISITOR_1 = 'visitor-1';
    const VISITOR_2 = 'visitor-2';

    describe('Session-bound CSRF', () => {
        it('throws error if attempting to create a token for an empty session', () => {
            expect(() => createCsrfToken(EMPTY_SESSION)).toThrow('Cannot create session-bound token');
        });

        it('rejects validation if sessionId is empty', () => {
            // Manually craft a token that would have been valid for an empty session in the old version
            // In the old version, createCsrfToken('') used `nonce + ':' + ''`
            const nonce = '00112233445566778899aabbccddeeff';
            const crypto = require('crypto');
            const sig = crypto.createHmac('sha256', 'test-secret-for-csrf-replay-tests')
                .update(nonce + ':')
                .digest('hex');
            const oldStyleEmptyToken = nonce + '.' + sig;

            // This token MUST be rejected now even if the HMAC matches, because sessionId is empty
            expect(validateCsrfToken(oldStyleEmptyToken, EMPTY_SESSION)).toBe(false);
        });

        it('rejects replay of a token from one session to another', () => {
            const tokenA = createCsrfToken(SESSION_A);
            expect(validateCsrfToken(tokenA, SESSION_A)).toBe(true);
            expect(validateCsrfToken(tokenA, SESSION_B)).toBe(false);
        });
    });

    describe('Visitor-bound Public CSRF', () => {
        it('validates a token bound to the same visitorId', () => {
            const token = createPublicCsrfToken(VISITOR_1);
            expect(validatePublicCsrfToken(token, VISITOR_1)).toBe(true);
        });

        it('rejects a public token used for a different visitorId', () => {
            const token = createPublicCsrfToken(VISITOR_1);
            expect(validatePublicCsrfToken(token, VISITOR_2)).toBe(false);
        });

        it('rejects a public token used with a session ID', () => {
            const token = createPublicCsrfToken(VISITOR_1);
            // It should fail because the salt 'public:' is missing in session-bound validation
            expect(validateCsrfToken(token, VISITOR_1)).toBe(false);
        });

        it('rejects a session token used with a visitor ID', () => {
            const token = createCsrfToken(SESSION_A);
            // It should fail because the salt 'public:' is expected in public validation
            expect(validatePublicCsrfToken(token, SESSION_A)).toBe(false);
        });

        it('throws error if visitorId is empty during creation', () => {
            expect(() => createPublicCsrfToken('')).toThrow('Cannot create visitor-bound token');
        });
    });
});
