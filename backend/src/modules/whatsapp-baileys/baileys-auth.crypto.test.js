import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptBaileysAuthPayload,
  encryptBaileysAuthPayload,
  parseBaileysAuthEncryptionKey
} from './baileys-auth.crypto.js';

const key = Buffer.alloc(32, 7);
const keyBase64 = key.toString('base64');

test('validates Baileys auth encryption key as Base64 for exactly 32 bytes', () => {
  assert.deepEqual(parseBaileysAuthEncryptionKey(keyBase64), key);
  assert.throws(() => parseBaileysAuthEncryptionKey(''), /required/);
  assert.throws(() => parseBaileysAuthEncryptionKey(Buffer.alloc(31).toString('base64')), /32 bytes/);
  assert.throws(() => parseBaileysAuthEncryptionKey('not-base64'), /32 bytes/);
});

test('encrypts and decrypts Baileys auth payload with AES-256-GCM', () => {
  const encrypted = encryptBaileysAuthPayload('{"hello":"world"}', key);

  assert.notEqual(encrypted.payload.toString('utf8'), '{"hello":"world"}');
  assert.equal(decryptBaileysAuthPayload(encrypted, key), '{"hello":"world"}');
});

test('uses a different IV and ciphertext for repeated writes', () => {
  const first = encryptBaileysAuthPayload('same payload', key);
  const second = encryptBaileysAuthPayload('same payload', key);

  assert.notDeepEqual(first.iv, second.iv);
  assert.notDeepEqual(first.payload, second.payload);
});

test('rejects altered auth tag in a controlled way', () => {
  const encrypted = encryptBaileysAuthPayload('payload', key);
  const altered = {
    ...encrypted,
    authTag: Buffer.from(encrypted.authTag)
  };
  altered.authTag[0] ^= 1;

  assert.throws(() => decryptBaileysAuthPayload(altered, key), /Unable to decrypt Baileys auth payload/);
});
