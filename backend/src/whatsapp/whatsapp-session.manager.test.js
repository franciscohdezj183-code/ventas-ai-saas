import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  disconnectSession,
  destroySession,
  getSessionStatus,
  requestStartSession,
  resetWhatsappSessionsForTests,
  restoreCompanySessions,
  restartSession,
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
    this.initializeError = null;
    this.initializeEvents = [];
    this.initializeDelayMs = 0;
    this.destroyDelayMs = 0;
    this.info = {
      wid: { user: '5217711234567' }
    };
  }

  async initialize() {
    this.initializeCalls += 1;

    if (this.initializeError) {
      throw this.initializeError;
    }

    if (this.initializeDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.initializeDelayMs));
    }

    for (const [event, payload] of this.initializeEvents) {
      queueMicrotask(() => this.emit(event, payload));
    }
  }

  async destroy() {
    this.destroyCalls += 1;
    if (this.destroyDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.destroyDelayMs));
    }
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
  beforeEach(() => {
    process.env.WHATSAPP_INITIALIZE_TIMEOUT_MS = '1000';
    process.env.WHATSAPP_INIT_POLL_INTERVAL_MS = '5';
    process.env.WHATSAPP_AUTO_RECONNECT = 'false';
    process.env.WHATSAPP_ALLOW_AUTH_DELETE = 'false';
  });

  afterEach(() => {
    resetWhatsappSessionsForTests();
    delete process.env.WHATSAPP_INITIALIZE_TIMEOUT_MS;
    delete process.env.WHATSAPP_INIT_POLL_INTERVAL_MS;
    delete process.env.WHATSAPP_AUTO_RECONNECT;
    delete process.env.WHATSAPP_ALLOW_AUTH_DELETE;
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
      client.initializeDelayMs = 25;
      client.initializeEvents = [['qr', 'qr-payload']];
      clients.push(client);
      return client;
    });

    const [first, second] = await Promise.all([
      startSession(1),
      startSession(1)
    ]);

    assert.equal(first.status, 'qr');
    assert.equal(second.status, 'qr');
    assert.equal(clients.length, 1);
    assert.equal(clients[0].initializeCalls, 1);
  });

  it('serializes concurrent restarts for the same company', async () => {
    const clients = [];
    setWhatsappClientFactoryForTests(() => {
      const client = new FakeWhatsappClient();
      client.initializeEvents = [['ready']];
      clients.push(client);
      return client;
    });

    await startSession(1);

    const [first, second] = await Promise.all([
      restartSession(1),
      restartSession(1)
    ]);

    assert.equal(clients.length, 2);
    assert.equal(clients[0].destroyCalls, 1);
    assert.equal(clients[1].initializeCalls, 1);
    assert.equal(first.status, 'ready');
    assert.equal(second.status, 'ready');
  });

  it('qr event updates status to qr', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      client.initializeEvents = [['qr', 'qr-payload']];
      return client;
    });

    await startSession(1);

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
      client.initializeEvents = [['ready']];
      return client;
    });

    await startSession(1);

    const status = await getSessionStatus(1);
    assert.equal(status.status, 'ready');
    assert.equal(status.qr, null);
    assert.equal(status.qrImage, null);
    assert.equal(status.phoneNumber, '5217711234567');
  });

  it('waits through authenticated until WhatsApp emits ready', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      client.initializeEvents = [['authenticated'], ['ready']];
      return client;
    });

    const status = await startSession(1);
    assert.equal(status.status, 'ready');
    assert.equal(status.phoneNumber, '5217711234567');
  });

  it('auth_failure updates status to failed', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      client.initializeEvents = [['auth_failure', 'bad auth']];
      return client;
    });

    await startSession(1);

    const status = await getSessionStatus(1);
    assert.equal(status.status, 'failed');
    assert.equal(status.lastError, 'bad auth');
  });

  it('disconnected event updates status to disconnected', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      client.initializeEvents = [['ready']];
      return client;
    });

    await startSession(1);
    client.emit('disconnected', 'network');

    const status = await getSessionStatus(1);
    assert.equal(status.status, 'disconnected');
    assert.equal(status.lastError, 'network');
  });

  it('marks async initialization failures failed so auto reconnect can retry', async () => {
    const previousAutoReconnect = process.env.WHATSAPP_AUTO_RECONNECT;
    try {
      let client;
      setWhatsappClientFactoryForTests(() => {
        client = new FakeWhatsappClient();
        client.initializeError = new Error('Protocol error (Runtime.callFunctionOn): Target closed');
        return client;
      });

      await startSession(1);
      const status = await waitForStatus(1, 'failed');

      assert.equal(status.status, 'failed');
      assert.match(status.lastError, /Target closed/);
      assert.equal(status.isInitializing, false);
    } finally {
      if (previousAutoReconnect === undefined) {
        delete process.env.WHATSAPP_AUTO_RECONNECT;
      } else {
        process.env.WHATSAPP_AUTO_RECONNECT = previousAutoReconnect;
      }
    }
  });

  it('destroySession cleans the store without exposing client', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      client.initializeEvents = [['qr', 'qr-payload']];
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
      client.initializeEvents = [['ready']];
      client.numberIds.set('5212205722560', { _serialized: '5212205722560@c.us' });
      return client;
    });

    await startSession(1);
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
      client.initializeEvents = [['ready']];
      client.numberIds.set('5212205722560', { _serialized: '5212205722560@c.us' });
      return client;
    });

    await startSession(1);
    const result = await sendWhatsappMessage(1, '522205722560', 'Nuevo cliente interesado');

    assert.deepEqual(client.numberIdCalls, ['522205722560', '5212205722560']);
    assert.equal(client.sentMessages.length, 1);
    assert.equal(client.sentMessages[0].phone, '5212205722560@c.us');
    assert.equal(result.to, '5212205722560@c.us');
  });

  it('marks the session failed when initialization reaches the timeout', async () => {
    process.env.WHATSAPP_INITIALIZE_TIMEOUT_MS = '250';
    setWhatsappClientFactoryForTests(() => new FakeWhatsappClient());

    const status = await startSession(1);

    assert.equal(status.status, 'failed');
    assert.match(status.lastError, /timed out/i);
  });

  it('treats initialization timeout as retryable when auto reconnect is enabled', async () => {
    process.env.WHATSAPP_AUTO_RECONNECT = 'true';
    process.env.WHATSAPP_INITIALIZE_TIMEOUT_MS = '250';
    process.env.WHATSAPP_RECONNECT_BASE_DELAY_MS = '1000';
    process.env.WHATSAPP_RECONNECT_MAX_ATTEMPTS = '1';
    setWhatsappClientFactoryForTests(() => new FakeWhatsappClient());

    const status = await startSession(1);

    assert.equal(status.status, 'disconnected');
    assert.equal(status.lastError, null);
  });

  it('disconnect keeps LocalAuth and leaves the session disconnected', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      client.initializeEvents = [['ready']];
      return client;
    });

    await startSession(1);
    const status = await disconnectSession(1);

    assert.equal(client.destroyCalls, 1);
    assert.equal(status.status, 'disconnected');
  });

  it('disconnect cancels an initialization without waiting for its full timeout', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      client.initializeDelayMs = 500;
      return client;
    });

    const startPromise = startSession(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const startedAt = Date.now();
    const disconnected = await disconnectSession(1);
    await startPromise;

    assert.equal(disconnected.status, 'disconnected');
    assert.equal(client.destroyCalls >= 1, true);
    assert.equal(Date.now() - startedAt < 300, true);
  });

  it('disconnect cancels a queued start before it reaches the global initialize lock', async () => {
    const clients = [];
    setWhatsappClientFactoryForTests((companyId) => {
      const client = new FakeWhatsappClient();
      client.companyId = companyId;

      if (companyId === 2) {
        client.initializeDelayMs = 400;
        client.initializeEvents = [['ready']];
      } else {
        client.initializeEvents = [['ready']];
      }

      clients.push(client);
      return client;
    });

    const blockingStart = startSession(2);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const queuedStart = startSession(5);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const startedAt = Date.now();
    const disconnected = await disconnectSession(5);
    const disconnectDurationMs = Date.now() - startedAt;
    const queuedResult = await queuedStart;
    await blockingStart;

    assert.equal(disconnected.status, 'disconnected');
    assert.equal(queuedResult.status, 'disconnected');
    assert.equal(disconnectDurationMs < 100, true);
    assert.deepEqual(clients.map((client) => client.companyId), [2]);
  });

  it('requestStartSession returns immediately while the real start continues in background', async () => {
    const clients = [];
    setWhatsappClientFactoryForTests(() => {
      const client = new FakeWhatsappClient();
      client.initializeDelayMs = 300;
      client.initializeEvents = [['qr', 'qr-payload']];
      clients.push(client);
      return client;
    });

    const startedAt = Date.now();
    const requested = await requestStartSession(9);
    const requestDurationMs = Date.now() - startedAt;

    assert.equal(requested.status, 'initializing');
    assert.equal(requestDurationMs < 100, true);

    const finalStatus = await waitForStatus(9, 'qr', 1500);
    assert.equal(finalStatus.status, 'qr');
    assert.equal(clients.length, 1);
  });

  it('restart waits for destroy before creating the replacement client', async () => {
    const order = [];
    const clients = [];
    setWhatsappClientFactoryForTests(() => {
      const client = new FakeWhatsappClient();
      const index = clients.length;
      client.initializeEvents = [['ready']];
      client.destroy = async () => {
        order.push(`destroy-${index}`);
        client.destroyCalls += 1;
      };
      clients.push(client);
      order.push(`create-${index}`);
      return client;
    });

    await startSession(1);
    await restartSession(1);

    assert.deepEqual(order, ['create-0', 'destroy-0', 'create-1']);
  });

  it('start waits for a background disconnect destroy before launching the same profile', async () => {
    const order = [];
    const clients = [];
    setWhatsappClientFactoryForTests(() => {
      const client = new FakeWhatsappClient();
      const index = clients.length;
      client.initializeEvents = [['ready']];
      client.destroyDelayMs = index === 0 ? 50 : 0;
      client.destroy = async () => {
        order.push(`destroy-start-${index}`);
        client.destroyCalls += 1;
        if (client.destroyDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, client.destroyDelayMs));
        }
        order.push(`destroy-end-${index}`);
      };
      clients.push(client);
      order.push(`create-${index}`);
      return client;
    });

    await startSession(1);
    await disconnectSession(1);
    await startSession(1);

    assert.deepEqual(order, ['create-0', 'destroy-start-0', 'destroy-end-0', 'create-1']);
    assert.equal(clients.length, 2);
    assert.equal(clients[0].destroyCalls, 1);
    assert.equal(clients[1].initializeCalls, 1);
  });

  it('restores companies sequentially and continues after a failure', async () => {
    const order = [];
    let active = 0;
    let maxActive = 0;
    const sessions = await restoreCompanySessions(
      [{ id: 2 }, { id: 3 }, { id: 5 }],
      async (companyId) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        order.push(`start-${companyId}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;

        if (companyId === 3) {
          throw new Error('simulated failure');
        }

        order.push(`end-${companyId}`);
        return { companyId, status: 'qr' };
      }
    );

    assert.equal(maxActive, 1);
    assert.deepEqual(order, ['start-2', 'end-2', 'start-3', 'start-5', 'end-5']);
    assert.deepEqual(sessions.map((session) => session.companyId), [2, 5]);
  });

  it('disconnects QR sessions restored on boot when QR persistence is disabled', async () => {
    let client;
    setWhatsappClientFactoryForTests(() => {
      client = new FakeWhatsappClient();
      client.initializeEvents = [['qr', 'qr-payload']];
      return client;
    });

    const sessions = await restoreCompanySessions(
      [{ id: 5 }],
      startSession,
      { keepQrSessions: false }
    );

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].status, 'disconnected');
    assert.equal(client.destroyCalls, 1);
  });
});
