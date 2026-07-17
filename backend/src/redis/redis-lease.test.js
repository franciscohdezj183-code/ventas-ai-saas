import assert from 'node:assert/strict';
import test from 'node:test';
import { createRedisLease } from './redis-lease.js';

function fakeRedis() {
  const data = new Map();
  return {
    data,
    async set(key, value, nx, px, ttl) {
      assert.equal(nx, 'NX');
      assert.equal(px, 'PX');
      assert.equal(ttl, 30000);

      if (data.has(key)) {
        return null;
      }

      data.set(key, value);
      return 'OK';
    },
    async eval(script, count, key, token) {
      assert.equal(count, 1);

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

test('only one lease owner can acquire and renew with its own token', async () => {
  const redis = fakeRedis();
  const first = createRedisLease({ redisClient: redis, queueConfig: { redisPrefix: 'nexus' }, key: 'whatsapp:gateway:leader', ttlMs: 30000, token: 'a' });
  const second = createRedisLease({ redisClient: redis, queueConfig: { redisPrefix: 'nexus' }, key: 'whatsapp:gateway:leader', ttlMs: 30000, token: 'b' });

  assert.equal(await first.acquire(), true);
  assert.equal(await second.acquire(), false);
  assert.equal(await first.renew(), true);
  assert.equal(await second.renew(), false);
});

test('release never deletes a token owned by another process', async () => {
  const redis = fakeRedis();
  const first = createRedisLease({ redisClient: redis, queueConfig: { redisPrefix: 'nexus' }, key: 'whatsapp:session-owner:5', ttlMs: 30000, token: 'a' });
  const second = createRedisLease({ redisClient: redis, queueConfig: { redisPrefix: 'nexus' }, key: 'whatsapp:session-owner:5', ttlMs: 30000, token: 'b' });

  assert.equal(await first.acquire(), true);
  assert.equal(await second.release(), false);
  assert.equal(redis.data.get('nexus:whatsapp:session-owner:5'), 'a');
  assert.equal(await first.release(), true);
  assert.equal(redis.data.has('nexus:whatsapp:session-owner:5'), false);
});
