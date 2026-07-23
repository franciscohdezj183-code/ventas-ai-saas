import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, describe, it, test } from 'node:test';
import { registerWhatsappClientEvents } from './whatsapp-events.handler.js';
import {
  getSession,
  markStarted,
  resetStoreForTests
} from './whatsapp-session.store.js';

class PollingClient extends EventEmitter {
  constructor() {
    super();
    this.getChatsCalls = 0;
    this.info = { wid: { user: '5211111111111' } };
  }

  async getState() {
    return 'CONNECTED';
  }

  async getChats() {
    this.getChatsCalls += 1;
    throw new Error('Execution context was destroyed, most likely because of a navigation.');
  }
}

class SocketLostClient extends PollingClient {
  async getState() {
    throw new TypeError("Cannot read properties of null (reading 'Socket')");
  }
}

class StoreUnavailableClient extends PollingClient {
  async getChats() {
    this.getChatsCalls += 1;
    throw new TypeError("Cannot read properties of undefined (reading 'getChats')");
  }
}

class MinifiedGetChatsRuntimeClient extends PollingClient {
  async getChats() {
    this.getChatsCalls += 1;
    const error = new Error('r');
    error.name = 'r';
    error.stack = [
      'r: r',
      '    at async Client.getChats (/home/app/node_modules/whatsapp-web.js/src/Client.js:1669:23)',
      '    at async Timeout._onTimeout (src/whatsapp/whatsapp-events.handler.js:391:23)'
    ].join('\n');
    throw error;
  }
}

const controls = [];

function registerTestWhatsappClientEvents(options) {
  const control = registerWhatsappClientEvents(options);
  controls.push(control);
  return control;
}

function waitForTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

afterEach(() => {
  for (const control of controls.splice(0)) {
    control.stop();
  }
  delete process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_BASE_MS;
  delete process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_MAX_MS;
  delete process.env.WHATSAPP_POLLING_CONTEXT_MAX_RECOVERY_FAILURES;
  resetStoreForTests();
});

test('mantiene la sesion lista y reintenta polling cuando WhatsApp navega temporalmente', async () => {
  process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_BASE_MS = '10';
  process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_MAX_MS = '10';
  const client = new PollingClient();
  const disconnects = [];
  markStarted(5, client);
  registerTestWhatsappClientEvents({
    companyId: 5,
    client,
    unreadPollIntervalMs: 15,
    onDisconnected: (event) => disconnects.push(event)
  });

  client.emit('ready');
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(client.getChatsCalls >= 2, true);
  assert.equal(disconnects.length, 0);
  assert.equal(getSession(5).status, 'ready');
  assert.equal(getSession(5).lastError, null);
});

test('marca la sesion para reconexion despues de backoff cuando getState pierde window.Store.Socket', async () => {
  process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_BASE_MS = '10';
  process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_MAX_MS = '10';
  const client = new SocketLostClient();
  const disconnects = [];
  markStarted(5, client);
  registerTestWhatsappClientEvents({
    companyId: 5,
    client,
    unreadPollIntervalMs: 15,
    onDisconnected: (event) => disconnects.push(event)
  });

  client.emit('ready');
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(client.getChatsCalls, 0);
  assert.equal(disconnects.length, 1);
  assert.equal(getSession(5).status, 'disconnected');
  assert.match(getSession(5).lastError, /socket|contexto|polling/i);
});

test('fuerza reconexion cuando getState sigue CONNECTED pero Store.getChats no existe', async () => {
  process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_BASE_MS = '10';
  process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_MAX_MS = '10';
  process.env.WHATSAPP_POLLING_CONTEXT_MAX_RECOVERY_FAILURES = '3';
  const client = new StoreUnavailableClient();
  const disconnects = [];
  markStarted(5, client);
  registerTestWhatsappClientEvents({
    companyId: 5,
    client,
    unreadPollIntervalMs: 15,
    onDisconnected: (event) => disconnects.push(event)
  });

  client.emit('ready');
  await new Promise((resolve) => setTimeout(resolve, 300));

  assert.equal(client.getChatsCalls >= 3, true);
  assert.equal(disconnects.length, 1);
  assert.equal(getSession(5).status, 'disconnected');
  assert.match(getSession(5).lastError, /getChats|contexto|polling/i);
});

test('fuerza reconexion cuando getChats falla con error minificado de WhatsApp Web', async () => {
  process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_BASE_MS = '10';
  process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_MAX_MS = '10';
  process.env.WHATSAPP_POLLING_CONTEXT_MAX_RECOVERY_FAILURES = '3';
  const client = new MinifiedGetChatsRuntimeClient();
  const disconnects = [];
  markStarted(5, client);
  registerTestWhatsappClientEvents({
    companyId: 5,
    client,
    unreadPollIntervalMs: 15,
    onDisconnected: (event) => disconnects.push(event)
  });

  client.emit('ready');
  await new Promise((resolve) => setTimeout(resolve, 300));

  assert.equal(client.getChatsCalls >= 3, true);
  assert.equal(disconnects.length, 1);
  assert.equal(getSession(5).status, 'disconnected');
  assert.match(getSession(5).lastError, /contexto|polling|r/i);
});

test('no inicia polling mientras la sesion solo esta esperando QR', async () => {
  const client = new PollingClient();
  markStarted(5, client);
  registerTestWhatsappClientEvents({
    companyId: 5,
    client,
    unreadPollIntervalMs: 15
  });

  client.emit('qr', 'payload');
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(client.getChatsCalls, 0);
});

describe('whatsapp events handler', () => {
  it('deduplicates media messages received through message_create and message events', async () => {
    const client = new EventEmitter();
    const calls = [];
    const message = {
      id: { _serialized: 'false_196808420634826@lid_3EB04B103B6D87DD2245C4' },
      from: '196808420634826@lid',
      to: '5212205722560@c.us',
      fromMe: false,
      body: '',
      type: 'image',
      hasMedia: true
    };

    registerWhatsappClientEvents({
      companyId: 5,
      client,
      onIncomingMessage: async (payload) => {
        calls.push(payload);
      }
    });

    client.emit('message_create', message);
    client.emit('message', message);
    await waitForTick();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].message, message);
  });
});
