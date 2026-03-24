import { describe, it, expect } from 'vitest';
import { normalizeIp, isPrivateOrLocal, readHeader } from '../src/lib/ip';

describe('normalizeIp', () => {
    it('normalizes a plain IPv4 address', () => {
        expect(normalizeIp('203.0.113.5')).toBe('203.0.113.5');
    });

    it('normalizes IPv4 with port', () => {
        expect(normalizeIp('203.0.113.5:8080')).toBe('203.0.113.5');
    });

    it('normalizes a plain IPv6 address', () => {
        const result = normalizeIp('::1');
        expect(result).toBe('::1');
    });

    it('normalizes IPv6 in brackets', () => {
        const result = normalizeIp('[::1]');
        expect(result).toBe('::1');
    });

    it('maps IPv4-mapped IPv6 to IPv4', () => {
        const result = normalizeIp('::ffff:192.168.1.1');
        expect(result).toBe('192.168.1.1');
    });

    it('returns undefined for empty string', () => {
        expect(normalizeIp('')).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
        expect(normalizeIp(undefined)).toBeUndefined();
    });

    it('returns undefined for invalid IP', () => {
        expect(normalizeIp('not-an-ip')).toBeUndefined();
    });

    it('normalizes whitespace-padded IPs', () => {
        expect(normalizeIp('  10.0.0.1  ')).toBe('10.0.0.1');
    });
});

describe('isPrivateOrLocal', () => {
    it('returns true for loopback', () => {
        expect(isPrivateOrLocal('127.0.0.1')).toBe(true);
    });

    it('returns true for private 10.x', () => {
        expect(isPrivateOrLocal('10.0.0.1')).toBe(true);
    });

    it('returns true for private 192.168.x', () => {
        expect(isPrivateOrLocal('192.168.1.1')).toBe(true);
    });

    it('returns true for private 172.16.x', () => {
        expect(isPrivateOrLocal('172.16.0.1')).toBe(true);
    });

    it('returns false for public IPs', () => {
        expect(isPrivateOrLocal('8.8.8.8')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isPrivateOrLocal(undefined)).toBe(false);
    });
});

describe('readHeader', () => {
    it('reads from Headers object', () => {
        const h = new Headers({ 'x-forwarded-for': '1.2.3.4' });
        expect(readHeader(h, 'x-forwarded-for')).toBe('1.2.3.4');
    });

    it('reads from plain object', () => {
        const h = { 'x-forwarded-for': '1.2.3.4' };
        expect(readHeader(h, 'x-forwarded-for')).toBe('1.2.3.4');
    });

    it('reads first element from array value', () => {
        const h = { 'x-forwarded-for': ['1.2.3.4', '5.6.7.8'] };
        expect(readHeader(h, 'x-forwarded-for')).toBe('1.2.3.4');
    });

    it('returns undefined for missing header', () => {
        const h = new Headers();
        expect(readHeader(h, 'x-missing')).toBeUndefined();
    });

    it('returns undefined for undefined headers source', () => {
        expect(readHeader(undefined, 'anything')).toBeUndefined();
    });
});
