import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deliverWhatsappResponse,
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
