import { describe, it, expect } from 'vitest';
import { sanitizeIconUrl } from '../src/lib/sanitizeIconUrl';

describe('sanitizeIconUrl', () => {
    const origin = 'https://app.example.com';

    it('allows valid /uploads/ paths', () => {
        expect(sanitizeIconUrl('/uploads/abc123.png', origin)).toBe('/uploads/abc123.png');
    });

    it('allows blob: URLs', () => {
        expect(sanitizeIconUrl('blob:https://app.example.com/uuid', origin)).toBe(
            'blob:https://app.example.com/uuid'
        );
    });

    it('blocks javascript: URIs', () => {
        expect(sanitizeIconUrl('javascript:alert(1)', origin)).toBeNull();
        expect(sanitizeIconUrl('JAVASCRIPT:alert(1)', origin)).toBeNull();
        // Test with whitespace to ensure trimming works
        expect(sanitizeIconUrl('  javascript:alert(1)  ', origin)).toBeNull();
    });

    it('blocks data: URIs', () => {
        expect(sanitizeIconUrl('data:text/html,<script>alert(1)</script>', origin)).toBeNull();
        expect(sanitizeIconUrl('DATA:text/html,<script>alert(1)</script>', origin)).toBeNull();
    });

    it('blocks vbscript: URIs', () => {
        expect(sanitizeIconUrl('vbscript:msgbox(1)', origin)).toBeNull();
    });

    it('blocks paths outside /uploads/', () => {
        expect(sanitizeIconUrl('/etc/passwd', origin)).toBeNull();
        expect(sanitizeIconUrl('/admin/secret', origin)).toBeNull();
        expect(sanitizeIconUrl('/api/users', origin)).toBeNull();
    });

    it('blocks cross-origin URLs', () => {
        expect(sanitizeIconUrl('https://evil.com/uploads/icon.png', origin)).toBeNull();
        expect(sanitizeIconUrl('http://app.example.com.evil.com/uploads/icon.png', origin)).toBeNull();
    });

    it('allows S3 URLs with /uploads/ path', () => {
        const s3Url = 'https://mybucket.s3.us-east-1.amazonaws.com/uploads/uuid.png';
        const hostname = 'mybucket.s3.us-east-1.amazonaws.com';
        expect(sanitizeIconUrl(s3Url, origin, hostname)).toBe('/uploads/uuid.png');
    });

    it('blocks S3 URLs missing /uploads/ path', () => {
        const s3Url = 'https://mybucket.s3.us-east-1.amazonaws.com/malicious.js';
        expect(sanitizeIconUrl(s3Url, origin)).toBeNull();
    });

    it('blocks non-S3 external URLs even if they have /uploads/ path', () => {
        const externalUrl = 'https://evil.amazonaws.com.hacker.net/uploads/uuid.png';
        expect(sanitizeIconUrl(externalUrl, origin)).toBeNull();
    });

    it('returns null for empty/null input', () => {
        expect(sanitizeIconUrl(null, origin)).toBeNull();
        expect(sanitizeIconUrl('', origin)).toBeNull();
        expect(sanitizeIconUrl(undefined, origin)).toBeNull();
    });
});
