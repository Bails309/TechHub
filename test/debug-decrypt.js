const crypto = require('crypto');

const SSO_MASTER_KEY = "Dk170NH/ahjIE/dKzIpBhmhTQiEJFzgwx9JF22T5H68=";
const payload = "v2:legacy:B7dW5bx+P7DPjJ/+:IBbxyB5LE5zYrQ/0eeO8fA==:rrJWFnMa3/oYIPJUMWiyGT3QT+GsBgy83Vi7oR8pPGo=";

function decrypt(payload, masterKeyB64) {
    const parts = payload.split(':');
    const version = parts[0];
    const keyId = parts[1];
    const ivB64 = parts[2];
    const tagB64 = parts[3];
    const dataB64 = parts[4];

    if (version !== 'v2') throw new Error('Only v2 supported in this test');

    const key = Buffer.from(masterKeyB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
}

try {
    const result = decrypt(payload, SSO_MASTER_KEY);
    console.log('Decryption SUCCESS:', result);
} catch (err) {
    console.error('Decryption FAILED:', err.message);
}
