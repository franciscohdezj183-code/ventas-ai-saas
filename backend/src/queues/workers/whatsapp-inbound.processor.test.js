import assert from 'node:assert/strict';
import test from 'node:test';
import { UnrecoverableError } from 'bullmq';
import { createWhatsappInboundProcessor } from './whatsapp-inbound.processor.js';

function inboundJob(overrides = {}) {
  return {
    id: 'inbound-job-1',
    data: {
      eventId: '5-msg-1',
      empresaId: 5,
      provider: 'whatsapp-web',
      whatsappChatId: '5215550000000@c.us',
      resolvedPhoneId: '5215550000000@c.us',
      phone: '5215550000000',
      messageId: 'msg-1',
      messageType: 'text',
      body: 'hola',
      receivedAt: '2026-07-16T10:00:00.000Z',
      metadata: {},
      ...overrides
    }
  };
}

test('inbound processor rejects invalid payloads without retry', async () => {
  const processor = createWhatsappInboundProcessor({
    processInbound: async () => {
      throw new Error('should not run');
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  await assert.rejects(
    () => processor(inboundJob({ messageId: '' })),
    UnrecoverableError
  );
});

test('inbound processor enqueues exactly one outbound through business handler', async () => {
  const calls = [];
  const processor = createWhatsappInboundProcessor({
    processInbound: async (payload) => {
      calls.push(payload);
      return { outboundQueued: true };
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  const result = await processor(inboundJob());

  assert.equal(result.outboundQueued, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].empresaId, 5);
});

test('inbound duplicate does not execute business handler', async () => {
  let calls = 0;
  const processor = createWhatsappInboundProcessor({
    processInbound: async () => {
      calls += 1;
      throw new Error('should not run');
    },
    idempotency: {
      async claimInbound() {
        return { claimed: false, duplicate: true, status: 'COMPLETED' };
      }
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  const result = await processor(inboundJob());

  assert.equal(result.duplicate, true);
  assert.equal(calls, 0);
});

test('inbound failure marks FAILED before retrying', async () => {
  const failures = [];
  const error = new Error('temporary');
  const processor = createWhatsappInboundProcessor({
    processInbound: async () => {
      throw error;
    },
    idempotency: {
      async claimInbound() {
        return { claimed: true };
      },
      async failInbound(payload) {
        failures.push(payload);
      }
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  await assert.rejects(() => processor(inboundJob()), error);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].externalMessageId, 'msg-1');
});
