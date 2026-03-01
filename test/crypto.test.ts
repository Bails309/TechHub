import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Multi-Key Rotation Support', () => {
    beforeEach(() => {
        vi.resetModules();
        delete process.env.SSO_MASTER_KEY;
    });

    const KEY1 = Buffer.alloc(32, 1).toString('base64');
    const KEY2 = Buffer.alloc(32, 2).toString('base64');
    const KEY3 = Buffer.alloc(32, 3).toString('base64');

    it('supports single legacy key', async () => {
        process.env.SSO_MASTER_KEY = KEY1;
        const { encryptSecret, decryptSecret, getCurrentKeyId } = await import('../src/lib/crypto');

        expect(getCurrentKeyId()).toBe('legacy');
        const encrypted = encryptSecret('hello');
        expect(decryptSecret(encrypted)).toBe('hello');
    });

    it('supports comma-separated keys', async () => {
        process.env.SSO_MASTER_KEY = `${KEY2},${KEY1}`;
        const { encryptSecret, decryptSecret, getCurrentKeyId } = await import('../src/lib/crypto');

        expect(getCurrentKeyId()).toBe('k0');
        const encrypted = encryptSecret('world');
        expect(decryptSecret(encrypted)).toBe('world');
    });

    it('supports JSON array', async () => {
        process.env.SSO_MASTER_KEY = JSON.stringify([KEY3, KEY2]);
        const { encryptSecret, decryptSecret, getCurrentKeyId } = await import('../src/lib/crypto');

        expect(getCurrentKeyId()).toBe('k0');
        const encrypted = encryptSecret('json-array');
        expect(decryptSecret(encrypted)).toBe('json-array');
    });

    it('supports JSON object with current key', async () => {
        process.env.SSO_MASTER_KEY = JSON.stringify({
            current: 'prod-v2',
            keys: {
                'prod-v1': KEY1,
                'prod-v2': KEY2
            }
        });
        const { encryptSecret, decryptSecret, getCurrentKeyId } = await import('../src/lib/crypto');

        expect(getCurrentKeyId()).toBe('prod-v2');
        const encrypted = encryptSecret('json-obj');
        expect(decryptSecret(encrypted)).toBe('json-obj');
    });

    it('performs decryption fallback during rotation', async () => {
        // Step 1: Encrypt with Key 1
        process.env.SSO_MASTER_KEY = KEY1;
        const crypto1 = await import('../src/lib/crypto');
        const encrypted = crypto1.encryptSecret('secret message');

        // Step 2: Rotate to Key 2 (keeping Key 1 in the ring)
        vi.resetModules();
        process.env.SSO_MASTER_KEY = `${KEY2},${KEY1}`;
        const crypto2 = await import('../src/lib/crypto');

        expect(crypto2.getCurrentKeyId()).toBe('k0'); // k0 is KEY2

        // Decrypt old message with new ring
        expect(crypto2.decryptSecret(encrypted)).toBe('secret message');

        // Encrypt new message with Key 2
        const encrypted2 = crypto2.encryptSecret('new message');
        expect(crypto2.decryptSecret(encrypted2)).toBe('new message');
    });

    it('returns invalid for malformed keys', async () => {
        process.env.SSO_MASTER_KEY = 'too-short';
        const { getSecretKeyState } = await import('../src/lib/crypto');
        expect(getSecretKeyState()).toBe('invalid');
    });
});
