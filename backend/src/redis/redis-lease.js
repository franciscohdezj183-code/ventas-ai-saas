import { randomUUID } from 'node:crypto';

function prefixedKey(key, queueConfig) {
  const prefix = String(queueConfig?.redisPrefix ?? 'nexus').replace(/:+$/g, '') || 'nexus';
  return `${prefix}:${key}`;
}

export function createRedisLease({
  redisClient,
  queueConfig,
  key,
  ttlMs,
  token = randomUUID()
}) {
  const redisKey = prefixedKey(key, queueConfig);

  return {
    key: redisKey,
    token,
    ttlMs,

    async acquire() {
      const result = await redisClient.set(redisKey, token, 'NX', 'PX', ttlMs);
      return result === 'OK';
    },

    async renew() {
      const result = await redisClient.eval(
        `if redis.call("GET", KEYS[1]) == ARGV[1] then
           return redis.call("PEXPIRE", KEYS[1], ARGV[2])
         end
         return 0`,
        1,
        redisKey,
        token,
        String(ttlMs)
      );
      return Number(result) === 1;
    },

    async release() {
      const result = await redisClient.eval(
        `if redis.call("GET", KEYS[1]) == ARGV[1] then
           return redis.call("DEL", KEYS[1])
         end
         return 0`,
        1,
        redisKey,
        token
      );
      return Number(result) === 1;
    },

    async remainingMs() {
      if (typeof redisClient.pttl !== 'function') {
        return null;
      }

      const ttl = await redisClient.pttl(redisKey);
      return ttl >= 0 ? ttl : 0;
    }
  };
}
