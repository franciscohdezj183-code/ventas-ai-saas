import assert from 'node:assert/strict';
import test from 'node:test';
import { createWhatsappGatewayLeaderService } from './whatsapp-gateway-leader.service.js';

function fakeRedis() {
  const data = new Map();
  return {
    data,
    async set(key, value) {
      if (data.has(key)) {
        return null;
      }
      data.set(key, value);
      return 'OK';
    },
    async eval(script, count, key, token) {
      if (script.includes('PEXPIRE')) {
        return data.get(key) === token ? 1 : 0;
      }
      if (script.includes('DEL') && data.get(key) === token) {
        data.delete(key);
        return 1;
      }
      return 0;
    },
    async pttl(key) {
      return data.has(key) ? 1000 : -2;
    }
  };
}

test('only one gateway becomes leader and standby can acquire after release', async () => {
  const redis = fakeRedis();
  const timers = [];
  const first = createWhatsappGatewayLeaderService({
    redisClient: redis,
    token: 'leader-a',
    config: { queue: { redisPrefix: 'nexus' }, whatsapp: { gateway: { leaderTtlMs: 30000, leaderRenewMs: 10000 } } },
    loggerInstance: { info() {}, warn() {}, error() {} },
    setIntervalFn(fn) {
      timers.push(fn);
      return { unref() {} };
    },
    clearIntervalFn() {}
  });
  const second = createWhatsappGatewayLeaderService({
    redisClient: redis,
    token: 'leader-b',
    config: { queue: { redisPrefix: 'nexus' }, whatsapp: { gateway: { leaderTtlMs: 30000, leaderRenewMs: 10000 } } },
    loggerInstance: { info() {}, warn() {}, error() {} },
    setIntervalFn(fn) {
      timers.push(fn);
      return { unref() {} };
    },
    clearIntervalFn() {}
  });

  assert.equal(await first.acquire(), true);
  assert.equal(await second.acquire(), false);
  assert.equal(await second.release(), false);
  assert.equal(redis.data.get('nexus:whatsapp:gateway:leader'), 'leader-a');
  assert.equal(await first.release(), true);
  assert.equal(await second.acquire(), true);
});

test('leader loss callback runs when renewal sees another token', async () => {
  const redis = fakeRedis();
  let lost = false;
  const leader = createWhatsappGatewayLeaderService({
    redisClient: redis,
    token: 'leader-a',
    config: { queue: { redisPrefix: 'nexus' }, whatsapp: { gateway: { leaderTtlMs: 30000, leaderRenewMs: 10000 } } },
    loggerInstance: { info() {}, warn() {}, error() {} },
    setIntervalFn() { return { unref() {} }; },
    clearIntervalFn() {}
  });
  leader.onLost(async () => {
    lost = true;
  });

  await leader.acquire();
  redis.data.set('nexus:whatsapp:gateway:leader', 'other');
  assert.equal(await leader.renew(), false);
  assert.equal(lost, true);
});
