import assert from 'node:assert/strict';
import test from 'node:test';
import { createQueueNames } from './queue-names.js';
import { createBullQueueName, createDefaultJobOptions, deterministicJobId } from './queue-factory.js';
import {
  validateWhatsappCommandJob,
  validateWhatsappInboundJob,
  validateWhatsappOutboundJob
} from './queue-payloads.js';
import { maskRedisUrl } from '../redis/redis-client.js';

test('defines stable versioned queue names with a single prefix', () => {
  assert.deepEqual(createQueueNames('nexus:'), {
    whatsappCommand: 'nexus:whatsapp:commands:v1',
    whatsappInbound: 'nexus:whatsapp:inbound:v1',
    whatsappOutbound: 'nexus:whatsapp:outbound:v1'
  });
});

test('builds retry and exponential backoff options from config', () => {
  assert.deepEqual(createDefaultJobOptions({
    attempts: 5,
    backoffMs: 2000,
    removeOnComplete: 1000,
    removeOnFail: 5000
  }), {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 1000,
    removeOnFail: 5000
  });
});

test('converts versioned queue identifiers into BullMQ-safe names', () => {
  assert.equal(
    createBullQueueName('nexus:whatsapp:commands:v1', { redisPrefix: 'nexus' }),
    'whatsapp-commands-v1'
  );
});

test('creates deterministic job ids', () => {
  assert.equal(deterministicJobId('whatsapp-command', 'empresa-5:START_SESSION'), 'whatsapp-command:empresa-5:START_SESSION');
});

test('validates empresaId for command jobs', () => {
  assert.throws(
    () => validateWhatsappCommandJob({ command: 'START_SESSION', empresaId: 0 }),
    /empresaId must be a positive integer/
  );
});

test('validates allowed command names', () => {
  assert.throws(
    () => validateWhatsappCommandJob({ command: 'SEND_MESSAGE', empresaId: 5 }),
    /command must be one of/
  );
});

test('rejects dangerous payload keys', () => {
  const unsafePayload = JSON.parse('{"command":"START_SESSION","empresaId":5,"payload":{"__proto__":{"polluted":true}}}');

  assert.throws(
    () => validateWhatsappCommandJob(unsafePayload),
    /unsafe key "__proto__"/
  );
});

test('rejects non-serializable values and circular objects', () => {
  assert.throws(
    () => validateWhatsappCommandJob({ command: 'START_SESSION', empresaId: 5, payload: { run() {} } }),
    /must be JSON serializable/
  );

  const circular = { command: 'START_SESSION', empresaId: 5, payload: {} };
  circular.payload.self = circular;

  assert.throws(
    () => validateWhatsappCommandJob(circular),
    /circular references/
  );
});

test('validates inbound job contract', () => {
  const job = validateWhatsappInboundJob({
    eventId: 'evt-1',
    empresaId: 5,
    whatsappChatId: '113950146457660@lid',
    phone: '527712345678',
    messageId: 'msg-1',
    messageType: 'text',
    body: 'hola',
    receivedAt: '2026-07-16T10:00:00.000Z',
    metadata: { source: 'whatsapp-web' }
  });

  assert.equal(job.eventId, 'evt-1');
  assert.equal(job.empresaId, 5);
  assert.equal(job.messageType, 'text');
});

test('validates outbound job contract', () => {
  const job = validateWhatsappOutboundJob({
    messageId: 'msg-out-1',
    empresaId: 5,
    whatsappChatId: '113950146457660@lid',
    type: 'text',
    text: 'Hola',
    createdAt: '2026-07-16T10:00:00.000Z',
    correlationId: 'corr-1'
  });

  assert.equal(job.messageId, 'msg-out-1');
  assert.equal(job.type, 'text');
  assert.equal(job.text, 'Hola');
});

test('masks credentials in Redis URLs', () => {
  const masked = maskRedisUrl('redis://user:secret@127.0.0.1:6379/0');

  assert.equal(masked.includes('secret'), false);
  assert.equal(masked.includes('user'), false);
  assert.match(masked, /redis:\/\/\*\*\*:\*\*\*@127\.0\.0\.1:6379\/0/);
});
