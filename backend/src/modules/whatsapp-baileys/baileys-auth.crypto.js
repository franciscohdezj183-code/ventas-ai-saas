import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const BAILEYS_AUTH_CRYPTO_VERSION = 1;

export function parseBaileysAuthEncryptionKey(value) {
  const raw = String(value ?? '');

  if (!raw) {
    throw new Error('BAILEYS_AUTH_ENCRYPTION_KEY is required when BAILEYS_AUTH_STORE=mysql');
  }

  const key = Buffer.from(raw, 'base64');

  if (key.length !== 32 || key.toString('base64') !== raw) {
    throw new Error('BAILEYS_AUTH_ENCRYPTION_KEY must be valid Base64 for exactly 32 bytes');
  }

  return key;
}

export function encryptBaileysAuthPayload(payload, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify({
    version: BAILEYS_AUTH_CRYPTO_VERSION,
    payload
  }), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    payload: encrypted,
    iv,
    authTag: cipher.getAuthTag(),
    schemaVersion: BAILEYS_AUTH_CRYPTO_VERSION
  };
}

export function decryptBaileysAuthPayload(row, key) {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.iv));
    decipher.setAuthTag(Buffer.from(row.authTag ?? row.auth_tag));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(row.payload)),
      decipher.final()
    ]);
    const envelope = JSON.parse(decrypted.toString('utf8'));

    if (envelope?.version !== BAILEYS_AUTH_CRYPTO_VERSION || !Object.hasOwn(envelope, 'payload')) {
      throw new Error('Invalid Baileys auth payload version');
    }

    return envelope.payload;
  } catch (error) {
    const nextError = new Error('Unable to decrypt Baileys auth payload');
    nextError.cause = error;
    throw nextError;
  }
}
