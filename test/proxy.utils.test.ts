import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-proxy-utils');

const { _testUtils } = await import('../src/proxy');
const { buildCsp, buf2hex, hex2buf, getSecureNonce, timingSafeEqual } = _testUtils;

describe('proxy utility functions', () => {
  describe('buf2hex', () => {
    it('converts an empty ArrayBuffer to empty string', () => {
      expect(buf2hex(new ArrayBuffer(0))).toBe('');
    });

    it('converts a single byte to two hex chars', () => {
      const buf = new Uint8Array([0xff]).buffer;
      expect(buf2hex(buf)).toBe('ff');
    });

    it('pads single-digit hex values with leading zero', () => {
      const buf = new Uint8Array([0x0a]).buffer;
      expect(buf2hex(buf)).toBe('0a');
    });

    it('converts multi-byte buffer correctly', () => {
      const buf = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
      expect(buf2hex(buf)).toBe('deadbeef');
    });
  });

  describe('hex2buf', () => {
    it('converts empty string to empty Uint8Array', () => {
      const result = hex2buf('');
      expect(result.length).toBe(0);
    });

    it('converts hex string to bytes', () => {
      const result = hex2buf('deadbeef');
      expect([...result]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    });

    it('round-trips with buf2hex', () => {
      const original = new Uint8Array([1, 2, 127, 255, 0]).buffer;
      const hex = buf2hex(original);
      const restored = hex2buf(hex);
      expect([...restored]).toEqual([1, 2, 127, 255, 0]);
    });
  });

  describe('getSecureNonce', () => {
    it('returns a 32-char hex string (16 bytes)', () => {
      const nonce = getSecureNonce();
      expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    });

    it('generates unique values on each call', () => {
      const nonces = new Set(Array.from({ length: 100 }, () => getSecureNonce()));
      expect(nonces.size).toBe(100);
    });
  });

  describe('timingSafeEqual', () => {
    it('returns true for identical strings', () => {
      expect(timingSafeEqual('hello', 'hello')).toBe(true);
    });

    it('returns false for different strings of same length', () => {
      expect(timingSafeEqual('hello', 'world')).toBe(false);
    });

    it('returns false for strings of different lengths', () => {
      expect(timingSafeEqual('short', 'longer-string')).toBe(false);
    });

    it('returns false for empty strings', () => {
      expect(timingSafeEqual('', '')).toBe(false);
    });

    it('returns false when one string is empty', () => {
      expect(timingSafeEqual('x', '')).toBe(false);
    });

    it('handles unicode characters', () => {
      expect(timingSafeEqual('héllo', 'héllo')).toBe(true);
      expect(timingSafeEqual('héllo', 'hello')).toBe(false);
    });
  });

  describe('buildCsp', () => {
    it('includes the nonce in script-src', () => {
      const csp = buildCsp('test-nonce-123');
      expect(csp).toContain("'nonce-test-nonce-123'");
    });

    it('includes the nonce in style-src', () => {
      const csp = buildCsp('abc');
      expect(csp).toContain("style-src 'self' 'nonce-abc'");
    });

    it('contains required security directives', () => {
      const csp = buildCsp('n');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("frame-ancestors 'self'");
    });

    it('includes strict-dynamic in script-src', () => {
      const csp = buildCsp('n');
      expect(csp).toContain("'strict-dynamic'");
    });

    it('uses semicolons to separate directives', () => {
      const csp = buildCsp('n');
      const directives = csp.split('; ');
      expect(directives.length).toBeGreaterThanOrEqual(8);
    });
  });
});
