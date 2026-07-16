import assert from 'node:assert/strict';
import test from 'node:test';
import { getWhatsappCommandWorkerHealth } from './whatsapp-command-worker-health.service.js';

function config(overrides = {}) {
  return {
    queue: {
      redisPrefix: 'nexus'
    },
    whatsapp: {
      commandsViaQueue: false,
      commandWorker: {
        staleMs: 300000
      },
      ...overrides.whatsapp
    },
    ...overrides
  };
}

test('command worker health reports disabled without touching Redis', async () => {
  const health = await getWhatsappCommandWorkerHealth({
    config: config(),
    registry: {
      redisClient: {
        async keys() {
          throw new Error('should not query redis when disabled');
        }
      }
    }
  });

  assert.deepEqual(health, {
    via_queue: false,
    queue_status: 'disabled',
    whatsapp_command_worker: 'disabled',
    whatsapp_inbound_worker: 'disabled',
    whatsapp_outbound_worker: 'disabled'
  });
});

test('command worker health reports ready heartbeat', async () => {
  const health = await getWhatsappCommandWorkerHealth({
    config: config({
      whatsapp: {
        commandsViaQueue: true,
        inboundViaQueue: true,
        outboundViaQueue: true,
        commandWorker: { enabled: true, staleMs: 300000 }
      }
    }),
    registry: {
      whatsappCommandQueue: { status: 'ready' },
      redisClient: {
        async keys(pattern) {
          return [pattern.replace('*', 'worker-1')];
        },
        async get() {
          return JSON.stringify({ updatedAt: '2026-07-16T10:00:00.000Z' });
        }
      }
    },
    now: () => new Date('2026-07-16T10:01:00.000Z').getTime()
  });

  assert.deepEqual(health, {
    via_queue: true,
    queue_status: 'ready',
    whatsapp_command_worker: 'ready',
    whatsapp_inbound_worker: 'ready',
    whatsapp_outbound_worker: 'ready'
  });
});

test('command worker health reports stale heartbeat', async () => {
  const health = await getWhatsappCommandWorkerHealth({
    config: config({ whatsapp: { commandsViaQueue: true, commandWorker: { enabled: true, staleMs: 300000 } } }),
    registry: {
      whatsappCommandQueue: { status: 'ready' },
      redisClient: {
        async keys() {
          return ['nexus:workers:whatsapp-command:worker-1'];
        },
        async get() {
          return JSON.stringify({ updatedAt: '2026-07-16T10:00:00.000Z' });
        }
      }
    },
    now: () => new Date('2026-07-16T10:10:01.000Z').getTime()
  });

  assert.equal(health.queue_status, 'stale');
});
