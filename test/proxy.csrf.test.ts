import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-proxy-csrf');

const { _testUtils } = await import('../src/proxy');
const {
  createCsrfToken,
  validateCsrfToken,
  createPublicCsrfToken,
  validatePublicCsrfToken,
} = _testUtils;

describe('proxy CSRF tokens (Web Crypto)', () => {
  const SESSION_ID = 'session-abc-123';
  const VISITOR_ID = 'visitor-xyz-456';

  describe('createCsrfToken / validateCsrfToken', () => {
    it('creates a token in nonce.signature format', async () => {
      const token = await createCsrfToken(SESSION_ID);
      expect(token).toContain('.');
      const [nonce, sig] = token.split('.');
      expect(nonce.length).toBe(32); // 16 bytes hex encoded
      expect(sig.length).toBe(64);   // SHA-256 hex
    });

    it('validates a token for the correct session', async () => {
      const token = await createCsrfToken(SESSION_ID);
      const valid = await validateCsrfToken(token, SESSION_ID);
      expect(valid).toBe(true);
    });

    it('rejects a token for a different session', async () => {
      const token = await createCsrfToken(SESSION_ID);
      const valid = await validateCsrfToken(token, 'other-session');
      expect(valid).toBe(false);
    });

    it('generates unique tokens on each call', async () => {
      const t1 = await createCsrfToken(SESSION_ID);
      const t2 = await createCsrfToken(SESSION_ID);
      expect(t1).not.toBe(t2);
    });

    it('rejects empty token', async () => {
      expect(await validateCsrfToken('', SESSION_ID)).toBe(false);
    });

    it('rejects token without dot separator', async () => {
      expect(await validateCsrfToken('nodot', SESSION_ID)).toBe(false);
    });

    it('rejects empty session ID', async () => {
      const token = await createCsrfToken(SESSION_ID);
      expect(await validateCsrfToken(token, '')).toBe(false);
    });

    it('rejects whitespace-only session ID', async () => {
      const token = await createCsrfToken(SESSION_ID);
      expect(await validateCsrfToken(token, '   ')).toBe(false);
    });

    it('throws when sessionId is empty on creation', async () => {
      await expect(createCsrfToken('')).rejects.toThrow('sessionId required');
    });

    it('rejects tampered signature', async () => {
      const token = await createCsrfToken(SESSION_ID);
      const [nonce] = token.split('.');
      const tampered = nonce + '.' + '0'.repeat(64);
      expect(await validateCsrfToken(tampered, SESSION_ID)).toBe(false);
    });
  });

  describe('createPublicCsrfToken / validatePublicCsrfToken', () => {
    it('creates a token in nonce.signature format', async () => {
      const token = await createPublicCsrfToken(VISITOR_ID);
      expect(token).toContain('.');
      const [nonce, sig] = token.split('.');
      expect(nonce.length).toBe(32);
      expect(sig.length).toBe(64);
    });

    it('validates a token for the correct visitor', async () => {
      const token = await createPublicCsrfToken(VISITOR_ID);
      const valid = await validatePublicCsrfToken(token, VISITOR_ID);
      expect(valid).toBe(true);
    });

    it('rejects a token for a different visitor', async () => {
      const token = await createPublicCsrfToken(VISITOR_ID);
      const valid = await validatePublicCsrfToken(token, 'other-visitor');
      expect(valid).toBe(false);
    });

    it('session token is invalid as public token', async () => {
      const token = await createCsrfToken(SESSION_ID);
      // A session CSRF token should not validate as a public one
      const valid = await validatePublicCsrfToken(token, SESSION_ID);
      expect(valid).toBe(false);
    });

    it('public token is invalid as session token', async () => {
      const token = await createPublicCsrfToken(VISITOR_ID);
      const valid = await validateCsrfToken(token, VISITOR_ID);
      expect(valid).toBe(false);
    });

    it('throws when visitorId is empty on creation', async () => {
      await expect(createPublicCsrfToken('')).rejects.toThrow('visitorId required');
    });
  });
});
