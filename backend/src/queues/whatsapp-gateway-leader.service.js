import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { createRedisLease } from '../redis/redis-lease.js';
import { logger } from '../utils/logger.js';

export function createWhatsappGatewayLeaderService({
  config = env,
  redisClient,
  token = `gateway-${process.pid}-${randomUUID()}`,
  loggerInstance = logger,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  now = Date.now
} = {}) {
  const lease = createRedisLease({
    redisClient,
    queueConfig: config.queue,
    key: 'whatsapp:gateway:leader',
    ttlMs: config.whatsapp.gateway.leaderTtlMs,
    token
  });
  let role = 'standby';
  let timer = null;
  let lastRenewLogAt = 0;
  let onLost = async () => {};

  async function loseLeadership(reason) {
    if (role !== 'leader') {
      return;
    }

    role = 'standby';

    if (timer) {
      clearIntervalFn(timer);
      timer = null;
    }

    loggerInstance.warn('whatsapp_gateway_leader_lost', { reason });
    await onLost(reason);
  }

  return {
    get role() {
      return role;
    },

    onLost(handler) {
      onLost = handler;
    },

    async acquire() {
      const acquired = await lease.acquire();

      if (!acquired) {
        role = 'standby';
        loggerInstance.info('whatsapp_gateway_standby');
        return false;
      }

      role = 'leader';
      loggerInstance.info('whatsapp_gateway_leader_acquired');
      timer = setIntervalFn(() => {
        this.renew().catch((error) => {
          loseLeadership(error?.code ?? 'renew_error');
        });
      }, config.whatsapp.gateway.leaderRenewMs);
      timer.unref?.();
      return true;
    },

    async renew() {
      if (role !== 'leader') {
        return false;
      }

      const renewed = await lease.renew();

      if (!renewed) {
        await loseLeadership('token_mismatch');
        return false;
      }

      if (now() - lastRenewLogAt >= 30000) {
        lastRenewLogAt = now();
        loggerInstance.info('whatsapp_gateway_leader_renewed');
      }

      return true;
    },

    async release() {
      if (timer) {
        clearIntervalFn(timer);
        timer = null;
      }

      const wasLeader = role === 'leader';
      role = 'standby';
      return wasLeader ? lease.release() : false;
    },

    async remainingMs() {
      return lease.remainingMs();
    }
  };
}
