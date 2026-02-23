import crypto from 'crypto';

const KEY_ENV = 'SSO_MASTER_KEY';
const TOKEN_PREFIX = 'v1';

function getKey() {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`${KEY_ENV} is not set`);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must be 32 bytes (base64-encoded)`);
  }
  return key;
}

export function encryptSecret(value: string) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
}

export function decryptSecret(payload: string) {
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== TOKEN_PREFIX || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid secret payload');
  }

  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

export function hasSecretKey() {
  return Boolean(process.env[KEY_ENV]);
}
