import assert from 'node:assert/strict';
import test from 'node:test';
import { createWhatsappOutboundProcessor } from './whatsapp-outbound.processor.js';

function outboundJob(overrides = {}) {
  return {
    id: 'outbound-job-1',
    data: {
      messageId: 'msg-1',
      empresaId: 5,
      provider: 'whatsapp-web',
      whatsappChatId: '113950146457660@lid',
      resolvedPhoneId: '5215550000000@c.us',
      phone: '5215550000000',
      type: 'text',
      text: 'Hola',
      createdAt: '2026-07-16T10:00:00.000Z',
      correlationId: 'corr-1',
      source: 'test',
      ...overrides
    }
  };
}

test('outbound processor sends directly without re-enqueueing', async () => {
  const calls = [];
  const processor = createWhatsappOutboundProcessor({
    service: {
      async sendTextDirect(...args) {
        calls.push(args);
        return { status: 'SENT' };
      },
      async sendText() {
        throw new Error('should not enqueue');
      }
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  const result = await processor(outboundJob());

  assert.equal(result.status, 'SENT');
  assert.deepEqual(calls, [[5, '113950146457660@lid', 'Hola']]);
});

test('outbound processor falls back from whatsappChatId to resolvedPhoneId', async () => {
  const calls = [];
  const processor = createWhatsappOutboundProcessor({
    service: {
      async sendTextDirect(empresaId, destination, text) {
        calls.push([empresaId, destination, text]);

        if (destination.endsWith('@lid')) {
          throw new Error('primary failed');
        }

        return { status: 'SENT' };
      }
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  const result = await processor(outboundJob());

  assert.equal(result.status, 'SENT');
  assert.deepEqual(calls, [
    [5, '113950146457660@lid', 'Hola'],
    [5, '5215550000000@c.us', 'Hola']
  ]);
});

test('outbound processor does not duplicate when first send succeeds', async () => {
  let calls = 0;
  const processor = createWhatsappOutboundProcessor({
    service: {
      async sendTextDirect() {
        calls += 1;
        return { status: 'SENT' };
      }
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  await processor(outboundJob());

  assert.equal(calls, 1);
});

test('outbound processor rethrows delivery errors for BullMQ retry', async () => {
  const processor = createWhatsappOutboundProcessor({
    service: {
      async sendTextDirect() {
        throw new Error('temporary send failure');
      }
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  await assert.rejects(
    () => processor(outboundJob({ resolvedPhoneId: null, phone: null })),
    /No se pudo enviar/
  );
});
