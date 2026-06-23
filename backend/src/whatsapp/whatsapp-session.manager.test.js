import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, describe, it } from 'node:test';
import {
  destroySession,
  getSessionStatus,
  resetWhatsappSessionsForTests,
  sendWhatsappMessage,
  setWhatsappClientFactoryForTests,
  startSession
} from './whatsapp-session.manager.js';

class FakeWhatsappClient extends EventEmitter {
  constructor() {
    super();
    this.initializeCalls = 0;
    this.destroyCalls = 0;
    this.getStateCalls = 0;
    this.numberIdCalls = [];
    this.numberIds = new Map();
    this.sentMessages = [];
    this.state = null;
    this.info = {
      wid: { user: '5217711234567' }
    };
  }

  async initialize() {
    this.initializeCalls += 1;
  }

  async destroy() {
    this.destroyCalls += 1;
  }

  async getState() {
    this.getStateCalls += 1;
    return this.state;
  }

  async getNumberId(phone) {
    this.numberIdCalls.push(phone);
    return this.numberIds.get(phone) ?? null;
  }

  async sendMessage(phone, message) {
    this.sentMessages.push({ phone, message });
  }
}

async function waitForStatus(companyId, expectedStatus, timeoutMs = 1000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await getSessionStatus(companyId);

    if (status.status === expectedStatus) {
      return status;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return getSessionStatus(companyId);
}

describe('whatsapp session manager', () => {
  afterEach(() => {
    resetWhatsappSessionsForTests();
  });

  it('returns idle when no session exists', async () => {
    const status = await getSessionStatus(1);
    assert.equal(status.status, 'idle');
    assert.equal(status.companyId, 1);
    assert.equal(status.client, undefined);
  });

  it('does not create a second client while initializing', async () => {
    const clients = [];
    setWhatsappClientFactoryForTests(() => {
      const client = new FakeWhatsappClient();
      clients.push(client);
      return client;
    });

    const first = await startSession(1);
    const second = await startSession(1);

    assert.equal(first.status, 'initializing');
    assert.equal(second.status, 'initializing');
    assert.equal(clients.length, 1);
    assert.equal(clients[0].initializeCalls, 1);
  });

  it('qr event updates status to qr', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      return client;
    });

    await startSession(1);
    client.emit('qr', 'qr-payload');

    const status = await waitForStatus(1, 'qr');
    assert.equal(status.status, 'qr');
    assert.equal(status.isInitializing, false);
    assert.equal(status.qr, 'qr-payload');
    assert.ok(status.qrImage.startsWith('data:image/png;base64,'));
  });

  it('ready event updates status to ready and clears QR', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      return client;
    });

    await startSession(1);
    client.emit('qr', 'qr-payload');
    await waitForStatus(1, 'qr');
    client.emit('ready');

    const status = await getSessionStatus(1);
    assert.equal(status.status, 'ready');
    assert.equal(status.qr, null);
    assert.equal(status.qrImage, null);
    assert.equal(status.phoneNumber, '5217711234567');
  });

  it('marks ready immediately after authenticated like Casa Perez flow', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      return client;
    });

    await startSession(1);
    client.emit('authenticated');

    const status = await waitForStatus(1, 'ready');

    assert.equal(status.status, 'ready');
    assert.equal(status.phoneNumber, '5217711234567');
    assert.equal(client.getStateCalls, 0);
  });

  it('auth_failure updates status to failed', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      return client;
    });

    await startSession(1);
    client.emit('auth_failure', 'bad auth');

    const status = await getSessionStatus(1);
    assert.equal(status.status, 'failed');
    assert.equal(status.lastError, 'bad auth');
  });

  it('disconnected event updates status to disconnected', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      return client;
    });

    await startSession(1);
    client.emit('disconnected', 'network');

    const status = await getSessionStatus(1);
    assert.equal(status.status, 'disconnected');
    assert.equal(status.lastError, 'network');
  });

  it('destroySession cleans the store without exposing client', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      return client;
    });

    await startSession(1);
    const destroyed = await destroySession(1);
    const status = await getSessionStatus(1);

    assert.equal(client.destroyCalls, 1);
    assert.equal(destroyed.status, 'destroyed');
    assert.equal(status.client, undefined);
  });

  it('resolves owner phone through WhatsApp number id before sending', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      client.numberIds.set('5212205722560', { _serialized: '5212205722560@c.us' });
      return client;
    });

    await startSession(1);
    client.emit('ready');
    await waitForStatus(1, 'ready');

    const result = await sendWhatsappMessage(1, '+52 1 220 572 2560', 'Nuevo cliente interesado');

    assert.deepEqual(client.numberIdCalls, ['5212205722560']);
    assert.equal(client.sentMessages.length, 1);
    assert.equal(client.sentMessages[0].phone, '5212205722560@c.us');
    assert.equal(result.to, '5212205722560@c.us');
  });

  it('tries alternate Mexican WhatsApp number format when the first one is not found', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      client.numberIds.set('5212205722560', { _serialized: '5212205722560@c.us' });
      return client;
    });

    await startSession(1);
    client.emit('ready');
    await waitForStatus(1, 'ready');

    const result = await sendWhatsappMessage(1, '522205722560', 'Nuevo cliente interesado');

    assert.deepEqual(client.numberIdCalls, ['522205722560', '5212205722560']);
    assert.equal(client.sentMessages.length, 1);
    assert.equal(client.sentMessages[0].phone, '5212205722560@c.us');
    assert.equal(result.to, '5212205722560@c.us');
  });
});
