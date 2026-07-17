import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BufferJSON } from '@whiskeysockets/baileys';
import {
  createBaileysAuthState,
} from './baileys-auth.store.js';
import {
  createMysqlBaileysAuthStore
} from './baileys-mysql-auth.store.js';

const encryptionKey = Buffer.alloc(32, 9);

function createLogger() {
  const logs = [];
  return {
    logs,
    info(message, meta) {
      logs.push({ level: 'info', message, meta });
    },
    warn(message, meta) {
      logs.push({ level: 'warn', message, meta });
    },
    error(message, meta) {
      logs.push({ level: 'error', message, meta });
    }
  };
}

function cloneRows(rows) {
  return new Map(Array.from(rows.entries()).map(([key, value]) => [key, { ...value }]));
}

function createFakeRepository(options = {}) {
  const creds = new Map();
  const keys = new Map();
  const calls = [];
  let failNextTransaction = false;

  const repo = {
    creds,
    keys,
    calls,
    failNextTransaction() {
      failNextTransaction = true;
    },
    async getCreds(empresaId) {
      calls.push({ method: 'getCreds', empresaId });
      return creds.get(Number(empresaId)) ?? null;
    },
    async getKeys(empresaId, type, ids) {
      calls.push({ method: 'getKeys', empresaId, type, ids: [...ids] });
      return ids
        .map((id) => keys.get(`${empresaId}:${type}:${id}`))
        .filter(Boolean);
    },
    async transaction(work) {
      calls.push({ method: 'transaction' });
      const nextCreds = cloneRows(creds);
      const nextKeys = cloneRows(keys);
      const tx = {
        async upsertCreds(empresaId, encrypted) {
          nextCreds.set(Number(empresaId), {
            ...encrypted,
            auth_tag: encrypted.authTag,
            schema_version: encrypted.schemaVersion
          });
        },
        async upsertKeys(rows) {
          if (failNextTransaction) {
            throw new Error('simulated write failure');
          }

          for (const row of rows) {
            nextKeys.set(`${row.empresaId}:${row.type}:${row.id}`, {
              key_id: row.id,
              ...row.encrypted,
              auth_tag: row.encrypted.authTag,
              schema_version: row.encrypted.schemaVersion
            });
          }
        },
        async deleteKeys(empresaId, type, ids) {
          for (const id of ids) {
            nextKeys.delete(`${empresaId}:${type}:${id}`);
          }
        },
        async clearEmpresaAuth(empresaId) {
          nextCreds.delete(Number(empresaId));
          for (const key of Array.from(nextKeys.keys())) {
            if (key.startsWith(`${empresaId}:`)) {
              nextKeys.delete(key);
            }
          }
        }
      };

      try {
        const result = await work(tx);
        creds.clear();
        keys.clear();
        for (const [key, value] of nextCreds) creds.set(key, value);
        for (const [key, value] of nextKeys) keys.set(key, value);
        return result;
      } finally {
        failNextTransaction = false;
      }
    },
    async clearEmpresaAuth(empresaId) {
      return this.transaction((tx) => tx.clearEmpresaAuth(empresaId));
    }
  };

  if (options.seed) {
    for (const seed of options.seed) {
      keys.set(`${seed.empresaId}:${seed.type}:${seed.id}`, seed.row);
    }
  }

  return repo;
}

async function createStoreHarness(options = {}) {
  const repository = options.repository ?? createFakeRepository();
  const logger = options.logger ?? createLogger();
  const store = createMysqlBaileysAuthStore({
    repository,
    encryptionKey,
    batchSize: options.batchSize ?? 2,
    loggerInstance: logger,
    importBaileys: async () => await import('@whiskeysockets/baileys')
  });
  return { logger, repository, store };
}

test('BufferJSON preserves Buffer and Uint8Array through the MySQL auth serializer format', () => {
  const value = {
    buffer: Buffer.from('hello'),
    bytes: new Uint8Array([1, 2, 3])
  };
  const restored = JSON.parse(JSON.stringify(value, BufferJSON.replacer), BufferJSON.reviver);

  assert.equal(Buffer.isBuffer(restored.buffer), true);
  assert.deepEqual(restored.buffer, Buffer.from('hello'));
  assert.equal(Buffer.isBuffer(restored.bytes), true);
  assert.deepEqual(restored.bytes, Buffer.from([1, 2, 3]));
});

test('missing creds use initAuthCreds without immediately persisting', async () => {
  const { repository, store } = await createStoreHarness();
  const auth = await store.createAuthState(5);

  assert.equal(auth.state.creds.registered, false);
  assert.equal(repository.creds.has(5), false);
});

test('saveCreds upserts encrypted credentials', async () => {
  const { repository, store } = await createStoreHarness();
  const auth = await store.createAuthState(5);

  auth.state.creds.me = { id: '5215550000001@s.whatsapp.net' };
  await auth.saveCreds();
  await auth.saveCreds();

  assert.equal(repository.creds.size, 1);
  assert.equal(repository.creds.has(5), true);
  assert.doesNotMatch(repository.creds.get(5).payload.toString('utf8'), /5215550000001/);
});

test('keys.get queries only requested empresa, type and IDs', async () => {
  const { repository, store } = await createStoreHarness();
  const auth5 = await store.createAuthState(5);
  const auth6 = await store.createAuthState(6);

  await auth5.state.keys.set({ session: { a: Buffer.from('five'), b: Buffer.from('extra') } });
  await auth6.state.keys.set({ session: { a: Buffer.from('six') } });
  const result = await auth5.state.keys.get('session', ['a']);
  const getCall = repository.calls.findLast((call) => call.method === 'getKeys');

  assert.deepEqual(result, { a: Buffer.from('five') });
  assert.deepEqual(getCall, { method: 'getKeys', empresaId: 5, type: 'session', ids: ['a'] });
});

test('keys.set upserts by batch and null deletes a key', async () => {
  const { repository, store } = await createStoreHarness({ batchSize: 2 });
  const auth = await store.createAuthState(5);

  await auth.state.keys.set({ session: { a: Buffer.from('a'), b: Buffer.from('b'), c: Buffer.from('c') } });
  assert.equal(repository.keys.size, 3);

  await auth.state.keys.set({ session: { b: null } });
  const result = await auth.state.keys.get('session', ['a', 'b', 'c']);

  assert.deepEqual(result.a, Buffer.from('a'));
  assert.equal(result.b, undefined);
  assert.deepEqual(result.c, Buffer.from('c'));
});

test('keys.set rolls back when a transactional write fails', async () => {
  const { repository, store } = await createStoreHarness();
  const auth = await store.createAuthState(5);

  await auth.state.keys.set({ session: { a: Buffer.from('original') } });
  repository.failNextTransaction();

  await assert.rejects(
    auth.state.keys.set({ session: { b: Buffer.from('new') } }),
    /simulated write failure/
  );

  assert.equal(repository.keys.has('5:session:b'), false);
  assert.equal(repository.keys.has('5:session:a'), true);
});

test('store isolates empresa 5 and empresa 6 credentials and keys', async () => {
  const { store } = await createStoreHarness();
  const auth5 = await store.createAuthState(5);
  const auth6 = await store.createAuthState(6);

  auth5.state.creds.me = { id: '5215550000005@s.whatsapp.net' };
  auth6.state.creds.me = { id: '5215550000006@s.whatsapp.net' };
  await auth5.saveCreds();
  await auth6.saveCreds();
  await auth5.state.keys.set({ session: { only5: Buffer.from('5') } });
  await auth6.state.keys.set({ session: { only6: Buffer.from('6') } });

  assert.deepEqual((await auth5.state.keys.get('session', ['only5', 'only6'])).only5, Buffer.from('5'));
  assert.equal((await auth5.state.keys.get('session', ['only6'])).only6, undefined);
  assert.deepEqual((await auth6.state.keys.get('session', ['only6'])).only6, Buffer.from('6'));
});

test('clearEmpresaAuth removes only the selected company and shutdown preserves rows', async () => {
  const { repository, store } = await createStoreHarness();
  const auth5 = await store.createAuthState(5);
  const auth6 = await store.createAuthState(6);

  await auth5.saveCreds();
  await auth6.saveCreds();
  await auth5.state.keys.set({ session: { a: Buffer.from('5') } });
  await auth6.state.keys.set({ session: { a: Buffer.from('6') } });

  assert.equal(repository.creds.size, 2);
  await store.removeAuthState(5);

  assert.equal(repository.creds.has(5), false);
  assert.equal(repository.creds.has(6), true);
  assert.equal(repository.keys.has('5:session:a'), false);
  assert.equal(repository.keys.has('6:session:a'), true);
});

test('file store remains compatible and mysql store does not create auth files', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'baileys-auth-'));
  const fileAuth = await createBaileysAuthState(5, {
    authPath: tempRoot,
    authStore: 'file',
    loggerInstance: createLogger(),
    importBaileys: async () => ({
      async useMultiFileAuthState(folder) {
        await fs.writeFile(path.join(folder, 'creds.json'), '{}');
        return { state: { creds: {}, keys: {} }, saveCreds() {} };
      }
    })
  });

  assert.equal(fileAuth.folder, path.join(tempRoot, 'empresa-5'));
  assert.equal((await fs.readdir(fileAuth.folder)).includes('creds.json'), true);

  const mysqlRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'baileys-auth-mysql-'));
  const { store } = await createStoreHarness();
  await createBaileysAuthState(5, {
    authPath: mysqlRoot,
    authStore: 'mysql',
    loggerInstance: createLogger(),
    importBaileys: async () => await import('@whiskeysockets/baileys'),
    mysqlAuthStore: store
  });

  assert.deepEqual(await fs.readdir(mysqlRoot), []);

  await fs.rm(tempRoot, { recursive: true, force: true });
  await fs.rm(mysqlRoot, { recursive: true, force: true });
});

test('invalid store fails clearly', async () => {
  await assert.rejects(
    createBaileysAuthState(5, { authStore: 'invalid', loggerInstance: createLogger() }),
    /BAILEYS_AUTH_STORE must be file or mysql/
  );
});

test('MySQL down does not create a new identity silently', async () => {
  const logger = createLogger();
  const store = createMysqlBaileysAuthStore({
    repository: {
      async getCreds() {
        throw Object.assign(new Error('database unavailable'), { code: 'ECONNREFUSED' });
      }
    },
    encryptionKey,
    loggerInstance: logger,
    importBaileys: async () => await import('@whiskeysockets/baileys')
  });

  await assert.rejects(store.createAuthState(5), /database unavailable/);
  assert.equal(logger.logs.some((entry) => entry.message === 'baileys_auth_mysql_error'), true);
});

test('logs do not include sensitive Baileys auth material', async () => {
  const logger = createLogger();
  const { store } = await createStoreHarness({ logger });
  const auth = await store.createAuthState(5);

  auth.state.creds.me = { id: '5215550000099@s.whatsapp.net' };
  await auth.saveCreds();
  await auth.state.keys.set({ session: { sensitiveKeyId: Buffer.from('super-secret') } });
  await store.removeAuthState(5);

  const serializedLogs = JSON.stringify(logger.logs);
  assert.doesNotMatch(serializedLogs, /super-secret|sensitiveKeyId|5215550000099/);
  assert.doesNotMatch(serializedLogs, new RegExp(encryptionKey.toString('base64')));
});
