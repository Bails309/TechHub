import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Crypto Envelope Encryption (V3)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SSO_MASTER_KEY;
    delete process.env.SSO_ENVELOPE_ENCRYPTION;
  });

  const KEY1 = Buffer.alloc(32, 1).toString('base64');
  const KEY2 = Buffer.alloc(32, 2).toString('base64');

  it('produces V3 tokens when SSO_ENVELOPE_ENCRYPTION=true', async () => {
    process.env.SSO_MASTER_KEY = KEY1;
    process.env.SSO_ENVELOPE_ENCRYPTION = 'true';
    const { encryptSecret, decryptSecret } = await import('../src/lib/crypto');

    const encrypted = encryptSecret('envelope-secret');
    expect(encrypted.startsWith('v3:')).toBe(true);

    // V3 format: v3:keyId:wrapIv:wrapTag:wrappedKey:iv:tag:data
    const parts = encrypted.split(':');
    expect(parts.length).toBe(8);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe('envelope-secret');
  });

  it('produces V2 tokens when envelope is disabled', async () => {
    process.env.SSO_MASTER_KEY = KEY1;
    process.env.SSO_ENVELOPE_ENCRYPTION = 'false';
    const { encryptSecret } = await import('../src/lib/crypto');

    const encrypted = encryptSecret('v2-secret');
    expect(encrypted.startsWith('v2:')).toBe(true);

    // V2 format: v2:keyId:iv:tag:data
    const parts = encrypted.split(':');
    expect(parts.length).toBe(5);
  });

  it('V2 tokens are default when SSO_ENVELOPE_ENCRYPTION is unset', async () => {
    process.env.SSO_MASTER_KEY = KEY1;
    const { encryptSecret } = await import('../src/lib/crypto');

    const encrypted = encryptSecret('default-secret');
    expect(encrypted.startsWith('v2:')).toBe(true);
  });

  it('can decrypt V3 token with key ring rotation', async () => {
    // Encrypt with KEY1 using envelope
    process.env.SSO_MASTER_KEY = KEY1;
    process.env.SSO_ENVELOPE_ENCRYPTION = 'true';
    const crypto1 = await import('../src/lib/crypto');
    const encrypted = crypto1.encryptSecret('rotated-envelope');

    // Rotate: KEY2 current, KEY1 retained
    vi.resetModules();
    process.env.SSO_MASTER_KEY = `${KEY2},${KEY1}`;
    process.env.SSO_ENVELOPE_ENCRYPTION = 'true';
    const crypto2 = await import('../src/lib/crypto');

    expect(crypto2.decryptSecret(encrypted)).toBe('rotated-envelope');
  });

  it('getSecretKeyId extracts key ID from V2 token', async () => {
    process.env.SSO_MASTER_KEY = KEY1;
    const { encryptSecret, getSecretKeyId } = await import('../src/lib/crypto');

    const encrypted = encryptSecret('keyid-test');
    const keyId = getSecretKeyId(encrypted);
    expect(keyId).toBe('legacy');
  });

  it('getSecretKeyId extracts key ID from V3 token', async () => {
    process.env.SSO_MASTER_KEY = KEY1;
    process.env.SSO_ENVELOPE_ENCRYPTION = 'true';
    const { encryptSecret, getSecretKeyId } = await import('../src/lib/crypto');

    const encrypted = encryptSecret('keyid-v3');
    const keyId = getSecretKeyId(encrypted);
    expect(keyId).toBe('legacy');
  });

  it('getSecretKeyId returns null for V1 tokens', async () => {
    process.env.SSO_MASTER_KEY = KEY1;
    const { getSecretKeyId } = await import('../src/lib/crypto');

    // V1 does not have a keyId field
    expect(getSecretKeyId('v1:iv:tag:data')).toBeNull();
  });

  it('encryptSecretWithKeyId encrypts with a specific key', async () => {
    process.env.SSO_MASTER_KEY = JSON.stringify({
      current: 'main',
      keys: { main: KEY1, backup: KEY2 },
    });
    const { encryptSecretWithKeyId, decryptSecret, getSecretKeyId } = await import('../src/lib/crypto');

    const encrypted = encryptSecretWithKeyId('specific-key', 'backup');
    expect(getSecretKeyId(encrypted)).toBe('backup');
    expect(decryptSecret(encrypted)).toBe('specific-key');
  });

  it('encryptSecretWithKeyId throws for unknown key ID', async () => {
    process.env.SSO_MASTER_KEY = KEY1;
    const { encryptSecretWithKeyId } = await import('../src/lib/crypto');

    expect(() => encryptSecretWithKeyId('val', 'nonexistent')).toThrow('Unknown SSO master key id');
  });

  it('decryptSecret throws for invalid payload prefix', async () => {
    process.env.SSO_MASTER_KEY = KEY1;
    const { decryptSecret } = await import('../src/lib/crypto');

    expect(() => decryptSecret('v99:garbage')).toThrow('Invalid secret payload');
  });

  it('getSecretKeyState returns missing when no key set', async () => {
    delete process.env.SSO_MASTER_KEY;
    const { getSecretKeyState } = await import('../src/lib/crypto');
    expect(getSecretKeyState()).toBe('missing');
  });
});
