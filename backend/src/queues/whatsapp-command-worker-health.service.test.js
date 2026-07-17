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

const recoveryService = {
  async aggregateHealth() {
    return {
      recovery_scheduled: 0,
      recovery_connecting: 0,
      recovery_cooldown: 0,
      recovery_blocked: 0,
      reconnect_attempts_total: 0
    };
  }
};

test('command worker health reports disabled without touching Redis', async () => {
  const health = await getWhatsappCommandWorkerHealth({
    config: config(),
    recoveryService,
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
    whatsapp_outbound_worker: 'disabled',
    gateway_role: 'disabled',
    gateway_leader_status: 'disabled',
    recovery_scheduled: 0,
    recovery_connecting: 0,
    recovery_cooldown: 0,
    recovery_blocked: 0,
    reconnect_attempts_total: 0,
    restore_pending: 0
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
    recoveryService,
    registry: {
      whatsappCommandQueue: { status: 'ready' },
      redisClient: {
        async keys(pattern) {
          return [pattern.replace('*', 'worker-1')];
        },
        async get() {
          return JSON.stringify({ updatedAt: '2026-07-16T10:00:00.000Z' });
        },
        async pttl() {
          return 10000;
        }
      }
    },
    queryFn: async () => [[{ configured_sessions: 2, desired_connected_sessions: 1 }]],
    now: () => new Date('2026-07-16T10:01:00.000Z').getTime()
  });

  assert.equal(health.queue_status, 'ready');
  assert.equal(health.whatsapp_command_worker, 'ready');
  assert.equal(health.whatsapp_inbound_worker, 'ready');
  assert.equal(health.whatsapp_outbound_worker, 'ready');
  assert.equal(health.gateway_leader_status, 'active');
  assert.equal(health.configured_sessions, 2);
  assert.equal(health.desired_connected_sessions, 1);
});

test('command worker health reports stale heartbeat', async () => {
  const health = await getWhatsappCommandWorkerHealth({
    config: config({ whatsapp: { commandsViaQueue: true, commandWorker: { enabled: true, staleMs: 300000 } } }),
    recoveryService,
    registry: {
      whatsappCommandQueue: { status: 'ready' },
      redisClient: {
        async keys() {
          return ['nexus:workers:whatsapp-command:worker-1'];
        },
        async get() {
          return JSON.stringify({ updatedAt: '2026-07-16T10:00:00.000Z' });
        },
        async pttl() {
          return -2;
        }
      }
    },
    queryFn: async () => [[{ configured_sessions: 0, desired_connected_sessions: 0 }]],
    now: () => new Date('2026-07-16T10:10:01.000Z').getTime()
  });

  assert.equal(health.queue_status, 'stale');
});
