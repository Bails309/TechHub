import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('crypto.ts – gap coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  const VALID_KEY = 'Xq6GDOrUKS+Tr2w/l70bbfy6Rg6LCQE53ddlkSv9G6E=';

  it('getSecretKeyState returns missing when SSO_MASTER_KEY is not set', async () => {
    delete process.env.SSO_MASTER_KEY;
    const { getSecretKeyState } = await import('../src/lib/crypto');
    expect(getSecretKeyState()).toBe('missing');
  });

  it('hasSecretKey returns true for a valid key', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    const { hasSecretKey } = await import('../src/lib/crypto');
    expect(hasSecretKey()).toBe(true);
  });

  it('hasSecretKey returns false when key is missing', async () => {
    delete process.env.SSO_MASTER_KEY;
    const { hasSecretKey } = await import('../src/lib/crypto');
    expect(hasSecretKey()).toBe(false);
  });

  it('encryptSecretWithKeyId encrypts with a specific key', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    const { encryptSecretWithKeyId, decryptSecret } = await import('../src/lib/crypto');
    const encrypted = encryptSecretWithKeyId('test-value', 'legacy');
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe('test-value');
  });

  it('encryptSecretWithKeyId throws for unknown key ID', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    const { encryptSecretWithKeyId } = await import('../src/lib/crypto');
    expect(() => encryptSecretWithKeyId('test', 'nonexistent')).toThrow('Unknown SSO master key');
  });

  it('getSecretKeyId extracts key ID from V2 payload', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    const { getSecretKeyId, encryptSecret } = await import('../src/lib/crypto');
    const encrypted = encryptSecret('hello');
    const keyId = getSecretKeyId(encrypted);
    expect(keyId).toBe('legacy');
  });

  it('getSecretKeyId returns null for V1 payloads', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    const { getSecretKeyId } = await import('../src/lib/crypto');
    expect(getSecretKeyId('v1:iv:tag:data')).toBeNull();
  });

  it('invalidateKeyRingCache forces re-parse on next call', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    const { invalidateKeyRingCache, encryptSecret, decryptSecret } = await import('../src/lib/crypto');
    const enc1 = encryptSecret('before-invalidation');
    invalidateKeyRingCache();
    // After invalidation, should still work (re-parses from same env var)
    const enc2 = encryptSecret('after-invalidation');
    expect(decryptSecret(enc1)).toBe('before-invalidation');
    expect(decryptSecret(enc2)).toBe('after-invalidation');
  });

  it('decryptSecret throws for invalid payload prefix', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    const { decryptSecret } = await import('../src/lib/crypto');
    expect(() => decryptSecret('v99:garbage')).toThrow('Invalid secret payload');
  });

  it('encryptSecret with envelope encryption (V3)', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    vi.stubEnv('SSO_ENVELOPE_ENCRYPTION', 'true');
    const { encryptSecret, decryptSecret } = await import('../src/lib/crypto');
    const encrypted = encryptSecret('envelope-test');
    expect(encrypted.startsWith('v3:')).toBe(true);
    expect(decryptSecret(encrypted)).toBe('envelope-test');
  });

  it('getCurrentKeyId returns the current key ID', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    const { getCurrentKeyId } = await import('../src/lib/crypto');
    expect(getCurrentKeyId()).toBe('legacy');
  });

  it('decryptSecret throws for V3 payload with missing parts', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    const { decryptSecret } = await import('../src/lib/crypto');
    // V3 payload without enough parts
    expect(() => decryptSecret('v3:keyid:a:b')).toThrow();
  });

  it('decryptSecret fallback loop tries all keys', async () => {
    vi.stubEnv('SSO_MASTER_KEY', VALID_KEY);
    const { encryptSecret, decryptSecret, invalidateKeyRingCache } = await import('../src/lib/crypto');
    // Encrypt with current key
    const enc = encryptSecret('fallback-loop-test');
    // Tamper with keyId portion to force preferred-key miss and loop fallback
    const parts = enc.split(':');
    parts[1] = 'nonexistent-key';
    const tampered = parts.join(':');
    // Should still decrypt since the fallback loop tries all keys including legacy
    const result = decryptSecret(tampered);
    expect(result).toBe('fallback-loop-test');
  });
});
