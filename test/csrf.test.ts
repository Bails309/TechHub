import { describe, it, expect, vi } from 'vitest';

// Set the secret before importing the module
vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-csrf-unit-tests');

// Dynamic import after env is set
const { createCsrfToken, validateCsrfToken } = await import('../src/lib/csrf');

describe('CSRF HMAC-signed tokens', () => {
  const SESSION_ID = 'user-session-abc-123';
  const OTHER_SESSION_ID = 'other-session-xyz-456';

  describe('createCsrfToken', () => {
    it('returns a token in nonce.signature format', () => {
      const token = createCsrfToken(SESSION_ID);
      expect(token).toContain('.');
      const [nonce, sig] = token.split('.');
      expect(nonce.length).toBe(64); // 32 bytes hex
      expect(sig.length).toBe(64);   // SHA-256 hex
    });

    it('generates unique tokens on each call', () => {
      const t1 = createCsrfToken(SESSION_ID);
      const t2 = createCsrfToken(SESSION_ID);
      expect(t1).not.toBe(t2);
    });
  });

  describe('validateCsrfToken', () => {
    it('validates a token created for the same session', () => {
      const token = createCsrfToken(SESSION_ID);
      expect(validateCsrfToken(token, SESSION_ID)).toBe(true);
    });

    it('rejects a token created for a different session', () => {
      const token = createCsrfToken(SESSION_ID);
      expect(validateCsrfToken(token, OTHER_SESSION_ID)).toBe(false);
    });

    it('rejects a token with a tampered signature', () => {
      const token = createCsrfToken(SESSION_ID);
      const [nonce] = token.split('.');
      const tampered = nonce + '.0000000000000000000000000000000000000000000000000000000000000000';
      expect(validateCsrfToken(tampered, SESSION_ID)).toBe(false);
    });

    it('rejects a token with a tampered nonce', () => {
      const token = createCsrfToken(SESSION_ID);
      const [, sig] = token.split('.');
      const tampered = '0000000000000000000000000000000000000000000000000000000000000000.' + sig;
      expect(validateCsrfToken(tampered, SESSION_ID)).toBe(false);
    });

    it('rejects an empty token', () => {
      expect(validateCsrfToken('', SESSION_ID)).toBe(false);
    });

    it('rejects a token with no dot separator', () => {
      expect(validateCsrfToken('noseparator', SESSION_ID)).toBe(false);
    });

    it('rejects when sessionId is empty', () => {
      const token = createCsrfToken(SESSION_ID);
      expect(validateCsrfToken(token, '')).toBe(false);
    });
  });
});
