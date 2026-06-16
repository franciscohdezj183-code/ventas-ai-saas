import crypto from 'node:crypto';
import { env } from '../config/env.js';

const PREFIX = 'enc:v1:';

function key() {
  return crypto.createHash('sha256').update(env.security.encryptionKey).digest();
}

export function encryptField(value) {
  if (value === undefined || value === null || value === '') {
    return value ?? null;
  }

  const text = String(value);

  if (text.startsWith(PREFIX)) {
    return text;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64url')}`;
}

export function decryptField(value) {
  if (value === undefined || value === null || value === '') {
    return value ?? null;
  }

  const text = String(value);

  if (!text.startsWith(PREFIX)) {
    return text;
  }

  const payload = Buffer.from(text.slice(PREFIX.length), 'base64url');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);

  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
