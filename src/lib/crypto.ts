import crypto from 'crypto';

const KEY_ENV = 'SSO_MASTER_KEY';
const KEY_RING_ENV = 'SSO_MASTER_KEYS';
const KEY_ID_ENV = 'SSO_MASTER_KEY_ID';
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

function loadKeyRing(): KeyRing {
  const ringRaw = process.env[KEY_RING_ENV];
  if (ringRaw) {
    const keys = new Map<string, Buffer>();
    const entries = ringRaw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    for (const entry of entries) {
      const [id, value] = entry.split('=');
      const keyId = id?.trim();
      const keyValue = value?.trim();
      if (!keyId || !keyValue) {
        throw new Error(`${KEY_RING_ENV} entries must be in keyId=base64 format`);
      }
      if (keys.has(keyId)) {
        throw new Error(`${KEY_RING_ENV} contains duplicate keyId: ${keyId}`);
      }
      keys.set(keyId, parseKey(keyValue, `${KEY_RING_ENV}:${keyId}`));
    }

    if (!keys.size) {
      throw new Error(`${KEY_RING_ENV} must include at least one key`);
    }

    const currentId = (process.env[KEY_ID_ENV] || Array.from(keys.keys())[0]).trim();
    if (!keys.has(currentId)) {
      throw new Error(`${KEY_ID_ENV} must reference a keyId in ${KEY_RING_ENV}`);
    }

    const orderedIds = [currentId, ...Array.from(keys.keys()).filter((id) => id !== currentId)];
    return { currentId, keys, orderedIds };
  }

  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`${KEY_ENV} is not set`);
  }
  const key = parseKey(raw, KEY_ENV);
  return { currentId: LEGACY_KEY_ID, keys: new Map([[LEGACY_KEY_ID, key]]), orderedIds: [LEGACY_KEY_ID] };
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

  if (version === TOKEN_PREFIX_V3) {
    const keyId = parts[1] || null;
    const wrapIvB64 = parts[2];
    const wrapTagB64 = parts[3];
    const wrappedKeyB64 = parts[4];
    const ivB64 = parts[5];
    const tagB64 = parts[6];
    const dataB64 = parts[7];
    if (!wrapIvB64 || !wrapTagB64 || !wrappedKeyB64 || !ivB64 || !tagB64 || !dataB64) {
      throw new Error('Invalid secret payload');
    }

    const wrapIv = Buffer.from(wrapIvB64, 'base64');
    const wrapTag = Buffer.from(wrapTagB64, 'base64');
    const wrappedKey = Buffer.from(wrappedKeyB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const orderedIds = keyId && ring.keys.has(keyId)
      ? [keyId, ...ring.orderedIds.filter((id) => id !== keyId)]
      : ring.orderedIds;

    let lastError: unknown;
    for (const id of orderedIds) {
      const key = ring.keys.get(id);
      if (!key) {
        continue;
      }
      try {
        const wrapDecipher = crypto.createDecipheriv('aes-256-gcm', key, wrapIv);
        wrapDecipher.setAuthTag(wrapTag);
        const dataKey = Buffer.concat([wrapDecipher.update(wrappedKey), wrapDecipher.final()]);

        const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return decrypted.toString('utf8');
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error('Unable to decrypt secret');
  }

  let keyId: string | null = null;
  let ivB64: string | undefined;
  let tagB64: string | undefined;
  let dataB64: string | undefined;

  if (version === TOKEN_PREFIX_V2) {
    keyId = parts[1] || null;
    ivB64 = parts[2];
    tagB64 = parts[3];
    dataB64 = parts[4];
  } else {
    ivB64 = parts[1];
    tagB64 = parts[2];
    dataB64 = parts[3];
  }

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid secret payload');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const orderedIds = keyId && ring.keys.has(keyId)
    ? [keyId, ...ring.orderedIds.filter((id) => id !== keyId)]
    : ring.orderedIds;

  let lastError: unknown;
  for (const id of orderedIds) {
    const key = ring.keys.get(id);
    if (!key) {
      continue;
    }
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Unable to decrypt secret');
}

export function hasSecretKey() {
  try {
    loadKeyRing();
    return true;
  } catch {
    return false;
  }
}
