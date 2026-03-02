import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertUrlNotPrivate } from '../src/lib/ssrf';
import * as dns from 'dns/promises';

vi.mock('dns/promises', () => ({
    lookup: vi.fn(),
}));

describe('DNS Rebinding (TOCTOU SSRF) Protection', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns the resolved IP address for a public hostname', async () => {
        const mockLookup = vi.mocked(dns.lookup);
        mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any);

        const ip = await assertUrlNotPrivate('https://example.com');
        expect(ip).toBe('8.8.8.8');
        expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true, verbatim: true });
    });

    it('throws for private IP addresses', async () => {
        const mockLookup = vi.mocked(dns.lookup);
        mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any);

        await expect(assertUrlNotPrivate('https://evil.com')).rejects.toThrow('Endpoint must be a public hostname');
    });

    it('is immune to DNS rebinding because it returns the verified IP', async () => {
        const mockLookup = vi.mocked(dns.lookup);

        // Simulate a successful lookup
        mockLookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }] as any);

        const ip = await assertUrlNotPrivate('https://rebound.com');
        expect(ip).toBe('8.8.8.8');

        // The key is that the caller now HAS '8.8.8.8' and will use it, 
        // bypassing any subsequent DNS record changes for 'rebound.com'.
    });

    it('returns the hostname for IP literals if they are public', async () => {
        const ip = await assertUrlNotPrivate('https://1.1.1.1');
        expect(ip).toBe('1.1.1.1');
    });

    it('throws for private IP literals', async () => {
        await expect(assertUrlNotPrivate('https://192.168.1.1')).rejects.toThrow('Endpoint must be a public IP address');
    });

    it('throws for invalid URLs', async () => {
        await expect(assertUrlNotPrivate('not-a-url')).rejects.toThrow('Endpoint must be a valid URL');
    });

    it('throws for non-http/https protocols', async () => {
        await expect(assertUrlNotPrivate('ftp://example.com')).rejects.toThrow('Endpoint must use http or https');
    });

    it('throws for localhost hostnames', async () => {
        await expect(assertUrlNotPrivate('http://localhost')).rejects.toThrow('Endpoint must be a public hostname');
        await expect(assertUrlNotPrivate('http://test.local')).rejects.toThrow('Endpoint must be a public hostname');
    });
});
