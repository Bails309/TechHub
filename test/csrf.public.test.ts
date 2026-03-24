import { describe, it, expect, vi } from 'vitest';

// Set NEXTAUTH_SECRET for CSRF operations
process.env.NEXTAUTH_SECRET = 'test-secret-for-csrf-unit-tests-only';

import {
  createCsrfToken,
  validateCsrfToken,
  createPublicCsrfToken,
  validatePublicCsrfToken,
} from '../src/lib/csrf';

describe('Public CSRF Tokens', () => {
  const visitorId = 'visitor-abc123';

  it('creates a valid public CSRF token', () => {
    const token = createPublicCsrfToken(visitorId);
    expect(token).toContain('.');
    const [nonce, sig] = token.split('.');
    expect(nonce.length).toBeGreaterThan(0);
    expect(sig.length).toBeGreaterThan(0);
  });

  it('validates a correctly created public token', () => {
    const token = createPublicCsrfToken(visitorId);
    expect(validatePublicCsrfToken(token, visitorId)).toBe(true);
  });

  it('rejects public token with wrong visitorId', () => {
    const token = createPublicCsrfToken(visitorId);
    expect(validatePublicCsrfToken(token, 'wrong-visitor')).toBe(false);
  });

  it('rejects public token with tampered signature', () => {
    const token = createPublicCsrfToken(visitorId);
    const [nonce] = token.split('.');
    expect(validatePublicCsrfToken(nonce + '.tampered', visitorId)).toBe(false);
  });

  it('rejects empty inputs', () => {
    expect(validatePublicCsrfToken('', visitorId)).toBe(false);
    expect(validatePublicCsrfToken('valid.token', '')).toBe(false);
  });

  it('throws on empty visitorId for creation', () => {
    expect(() => createPublicCsrfToken('')).toThrow('visitorId');
  });

  it('public and session tokens are not interchangeable', () => {
    const sessionToken = createCsrfToken('session-123');
    const publicToken = createPublicCsrfToken(visitorId);

    // Session token should not validate as public
    expect(validatePublicCsrfToken(sessionToken, 'session-123')).toBe(false);
    // Public token should not validate as session
    expect(validateCsrfToken(publicToken, visitorId)).toBe(false);
  });

  it('rejects token without dot separator', () => {
    expect(validatePublicCsrfToken('nodot', visitorId)).toBe(false);
  });
});
