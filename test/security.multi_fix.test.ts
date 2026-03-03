import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as uploadsGet } from '../src/app/uploads/[...path]/route';

// Mock NextResponse for uploads test
vi.mock('next/server', () => ({
    NextResponse: class {
        static json(body: any, init?: any) {
            return { type: 'json', body, status: init?.status ?? 200 };
        }
        constructor(body: any, init?: any) {
            return { type: 'response', body, status: init?.status ?? 200, headers: init?.headers };
        }
    }
}));

// Mock readIcon for uploads test
vi.mock('@/lib/storage', () => ({
    readIcon: vi.fn()
}));

// Mock getServerAuthSession to avoid SSO decryption failures in unit tests
vi.mock('@/lib/auth', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        getServerAuthSession: vi.fn(async () => ({ user: { id: 'test-user' } }))
    };
});

describe('Multi-Security Fixes', () => {

    describe('IP Spoofing (getClientIp)', () => {
        beforeEach(() => {
            vi.resetModules();
        });

        it('fails closed when remoteAddr is missing and trustProxy is true (default)', async () => {
            vi.stubEnv('TRUST_PROXY', 'true');
            vi.stubEnv('TRUSTED_PROXIES', '192.168.1.1/32');
            const { getClientIp } = await import('../src/lib/auth');

            const headers = new Headers({ 'x-forwarded-for': '8.8.8.8' });
            const ip = getClientIp(headers, undefined);

            // Since NODE_ENV is test, it returns undefined
            expect(ip).toBeUndefined();
        });

        it('allows proxy headers when remoteAddr is missing if ALLOW_MISSING_REMOTE_IP=true', async () => {
            vi.stubEnv('TRUST_PROXY', 'true');
            vi.stubEnv('ALLOW_MISSING_REMOTE_IP', 'true');
            const { getClientIp } = await import('../src/lib/auth');

            const headers = new Headers({ 'x-forwarded-for': '8.8.8.8' });
            const ip = getClientIp(headers, undefined);
            expect(ip).toBe('8.8.8.8');
        });

        it('trusts headers when remoteAddr is a trusted proxy', async () => {
            vi.stubEnv('TRUST_PROXY', 'true');
            vi.stubEnv('TRUSTED_PROXIES', '192.168.1.1/32');
            const { getClientIp } = await import('../src/lib/auth');

            const headers = new Headers({ 'x-forwarded-for': '8.8.8.8' });
            const ip = getClientIp(headers, '192.168.1.1');
            expect(ip).toBe('8.8.8.8');
        });

        it('ignores headers when remoteAddr is NOT a trusted proxy', async () => {
            vi.stubEnv('TRUST_PROXY', 'true');
            vi.stubEnv('TRUSTED_PROXIES', '192.168.1.1/32');
            const { getClientIp } = await import('../src/lib/auth');

            const headers = new Headers({ 'x-forwarded-for': '8.8.8.8' });
            const ip = getClientIp(headers, '1.1.1.1');
            expect(ip).toBe('1.1.1.1');
        });
    });

    describe('Path Traversal (Uploads Route)', () => {
        it('blocks paths with ".." segments', async () => {
            const req = new Request('http://localhost/api/uploads/..%2fsecret.txt');
            const context = { params: Promise.resolve({ path: ['..', 'secret.txt'] }) };

            const res: any = await uploadsGet(req, context);
            expect(res.type).toBe('json');
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Invalid path');
        });

        it('blocks paths with "." segments', async () => {
            const req = new Request('http://localhost/api/uploads/.%2fsecret.txt');
            const context = { params: Promise.resolve({ path: ['.', 'secret.txt'] }) };

            const res: any = await uploadsGet(req, context);
            expect(res.status).toBe(400);
        });

        it('blocks segments containing "/"', async () => {
            const req = new Request('http://localhost/api/uploads/foo%2fbar');
            const context = { params: Promise.resolve({ path: ['foo/bar'] }) };

            const res: any = await uploadsGet(req, context);
            expect(res.status).toBe(400);
        });

        it('allows valid paths', async () => {
            const { readIcon } = await import('@/lib/storage');
            (readIcon as any).mockResolvedValue({ buffer: Buffer.from('test'), contentType: 'image/png' });

            const req = new Request('http://localhost/api/uploads/icon.png');
            const context = { params: Promise.resolve({ path: ['icon.png'] }) };

            const res: any = await uploadsGet(req, context);
            expect(res.status).toBe(200);
        });
    });

    describe('Key Rotation Timing Leak (crypto)', () => {
        const key1 = Buffer.alloc(32, 'a').toString('base64');
        const key2 = Buffer.alloc(32, 'b').toString('base64');

        beforeEach(() => {
            vi.resetModules();
        });

        it('decrypts V2 payload with correct keyId', async () => {
            vi.stubEnv('SSO_MASTER_KEY', JSON.stringify({
                current: 'k1',
                keys: { k1: key1, k2: key2 }
            }));
            const { decryptSecret, encryptSecretWithKeyId, getSecretKeyState } = await import('../src/lib/crypto');
            getSecretKeyState(); // Reset cache

            const secret = 'my-secret';
            const encrypted = encryptSecretWithKeyId(secret, 'k2'); // Use k2
            const decrypted = decryptSecret(encrypted);
            expect(decrypted).toBe(secret);
        });

        it('throws immediately for V2 payload if keyId fails (no fallback loop)', async () => {
            vi.stubEnv('SSO_MASTER_KEY', JSON.stringify({
                current: 'k1',
                keys: { k1: key1, k2: key2 }
            }));
            const { decryptSecret, encryptSecretWithKeyId, getSecretKeyState } = await import('../src/lib/crypto');
            getSecretKeyState();

            const secret = 'my-secret';
            const encrypted = encryptSecretWithKeyId(secret, 'k2');

            // Temporarily change k2 in env so k1 remains valid but k2 is "wrong"
            vi.stubEnv('SSO_MASTER_KEY', JSON.stringify({
                current: 'k1',
                keys: { k1: key1, k2: Buffer.alloc(32, 'c').toString('base64') }
            }));
            getSecretKeyState(); // Reset cache to see the "wrong" k2

            // Now k2 is wrong. Previously it would have fallen back to k1 and tried it.
            // Now it should throw directly.
            expect(() => decryptSecret(encrypted)).toThrow();
        });

        it('maintains fallback for V1 payloads', async () => {
            // V1 tokens (formatted as iv:tag:data) should still try all keys
            vi.stubEnv('SSO_MASTER_KEY', JSON.stringify({
                current: 'k1',
                keys: { k1: key1, k2: key2 }
            }));
            const { decryptSecret, getSecretKeyState } = await import('../src/lib/crypto');
            getSecretKeyState();

            // Simulate a V1 token encrypted with k2
            const cryptoNative = await import('crypto');
            const iv = cryptoNative.randomBytes(12);
            const cipher = cryptoNative.createCipheriv('aes-256-gcm', Buffer.from(key2, 'base64'), iv);
            const data = Buffer.concat([cipher.update('v1-secret', 'utf8'), cipher.final()]);
            const tag = cipher.getAuthTag();
            const v1Payload = `v1:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;

            // Even though current is k1, it should fallback to k2 and succeed
            const decrypted = decryptSecret(v1Payload);
            expect(decrypted).toBe('v1-secret');
        });
    });
});
