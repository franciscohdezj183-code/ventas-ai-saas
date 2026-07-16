import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deliverWhatsappResponse,
  enqueueNormalizedInboundMessage,
  normalizeInboundWhatsappMessage,
  normalizeWhatsappError,
  resolveIncomingWhatsappIdentity,
  whatsappErrorSummary
} from './whatsapp.service.js';

function createMessage(overrides = {}) {
  return {
    from: '5215550000000@c.us',
    author: undefined,
    body: 'hola',
    getContact: async () => ({
      number: '5215550000000',
      id: {
        _serialized: '5215550000000@c.us',
        user: '5215550000000'
      }
    }),
    ...overrides
  };
}

test('resolves a normal incoming @c.us message', async () => {
  const identity = await resolveIncomingWhatsappIdentity({
    client: {},
    message: createMessage({ from: '5215550000000@c.us' })
  });

  assert.equal(identity.whatsappChatId, '5215550000000@c.us');
  assert.equal(identity.phone, '5215550000000');
  assert.equal(identity.resolvedPhoneId, '5215550000000@c.us');
  assert.equal(identity.source, 'from_c_us');
});

test('resolves an incoming @lid message through getContactLidAndPhone', async () => {
  const identity = await resolveIncomingWhatsappIdentity({
    client: {
      getContactLidAndPhone: async (lids) => {
        assert.deepEqual(lids, ['113950146457660@lid']);
        return [{ lid: '113950146457660@lid', pn: '527712345678@c.us' }];
      }
    },
    message: createMessage({
      from: '113950146457660@lid',
      getContact: async () => {
        throw new Error('should not need contact fallback');
      }
    })
  });

  assert.equal(identity.whatsappChatId, '113950146457660@lid');
  assert.equal(identity.phone, '527712345678');
  assert.equal(identity.resolvedPhoneId, '527712345678@c.us');
  assert.equal(identity.source, 'lid_lookup');
});

test('prefers pn @c.us over the LID value', async () => {
  const identity = await resolveIncomingWhatsappIdentity({
    client: {
      getContactLidAndPhone: async () => [{ lid: '113950146457660', pn: '527700000001@c.us' }]
    },
    message: createMessage({ from: '113950146457660@lid' })
  });

  assert.equal(identity.phone, '527700000001');
  assert.notEqual(identity.phone, '113950146457660');
});

test('falls back to message.getContact when LID lookup does not return pn', async () => {
  const identity = await resolveIncomingWhatsappIdentity({
    client: {
      getContactLidAndPhone: async () => [{ lid: '113950146457660@lid' }]
    },
    message: createMessage({
      from: '113950146457660@lid',
      getContact: async () => ({
        number: '527712345679',
        id: {
          _serialized: '113950146457660@lid',
          user: '113950146457660'
        }
      })
    })
  });

  assert.equal(identity.phone, '527712345679');
  assert.equal(identity.resolvedPhoneId, '527712345679@c.us');
  assert.equal(identity.source, 'contact_number');
});

test('does not convert an unresolved LID into a phone number', async () => {
  const identity = await resolveIncomingWhatsappIdentity({
    client: {
      getContactLidAndPhone: async () => []
    },
    message: createMessage({
      from: '113950146457660@lid',
      getContact: async () => ({
        id: {
          _serialized: '113950146457660@lid',
          user: '113950146457660'
        }
      })
    })
  });

  assert.equal(identity.whatsappChatId, '113950146457660@lid');
  assert.equal(identity.phone, null);
  assert.equal(identity.resolvedPhoneId, null);
  assert.equal(identity.source, 'unresolved_lid');
});

test('sends responses to the original whatsappChatId', async () => {
  const calls = [];
  const delivery = await deliverWhatsappResponse({
    client: {
      sendMessage: async (...args) => {
        calls.push(args);
      }
    },
    message: createMessage({ from: '113950146457660@lid' }),
    whatsappChatId: '113950146457660@lid',
    resolvedPhoneId: '527712345678@c.us',
    response: 'Hola'
  });

  assert.deepEqual(calls, [['113950146457660@lid', 'Hola']]);
  assert.equal(delivery.sent, true);
  assert.equal(delivery.attempts.length, 1);
});

test('falls back to pn when sending to the LID fails', async () => {
  const calls = [];
  const delivery = await deliverWhatsappResponse({
    client: {
      sendMessage: async (destination, response) => {
        calls.push([destination, response]);

        if (destination.endsWith('@lid')) {
          throw new Error('primary failed');
        }
      }
    },
    message: createMessage({ from: '113950146457660@lid' }),
    whatsappChatId: '113950146457660@lid',
    resolvedPhoneId: '527712345678@c.us',
    response: 'Hola'
  });

  assert.deepEqual(calls, [
    ['113950146457660@lid', 'Hola'],
    ['527712345678@c.us', 'Hola']
  ]);
  assert.equal(delivery.sent, true);
  assert.equal(delivery.attempts.length, 2);
});

test('does not duplicate responses when the first send succeeds', async () => {
  let sentCount = 0;
  await deliverWhatsappResponse({
    client: {
      sendMessage: async () => {
        sentCount += 1;
      }
    },
    message: createMessage({ from: '113950146457660@lid' }),
    whatsappChatId: '113950146457660@lid',
    resolvedPhoneId: '527712345678@c.us',
    response: 'Hola'
  });

  assert.equal(sentCount, 1);
});

test('throws with both attempts when primary and fallback fail', async () => {
  await assert.rejects(
    () => deliverWhatsappResponse({
      client: {
        sendMessage: async () => {
          throw new Error('send failed');
        }
      },
      message: createMessage({ from: '113950146457660@lid' }),
      whatsappChatId: '113950146457660@lid',
      resolvedPhoneId: '527712345678@c.us',
      response: 'Hola'
    }),
    (error) => {
      assert.equal(error.attempts.length, 2);
      assert.equal(error.attempts[0].success, false);
      assert.equal(error.attempts[1].success, false);
      return true;
    }
  );
});

test('serializes a non-Error thrown value safely', () => {
  const circular = { message: 'plain failure', code: 'PLAIN' };
  circular.self = circular;

  const normalized = normalizeWhatsappError(circular);

  assert.equal(normalized.message, 'plain failure');
  assert.equal(normalized.code, 'PLAIN');
  assert.equal(normalized.serialized.self, '[Circular]');
});

test('formats a single-letter "r" error into an understandable status message', () => {
  const summary = whatsappErrorSummary(new Error('r'));

  assert.match(summary, /WhatsApp envio un error no descriptivo/);
  assert.notEqual(summary, 'r');
});

test('keeps compatibility with existing incoming @c.us messages', async () => {
  const identity = await resolveIncomingWhatsappIdentity({
    client: {
      getContactLidAndPhone: async () => {
        throw new Error('should not be called for c.us');
      }
    },
    message: createMessage({
      from: '5211112223333@c.us',
      author: '113950146457660@lid'
    })
  });

  assert.deepEqual(
    {
      whatsappChatId: identity.whatsappChatId,
      phone: identity.phone,
      resolvedPhoneId: identity.resolvedPhoneId,
      source: identity.source
    },
    {
      whatsappChatId: '5211112223333@c.us',
      phone: '5211112223333',
      resolvedPhoneId: '5211112223333@c.us',
      source: 'from_c_us'
    }
  );
});

test('normalizes inbound WhatsApp message without carrying whatsapp-web objects', async () => {
  const normalized = await normalizeInboundWhatsappMessage({
    empresaId: 5,
    client: {},
    message: createMessage({
      id: { _serialized: 'false_5215550000000@c.us_ABC123' },
      from: '5215550000000@c.us',
      type: 'chat',
      timestamp: 1784210400,
      body: 'hola'
    })
  });

  assert.equal(normalized.empresaId, 5);
  assert.equal(normalized.provider, 'whatsapp-web');
  assert.equal(normalized.messageId, 'false_5215550000000-c-us_ABC123');
  assert.equal(normalized.messageType, 'text');
  assert.equal(normalized.whatsappChatId, '5215550000000@c.us');
  assert.equal(normalized.phone, '5215550000000');
  assert.equal(normalized.body, 'hola');
  assert.equal(typeof normalized.metadata, 'object');
  assert.equal('client' in normalized, false);
  assert.equal('message' in normalized, false);
});

test('normalizes realistic @lid inbound message after lookup timeout using provisional identity', async () => {
  let contactFallbackCalls = 0;
  const normalized = await normalizeInboundWhatsappMessage({
    empresaId: 5,
    lookupTimeoutMs: 5,
    client: {
      getContactLidAndPhone: async () => new Promise(() => {})
    },
    message: createMessage({
      id: { _serialized: 'false_113950146457660@lid_3EB0A9F4D5C7B8A9012' },
      from: '113950146457660@lid',
      author: undefined,
      type: 'chat',
      timestamp: 1784210880,
      body: 'hola, tienes catalogo?',
      getContact: async () => {
        contactFallbackCalls += 1;
        throw new Error('contact fallback should not block timeout path');
      }
    })
  });

  assert.equal(normalized.empresaId, 5);
  assert.equal(normalized.whatsappChatId, '113950146457660@lid');
  assert.equal(normalized.phone, 'lid:113950146457660');
  assert.equal(normalized.resolvedPhoneId, null);
  assert.equal(normalized.metadata.source, 'lid_lookup_timeout');
  assert.equal(normalized.messageType, 'text');
  assert.equal(normalized.eventId, '5-false_113950146457660-lid_3EB0A9F4D5C7B8A9012');
  assert.equal(contactFallbackCalls, 0);
});

test('enqueueNormalizedInboundMessage uses initialized inbound queue instance', async () => {
  const calls = [];
  const job = await enqueueNormalizedInboundMessage({
    eventId: '5-false_113950146457660-lid_3EB0A9F4D5C7B8A9012',
    empresaId: 5,
    provider: 'whatsapp-web',
    messageId: 'false_113950146457660-lid_3EB0A9F4D5C7B8A9012',
    whatsappChatId: '113950146457660@lid',
    resolvedPhoneId: null,
    phone: 'lid:113950146457660',
    messageType: 'text',
    body: 'hola',
    receivedAt: '2026-07-16T23:08:00.000Z',
    metadata: { source: 'lid_lookup_timeout' }
  }, {
    registry: {
      status: 'ready',
      whatsappInboundQueue: {
        status: 'ready',
        async enqueue(payload) {
          calls.push(payload);
          return { id: 'whatsapp-inbound-5-realistic-lid' };
        }
      }
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  assert.equal(job.id, 'whatsapp-inbound-5-realistic-lid');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].whatsappChatId, '113950146457660@lid');
});
