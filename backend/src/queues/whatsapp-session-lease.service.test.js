import assert from 'node:assert/strict';
import test from 'node:test';
import { createWhatsappSessionLeaseService } from './whatsapp-session-lease.service.js';

function fakeRedis() {
  const data = new Map();
  return {
    data,
    async set(key, value) {
      if (data.has(key)) return null;
      data.set(key, value);
      return 'OK';
    },
    async eval(script, count, key, token) {
      if (script.includes('PEXPIRE')) return data.get(key) === token ? 1 : 0;
      if (script.includes('DEL') && data.get(key) === token) {
        data.delete(key);
        return 1;
      }
      return 0;
    }
  };
}

function harness(redis = fakeRedis()) {
  const timers = [];
  const service = createWhatsappSessionLeaseService({
    config: {
      queue: { redisPrefix: 'nexus' },
      whatsapp: { sessionLease: { ttlMs: 30000, renewMs: 10000 } }
    },
    getRegistry: () => ({ redisClient: redis }),
    tokenPrefix: 'owner',
    loggerInstance: { info() {}, warn() {}, error() {} },
    setIntervalFn(fn) {
      timers.push(fn);
      return { unref() {} };
    },
    clearIntervalFn() {}
  });
  return { redis, service, timers };
}

test('two concurrent attempts for one company create one owner, while companies differ', async () => {
  const { service } = harness();

  const [first, second] = await Promise.allSettled([
    service.acquire(5),
    service.acquire(5)
  ]);

  assert.equal(first.status, 'fulfilled');
  assert.equal(second.status, 'rejected');
  await service.acquire(6);
  assert.deepEqual(service.activeEmpresaIds().sort(), [5, 6]);
});

test('disconnect release removes only own token', async () => {
  const { redis, service } = harness();

  await service.acquire(5);
  const key = 'nexus:whatsapp:session-owner:5';
  redis.data.set(key, 'foreign-token');

  assert.equal(await service.release(5), false);
  assert.equal(redis.data.get(key), 'foreign-token');
});
