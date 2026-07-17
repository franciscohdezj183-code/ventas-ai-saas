import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createBaileysService } from './baileys.service.js';
import {
  normalizeBaileysDestination,
  normalizeBaileysInboundMessage
} from './baileys-message.normalizer.js';

function config(overrides = {}) {
  return {
    whatsapp: {
      baileys: {
        authPath: 'storage/baileys-test',
        reconnectMaxAttempts: 2,
        reconnectBaseDelayMs: 10,
        qrTtlMs: 1000
      },
      ...overrides.whatsapp
    },
    ...overrides
  };
}

function createFakeSocket() {
  const ev = new EventEmitter();
  const sent = [];
  return {
    ev,
    sent,
    user: { id: '5215550000000:1@s.whatsapp.net' },
    async sendMessage(jid, payload) {
      sent.push({ jid, payload });
      return { key: { id: 'sent-1' } };
    },
    endCalls: 0,
    end() {
      this.endCalls += 1;
    }
  };
}

function createHarness(options = {}) {
  const sockets = [];
  const enqueued = [];
  const removedAuth = [];
  const savedCreds = [];
  const statuses = new Map();
  const timers = [];
  const service = createBaileysService({
    config: config(options.config),
    loggerInstance: { info() {}, warn() {}, error() {} },
    importBaileys: async () => ({
      DisconnectReason: {
        loggedOut: 401,
        connectionClosed: 428
      },
      makeWASocket: () => {
        const socket = createFakeSocket();
        sockets.push(socket);
        return socket;
      }
    }),
    authStore: {
      async createAuthState(empresaId) {
        return {
          folder: `storage/baileys-test/empresa-${empresaId}`,
          state: { creds: { me: { id: `${empresaId}@s.whatsapp.net` } }, keys: {} },
          async saveCreds() {
            savedCreds.push(empresaId);
          }
        };
      },
      async removeAuthState(empresaId) {
        removedAuth.push(empresaId);
      }
    },
    statusStore: {
      async persistStatus(status) {
        statuses.set(Number(status.empresa_id), status);
      },
      async getStatus(empresaId) {
        return statuses.get(Number(empresaId)) ?? null;
      },
      async listStatuses() {
        return Array.from(statuses.values());
      }
    },
    getRegistry: () => ({
      whatsappInboundQueue: {
        status: 'ready',
        async enqueue(payload) {
          enqueued.push(payload);
          return { id: payload.eventId };
        }
      }
    }),
    qrToDataUrl: async (qr) => `data:image/png;base64,${Buffer.from(qr).toString('base64')}`,
    setTimeoutFn(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeoutFn() {}
  });

  return { enqueued, removedAuth, savedCreds, service, sockets, timers };
}

test('Baileys credentials are isolated per company', async () => {
  const { service } = createHarness();

  await service.startSession(5);
  await service.startSession(7);

  assert.equal(service._sessions.get(5).authState.folder, 'storage/baileys-test/empresa-5');
  assert.equal(service._sessions.get(7).authState.folder, 'storage/baileys-test/empresa-7');
});

test('start is idempotent and concurrent starts create one socket', async () => {
  const { service, sockets } = createHarness();

  const [first, second] = await Promise.all([
    service.startSession(5),
    service.startSession(5)
  ]);

  assert.equal(first.status, 'INITIALIZING');
  assert.equal(second.status, 'INITIALIZING');
  assert.equal(sockets.length, 1);
});

test('QR updates compatible status and open clears QR', async () => {
  const { service, sockets } = createHarness();

  await service.startSession(5);
  sockets[0].ev.emit('connection.update', { qr: 'qr-secret-value' });
  await new Promise((resolve) => setImmediate(resolve));
  let status = await service.getStatusSnapshot(5);

  assert.equal(status.status, 'QR_READY');
  assert.equal(status.qr, 'qr-secret-value');
  assert.match(status.qr_image, /^data:image\/png;base64,/);

  sockets[0].ev.emit('connection.update', { connection: 'open' });
  await new Promise((resolve) => setImmediate(resolve));
  status = await service.getStatusSnapshot(5);

  assert.equal(status.status, 'CONNECTED');
  assert.equal(status.qr, null);
  assert.equal(status.qr_image, null);
});

test('creds.update persists and shutdown preserves credentials', async () => {
  const { removedAuth, savedCreds, service, sockets } = createHarness();

  await service.startSession(5);
  sockets[0].ev.emit('creds.update');
  await service.shutdown();

  assert.deepEqual(savedCreds, [5]);
  assert.deepEqual(removedAuth, []);
});

test('manual logout removes only that company credentials', async () => {
  const { removedAuth, service } = createHarness();

  await service.startSession(5);
  await service.startSession(7);
  await service.disconnectSession(5);

  assert.deepEqual(removedAuth, [5]);
  assert.equal(service._sessions.has(7), true);
});

test('temporary disconnect schedules reconnect without deleting credentials', async () => {
  const { removedAuth, service, sockets, timers } = createHarness();

  await service.startSession(5);
  sockets[0].ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 428 }, message: 'temporary' } }
  });
  await new Promise((resolve) => setImmediate(resolve));
  const status = await service.getStatusSnapshot(5);

  assert.equal(status.status, 'RECONNECTING');
  assert.equal(timers.some((timer) => timer.delay === 10), true);
  assert.deepEqual(removedAuth, []);
});

test('loggedOut removes auth and does not schedule reconnect forever', async () => {
  const { removedAuth, service, sockets, timers } = createHarness();

  await service.startSession(5);
  sockets[0].ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode: 401 }, message: 'logged out' } }
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(removedAuth, [5]);
  assert.equal((await service.getStatusSnapshot(5)).status, 'AUTH_FAILED');
  assert.equal(timers.some((timer) => timer.delay === 10), false);
});

test('auth store failure marks AUTH_FAILED without creating a socket', async () => {
  const sockets = [];
  const statuses = new Map();
  const errors = [];
  const service = createBaileysService({
    config: config({ whatsapp: { baileys: { authStore: 'mysql', authPath: 'storage/baileys-test', reconnectMaxAttempts: 2, reconnectBaseDelayMs: 10, qrTtlMs: 1000 } } }),
    loggerInstance: { info() {}, warn() {}, error(message, meta) { errors.push({ message, meta }); } },
    importBaileys: async () => ({
      makeWASocket: () => {
        sockets.push(createFakeSocket());
        return sockets.at(-1);
      }
    }),
    authStore: {
      async createAuthState() {
        throw Object.assign(new Error('database unavailable'), { code: 'ECONNREFUSED' });
      },
      async removeAuthState() {}
    },
    statusStore: {
      async persistStatus(status) {
        statuses.set(Number(status.empresa_id), status);
      },
      async getStatus(empresaId) {
        return statuses.get(Number(empresaId)) ?? null;
      },
      async listStatuses() {
        return Array.from(statuses.values());
      }
    }
  });

  await assert.rejects(service.startSession(5), /database unavailable/);

  assert.equal(sockets.length, 0);
  assert.equal((await service.getStatusSnapshot(5)).status, 'AUTH_FAILED');
  assert.equal(errors.some((entry) => entry.message === 'baileys_auth_mysql_error'), true);
});

test('messages.upsert processes all supported messages and deduplicates by messageId', async () => {
  const { enqueued, service, sockets } = createHarness();

  await service.startSession(5);
  sockets[0].ev.emit('messages.upsert', {
    messages: [
      { key: { remoteJid: '5215550000001@s.whatsapp.net', id: 'm1' }, message: { conversation: 'hola' }, messageTimestamp: 1784210880 },
      { key: { remoteJid: '5215550000002@s.whatsapp.net', id: 'm2' }, message: { extendedTextMessage: { text: 'info' } }, messageTimestamp: 1784210881 },
      { key: { remoteJid: '5215550000002@s.whatsapp.net', id: 'm2' }, message: { extendedTextMessage: { text: 'info' } }, messageTimestamp: 1784210881 },
      { key: { remoteJid: 'status@broadcast', id: 'm3' }, message: { conversation: 'x' } },
      { key: { remoteJid: '120363@g.us', id: 'm4' }, message: { conversation: 'x' } },
      { key: { remoteJid: '5215550000003@s.whatsapp.net', id: 'm5', fromMe: true }, message: { conversation: 'x' } }
    ]
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(enqueued.length, 2);
  assert.equal(enqueued[0].provider, 'baileys');
  assert.equal(enqueued[0].messageType, 'text');
  assert.equal(enqueued[1].body, 'info');
});

test('normalizes phone JID and LID without inventing phone numbers', async () => {
  const phoneJob = await normalizeBaileysInboundMessage({
    empresaId: 5,
    message: { key: { remoteJid: '5215550000001@s.whatsapp.net', id: 'm1' }, message: { conversation: 'hola' } }
  });
  const lidJob = await normalizeBaileysInboundMessage({
    empresaId: 5,
    message: { key: { remoteJid: '113950146457660@lid', id: 'm2' }, message: { conversation: 'hola' } }
  });

  assert.equal(phoneJob.phone, '5215550000001');
  assert.equal(phoneJob.resolvedPhoneId, '5215550000001@s.whatsapp.net');
  assert.equal(lidJob.phone, 'lid:113950146457660');
  assert.equal(lidJob.resolvedPhoneId, null);
  assert.notEqual(lidJob.phone, '113950146457660');
  assert.equal(lidJob.whatsappChatId, '113950146457660@lid');
});

test('normalizes LID using valid remoteJidAlt while keeping original chat id', async () => {
  const job = await normalizeBaileysInboundMessage({
    empresaId: 5,
    message: {
      key: {
        remoteJid: '113950146457660@lid',
        remoteJidAlt: '5215550000001@s.whatsapp.net',
        id: 'm1'
      },
      message: { conversation: 'hola' }
    }
  });

  assert.equal(job.whatsappChatId, '113950146457660@lid');
  assert.equal(job.resolvedPhoneId, '5215550000001@s.whatsapp.net');
  assert.equal(job.phone, '5215550000001');
});

test('normalizes LID using signalRepository getPNForLID mapping', async () => {
  const calls = [];
  const job = await normalizeBaileysInboundMessage({
    empresaId: 5,
    sock: {
      signalRepository: {
        lidMapping: {
          async getPNForLID(jid) {
            calls.push(jid);
            return '5215550000002@s.whatsapp.net';
          }
        }
      }
    },
    message: {
      key: { remoteJid: '113950146457660@lid', id: 'm1' },
      message: { conversation: 'hola' }
    }
  });

  assert.deepEqual(calls, ['113950146457660@lid']);
  assert.equal(job.resolvedPhoneId, '5215550000002@s.whatsapp.net');
  assert.equal(job.phone, '5215550000002');
  assert.equal(job.whatsappChatId, '113950146457660@lid');
});

test('normalizes LID with missing or invalid mapping as provisional lid identity', async () => {
  const missing = await normalizeBaileysInboundMessage({
    empresaId: 5,
    sock: { signalRepository: { lidMapping: { async getPNForLID() { return null; } } } },
    message: { key: { remoteJid: '113950146457660@lid', id: 'm1' }, message: { conversation: 'hola' } }
  });
  const invalid = await normalizeBaileysInboundMessage({
    empresaId: 5,
    sock: { signalRepository: { lidMapping: { async getPNForLID() { return '113950146457660@lid'; } } } },
    message: { key: { remoteJid: '113950146457661@lid', id: 'm2' }, message: { conversation: 'hola' } }
  });

  assert.equal(missing.phone, 'lid:113950146457660');
  assert.equal(missing.resolvedPhoneId, null);
  assert.notEqual(missing.phone, '113950146457660');
  assert.equal(invalid.phone, 'lid:113950146457661');
  assert.equal(invalid.resolvedPhoneId, null);
  assert.notEqual(invalid.phone, '113950146457661');
});

test('normalizes participant PN for direct LID only when participant corresponds to sender', async () => {
  const matching = await normalizeBaileysInboundMessage({
    empresaId: 5,
    message: {
      key: {
        remoteJid: '113950146457660@lid',
        participant: '113950146457660@lid',
        participantPn: '5215550000003@s.whatsapp.net',
        id: 'm1'
      },
      message: { conversation: 'hola' }
    }
  });
  const nonMatching = await normalizeBaileysInboundMessage({
    empresaId: 5,
    message: {
      key: {
        remoteJid: '113950146457660@lid',
        participant: '999999999999999@lid',
        participantPn: '5215550000004@s.whatsapp.net',
        id: 'm2'
      },
      message: { conversation: 'hola' }
    }
  });

  assert.equal(matching.phone, '5215550000003');
  assert.equal(matching.resolvedPhoneId, '5215550000003@s.whatsapp.net');
  assert.equal(nonMatching.phone, 'lid:113950146457660');
  assert.equal(nonMatching.resolvedPhoneId, null);
});

test('documents temporary identity behavior when PN appears after provisional LID', async () => {
  const provisional = await normalizeBaileysInboundMessage({
    empresaId: 5,
    message: { key: { remoteJid: '113950146457660@lid', id: 'm1' }, message: { conversation: 'hola' } }
  });
  const resolved = await normalizeBaileysInboundMessage({
    empresaId: 5,
    message: {
      key: {
        remoteJid: '113950146457660@lid',
        remoteJidAlt: '5215550000001@s.whatsapp.net',
        id: 'm2'
      },
      message: { conversation: 'hola otra vez' }
    }
  });

  assert.equal(provisional.whatsappChatId, resolved.whatsappChatId);
  assert.equal(provisional.phone, 'lid:113950146457660');
  assert.equal(resolved.phone, '5215550000001');
  assert.equal(resolved.metadata.originalLidJid, '113950146457660@lid');
});

test('sendText converts phone to JID and sends directly without enqueueing', async () => {
  const { enqueued, service, sockets } = createHarness();

  await service.startSession(5);
  sockets[0].ev.emit('connection.update', { connection: 'open' });
  await new Promise((resolve) => setImmediate(resolve));
  const result = await service.sendTextDirect(5, '5215550000001', 'hola');

  assert.equal(result.status, 'SENT');
  assert.deepEqual(sockets[0].sent, [{ jid: '5215550000001@s.whatsapp.net', payload: { text: 'hola' } }]);
  assert.deepEqual(enqueued, []);
});

test('destination normalization accepts Baileys JIDs and rejects invalid destinations', () => {
  assert.equal(normalizeBaileysDestination('5215550000001@s.whatsapp.net'), '5215550000001@s.whatsapp.net');
  assert.equal(normalizeBaileysDestination('113950146457660@lid'), '113950146457660@lid');
  assert.equal(normalizeBaileysDestination('+52 155 500 0001'), '521555000001@s.whatsapp.net');
  assert.throws(() => normalizeBaileysDestination('not-a-jid'), /Destino de WhatsApp invalido/);
});
