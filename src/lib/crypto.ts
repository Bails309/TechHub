import crypto from 'crypto';

const KEY_ENV = 'SSO_MASTER_KEY';
const ENVELOPE_ENV = 'SSO_ENVELOPE_ENCRYPTION';
const TOKEN_PREFIX_V1 = 'v1';
const TOKEN_PREFIX_V2 = 'v2';
const TOKEN_PREFIX_V3 = 'v3';
const LEGACY_KEY_ID = 'legacy';

type KeyRing = {
  currentId: string;
  keys: Map<string, Buffer>;
  orderedIds: string[];
};

function parseKey(raw: string, label: string) {
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${label} must be 32 bytes (base64-encoded)`);
  }
  return key;
}

// Cache the parsed key ring so we don't re-parse the base64 key on every
// encrypt/decrypt operation. Parsing is relatively expensive and unnecessary
// to repeat for each call.
let cachedKeyRing: KeyRing | null = null;
function loadKeyRing(): KeyRing {
  if (cachedKeyRing) return cachedKeyRing;
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`${KEY_ENV} is not set`);
  }

  // Try parsing as JSON first (object or array)
  try {
    if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Simple list of keys
        const keys = new Map<string, Buffer>();
        const orderedIds: string[] = [];
        parsed.forEach((k, i) => {
          const id = `k${i}`;
          keys.set(id, parseKey(String(k), `${KEY_ENV}[${i}]`));
          orderedIds.push(id);
        });
        cachedKeyRing = { currentId: 'k0', keys, orderedIds };
        return cachedKeyRing;
      } else if (parsed && typeof parsed === 'object' && parsed.keys) {
        // Detailed key map
        const keys = new Map<string, Buffer>();
        const orderedIds: string[] = [];
        for (const [id, val] of Object.entries(parsed.keys)) {
          keys.set(id, parseKey(String(val), `${KEY_ENV}.keys.${id}`));
          orderedIds.push(id);
        }
        const currentId = parsed.current || orderedIds[0];
        if (!keys.has(currentId)) {
          throw new Error(`Current key ID "${currentId}" not found in keys list`);
        }
        cachedKeyRing = { currentId, keys, orderedIds };
        return cachedKeyRing;
      }
    }
  } catch (err) {
    // If it looked like JSON but failed to parse, we should probably throw
    // but here we fall back to comma-separated to be safe for legacy reasons
    // unless it's clearly a JSON error.
    if (err instanceof SyntaxError && (raw.trim().startsWith('{') || raw.trim().startsWith('['))) {
      throw err;
    }
  }

  // Fallback: Comma-separated or single key
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const keys = new Map<string, Buffer>();
    const orderedIds: string[] = [];
    parts.forEach((k, i) => {
      const id = `k${i}`;
      keys.set(id, parseKey(k, `${KEY_ENV}[${i}]`));
      orderedIds.push(id);
    });
    cachedKeyRing = { currentId: 'k0', keys, orderedIds };
  } else {
    // Legacy single key
    const key = parseKey(raw, KEY_ENV);
    cachedKeyRing = {
      currentId: LEGACY_KEY_ID,
      keys: new Map([[LEGACY_KEY_ID, key]]),
      orderedIds: [LEGACY_KEY_ID]
    };
  }

  return cachedKeyRing;
}

function isEnvelopeEnabled() {
  return process.env[ENVELOPE_ENV] === 'true';
}

function encryptWithKey(value: string, keyId: string, key: Buffer, useEnvelope: boolean) {
  if (useEnvelope) {
    const dataKey = crypto.randomBytes(32);
    const wrapIv = crypto.randomBytes(12);
    const wrapCipher = crypto.createCipheriv('aes-256-gcm', key, wrapIv);
    const wrappedKey = Buffer.concat([wrapCipher.update(dataKey), wrapCipher.final()]);
    const wrapTag = wrapCipher.getAuthTag();

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      TOKEN_PREFIX_V3,
      keyId,
      wrapIv.toString('base64'),
      wrapTag.toString('base64'),
      wrappedKey.toString('base64'),
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64')
    ].join(':');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_PREFIX_V2,
    keyId,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
}

export function encryptSecret(value: string) {
  const ring = loadKeyRing();
  const key = ring.keys.get(ring.currentId);
  if (!key) {
    throw new Error('No active SSO master key available');
  }
  return encryptWithKey(value, ring.currentId, key, isEnvelopeEnabled());
}

export function encryptSecretWithKeyId(value: string, keyId: string) {
  const ring = loadKeyRing();
  const key = ring.keys.get(keyId);
  if (!key) {
    throw new Error(`Unknown SSO master key id: ${keyId}`);
  }
  return encryptWithKey(value, keyId, key, isEnvelopeEnabled());
}

export function getSecretKeyId(payload: string) {
  const [version, keyId] = payload.split(':');
  if ((version === TOKEN_PREFIX_V2 || version === TOKEN_PREFIX_V3) && keyId) {
    return keyId;
  }
  return null;
}

export function getCurrentKeyId() {
  return loadKeyRing().currentId;
}

export function decryptSecret(payload: string) {
  const parts = payload.split(':');
  const version = parts[0];
  if (version !== TOKEN_PREFIX_V1 && version !== TOKEN_PREFIX_V2 && version !== TOKEN_PREFIX_V3) {
    throw new Error('Invalid secret payload');
  }

  const ring = loadKeyRing();

  // For V2/V3, we have a preferred keyId. Try it first for O(1) performance.
  const preferredKeyId = (version === TOKEN_PREFIX_V2 || version === TOKEN_PREFIX_V3) ? parts[1] : null;

  if (preferredKeyId && ring.keys.has(preferredKeyId)) {
    try {
      return attemptDecryption(version, preferredKeyId, ring.keys.get(preferredKeyId)!, parts);
    } catch (err) {
      console.debug('[CRYPTO] Fast-path decryption failed for keyId=%s, falling back to full ring', preferredKeyId);
    }
  }

  // Fallback: Loop through all keys (including the preferred one again if it failed,
  // to keep the logic simple, or we could skip it).
  let lastError: unknown;
  for (const id of ring.orderedIds) {
    const key = ring.keys.get(id);
    if (!key) continue;
    try {
      return attemptDecryption(version, id, key, parts);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(`Unable to decrypt ${version} secret`);
}

/** Helper to attempt decryption for a specific version and key */
function attemptDecryption(version: string, _keyId: string, key: Buffer, parts: string[]): string {
  if (version === TOKEN_PREFIX_V3) {
    // V3: [v3, keyId, wrapIv, wrapTag, wrappedKey, iv, tag, data]
    const [, , wrapIvB64, wrapTagB64, wrappedKeyB64, ivB64, tagB64, dataB64] = parts;
    if (!wrapIvB64 || !wrapTagB64 || !wrappedKeyB64 || !ivB64 || !tagB64 || !dataB64) {
      throw new Error('Invalid V3 payload');
    }
    const wrapIv = Buffer.from(wrapIvB64, 'base64');
    const wrapTag = Buffer.from(wrapTagB64, 'base64');
    const wrappedKey = Buffer.from(wrappedKeyB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const wrapDecipher = crypto.createDecipheriv('aes-256-gcm', key, wrapIv);
    wrapDecipher.setAuthTag(wrapTag);
    const dataKey = Buffer.concat([wrapDecipher.update(wrappedKey), wrapDecipher.final()]);

    const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  }

  if (version === TOKEN_PREFIX_V2) {
    // V2: [v2, keyId, iv, tag, data]
    const [, , ivB64, tagB64, dataB64] = parts;
    if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid V2 payload');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  }

  // V1: [v1, iv, tag, data]
  const [, ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid V1 payload');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

export type KeyState = 'valid' | 'missing' | 'invalid';

export function getSecretKeyState(): KeyState {
  const raw = process.env[KEY_ENV];
  if (!raw) return 'missing';
  try {
    // Clearing the cache for this check ensures we're validating the CURRENT env
    cachedKeyRing = null;
    loadKeyRing();
    return 'valid';
  } catch {
    return 'invalid';
  }
}

export function hasSecretKey() {
  return getSecretKeyState() === 'valid';
}
