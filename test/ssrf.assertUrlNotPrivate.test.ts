import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dns/promises to control DNS resolution in tests
vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'dns/promises';
import { isPublicIp, assertUrlNotPrivate } from '../src/lib/ssrf';

const mockLookup = lookup as ReturnType<typeof vi.fn>;

describe('ssrf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isPublicIp', () => {
    it('returns true for public IPv4', () => {
      expect(isPublicIp('93.184.216.34')).toBe(true);
    });

    it('returns false for private IPv4', () => {
      expect(isPublicIp('192.168.1.1')).toBe(false);
      expect(isPublicIp('10.0.0.1')).toBe(false);
      expect(isPublicIp('172.16.0.1')).toBe(false);
    });

    it('returns false for loopback', () => {
      expect(isPublicIp('127.0.0.1')).toBe(false);
    });

    it('returns false for invalid input', () => {
      expect(isPublicIp('not-an-ip')).toBe(false);
      expect(isPublicIp('')).toBe(false);
    });
  });

  describe('assertUrlNotPrivate', () => {
    it('rejects non-URL input', async () => {
      await expect(assertUrlNotPrivate('not a url')).rejects.toThrow('valid URL');
    });

    it('rejects non-http/https protocols', async () => {
      await expect(assertUrlNotPrivate('ftp://example.com')).rejects.toThrow('http or https');
      await expect(assertUrlNotPrivate('javascript:alert(1)')).rejects.toThrow('http or https');
    });

    it('rejects localhost', async () => {
      await expect(assertUrlNotPrivate('https://localhost/path')).rejects.toThrow('public hostname');
      await expect(assertUrlNotPrivate('https://sub.localhost')).rejects.toThrow('public hostname');
    });

    it('rejects .local hostnames', async () => {
      await expect(assertUrlNotPrivate('https://myhost.local')).rejects.toThrow('public hostname');
    });

    it('rejects private IP literals', async () => {
      await expect(assertUrlNotPrivate('https://192.168.1.1/bucket')).rejects.toThrow('public IP');
      await expect(assertUrlNotPrivate('https://10.0.0.1/path')).rejects.toThrow('public IP');
      await expect(assertUrlNotPrivate('https://127.0.0.1/path')).rejects.toThrow('public IP');
    });

    it('accepts public IP literals', async () => {
      const addr = await assertUrlNotPrivate('https://93.184.216.34/path');
      expect(addr).toBe('93.184.216.34');
    });

    it('resolves public hostname via DNS and returns first address', async () => {
      mockLookup.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ]);

      const addr = await assertUrlNotPrivate('https://example.com');
      expect(addr).toBe('93.184.216.34');
      expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true, verbatim: true });
    });

    it('rejects hostname that resolves to private IP', async () => {
      mockLookup.mockResolvedValue([
        { address: '10.0.0.1', family: 4 },
      ]);

      await expect(assertUrlNotPrivate('https://evil.example.com')).rejects.toThrow('public hostname');
    });

    it('rejects hostname with mixed public/private IPs', async () => {
      mockLookup.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ]);

      await expect(assertUrlNotPrivate('https://mixed.example.com')).rejects.toThrow('public hostname');
    });

    it('rejects hostname that resolves to no records', async () => {
      mockLookup.mockResolvedValue([]);

      await expect(assertUrlNotPrivate('https://nxdomain.example.com')).rejects.toThrow('could not be resolved');
    });

    it('rejects hostname with only invalid family records', async () => {
      mockLookup.mockResolvedValue([
        { address: '', family: 4 },
      ]);

      await expect(assertUrlNotPrivate('https://bad.example.com')).rejects.toThrow('no valid IPs');
    });
  });
});
