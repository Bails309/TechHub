const { decryptSecret } = require('../src/lib/crypto');
const encValue = 'v2:legacy:B7dW5bx+P7DPjJ/+:IBbxyB5LE5zYrQ/0eeO8fA==:rrJWFnMa3/oYIPJUMWiyGT3QT+GsBgy83Vi7oR8pPGo=';

try {
    const decrypted = decryptSecret(encValue);
    console.log('--- DECRYPTION_RESULT_START ---');
    console.log('Decrypted:', decrypted ? 'SUCCESS (not showing value)' : 'FAILURE (null)');
    console.log('--- DECRYPTION_RESULT_END ---');
} catch (err) {
    console.error('Decryption threw error:', err.message);
}
