import assert from 'node:assert/strict';
import test from 'node:test';
import { createMessagingService } from './messaging.service.js';
import { createProviderRegistry } from './provider-registry.js';
import { validateStatusSnapshot } from './messaging-provider.js';

function createFakeProvider(overrides = {}) {
  return {
    providerName: 'fake-provider',
    startSession: async () => ({ empresa_id: 1, status: 'INITIALIZING' }),
    getStatus: () => ({ empresa_id: 1, status: 'CONNECTED' }),
    getStatusSnapshot: async () => ({ empresa_id: 1, status: 'CONNECTED' }),
    listStatusSnapshots: async () => [{ empresa_id: 1, status: 'CONNECTED' }],
    getQr: async () => ({ empresa_id: 1, status: 'QR_READY', qr: 'qr', qr_image: 'image' }),
    disconnectSession: async () => ({ empresa_id: 1, status: 'DISCONNECTED' }),
    sendText: async () => ({ status: 'SENT' }),
    sendMedia: async () => ({ status: 'SENT' }),
    shutdown: async () => undefined,
    ...overrides
  };
}

test('selects the configured messaging provider', () => {
  const provider = createFakeProvider({ providerName: 'whatsapp-web' });
  const selectedProvider = createProviderRegistry({
    providerName: 'whatsapp-web',
    providers: {
      'whatsapp-web': provider
    }
  });

  assert.equal(selectedProvider, provider);
  assert.equal(selectedProvider.providerName, 'whatsapp-web');
});

test('selects baileys messaging provider when configured', () => {
  const provider = createFakeProvider({ providerName: 'baileys' });
  const selectedProvider = createProviderRegistry({
    providerName: 'baileys',
    providers: {
      'whatsapp-web': createFakeProvider({ providerName: 'whatsapp-web' }),
      baileys: provider
    }
  });

  assert.equal(selectedProvider, provider);
  assert.equal(selectedProvider.providerName, 'baileys');
});

test('throws a clear error for an unknown messaging provider', () => {
  assert.throws(
    () => createProviderRegistry({
      providerName: 'baileys',
      providers: {
        'whatsapp-web': createFakeProvider({ providerName: 'whatsapp-web' })
      }
    }),
    /Unsupported WhatsApp provider "baileys". Supported providers: whatsapp-web/
  );
});

test('delegates sendText to the active provider', async () => {
  const calls = [];
  const service = createMessagingService(createFakeProvider({
    sendText: async (...args) => {
      calls.push(args);
      return { status: 'SENT' };
    }
  }), {
    config: { whatsapp: { outboundViaQueue: false } }
  });

  const result = await service.sendText(12, '5215550000000', 'Hola');

  assert.deepEqual(calls, [[12, '5215550000000', 'Hola']]);
  assert.deepEqual(result, { status: 'SENT' });
});

test('sendText enqueues outbound when queue mode is enabled', async () => {
  const calls = [];
  const service = createMessagingService({
    providerName: 'test',
    startSession() {},
    getStatus() {},
    getStatusSnapshot() {},
    listStatusSnapshots() {},
    getQr() {},
    disconnectSession() {},
    sendText() {
      throw new Error('should not send directly');
    },
    sendMedia() {},
    shutdown() {}
  }, {
    config: {
      whatsapp: {
        outboundViaQueue: true
      }
    },
    enqueueOutbound: async (payload) => {
      calls.push(payload);
      return { queued: true, jobId: 'job-1' };
    }
  });

  const result = await service.sendText(5, '5215550000000', 'Hola', { correlationId: 'corr-1' });

  assert.equal(result.queued, true);
  assert.equal(calls[0].empresaId, 5);
  assert.equal(calls[0].phone, '5215550000000');
  assert.equal(calls[0].text, 'Hola');
  assert.equal(calls[0].correlationId, 'corr-1');
});

test('delegates startSession to the active provider', async () => {
  const calls = [];
  const service = createMessagingService(createFakeProvider({
    startSession: async (...args) => {
      calls.push(args);
      return { empresa_id: 12, status: 'INITIALIZING' };
    }
  }));

  const result = await service.startSession(12);

  assert.deepEqual(calls, [[12]]);
  assert.equal(result.status, 'INITIALIZING');
});

test('delegates disconnectSession to the active provider', async () => {
  const calls = [];
  const service = createMessagingService(createFakeProvider({
    disconnectSession: async (...args) => {
      calls.push(args);
      return { empresa_id: 12, status: 'DISCONNECTED' };
    }
  }));

  const result = await service.disconnectSession(12);

  assert.deepEqual(calls, [[12]]);
  assert.equal(result.status, 'DISCONNECTED');
});

test('propagates provider errors without wrapping them', async () => {
  const providerError = new Error('provider failed');
  const service = createMessagingService(createFakeProvider({
    sendText: async () => {
      throw providerError;
    }
  }), {
    config: { whatsapp: { outboundViaQueue: false } }
  });

  await assert.rejects(() => service.sendText(12, '5215550000000', 'Hola'), providerError);
});

test('keeps WhatsApp status snapshot format compatible', () => {
  const snapshot = {
    empresa_id: 12,
    status: 'CONNECTED',
    qr: null,
    qr_image: null,
    phone: '5215550000000',
    connected_at: new Date().toISOString(),
    last_error: null,
    reconnect_attempt: 0,
    next_reconnect_at: null,
    events: [],
    updated_at: new Date().toISOString()
  };

  assert.equal(validateStatusSnapshot(snapshot), snapshot);
});

test('rejects unsupported WhatsApp status values', () => {
  assert.throws(
    () => validateStatusSnapshot({ empresa_id: 12, status: 'UNKNOWN' }),
    /Unsupported WhatsApp status: UNKNOWN/
  );
});
