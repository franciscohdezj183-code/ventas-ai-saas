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

function waitForTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

afterEach(() => {
  resetStoreForTests();
});

test('detiene el polling y solicita una sola reconexion cuando se pierde el contexto', async () => {
  const client = new PollingClient();
  const disconnects = [];
  markStarted(5, client);
  registerWhatsappClientEvents({
    companyId: 5,
    client,
    unreadPollIntervalMs: 15,
    onDisconnected: (event) => disconnects.push(event)
  });

  client.emit('ready');
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(client.getChatsCalls, 1);
  assert.equal(disconnects.length, 1);
  assert.equal(getSession(5).status, 'disconnected');
  assert.match(getSession(5).lastError, /perdio el contexto/i);
});

test('detiene polling inmediatamente cuando getState pierde window.Store.Socket', async () => {
  const client = new SocketLostClient();
  const disconnects = [];
  markStarted(5, client);
  registerWhatsappClientEvents({
    companyId: 5,
    client,
    unreadPollIntervalMs: 15,
    onDisconnected: (event) => disconnects.push(event)
  });

  client.emit('ready');
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(client.getChatsCalls, 0);
  assert.equal(disconnects.length, 1);
  assert.equal(getSession(5).status, 'disconnected');
  assert.match(getSession(5).lastError, /socket|contexto|polling/i);
});

test('no inicia polling mientras la sesion solo esta esperando QR', async () => {
  const client = new PollingClient();
  markStarted(5, client);
  registerWhatsappClientEvents({
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
