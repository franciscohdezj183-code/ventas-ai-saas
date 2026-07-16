import { env } from '../config/env.js';
import { getRedisHealth } from '../redis/redis-health.service.js';
import { getQueueRegistry } from './queue-registry.js';

function queueStatus(queue) {
  return queue?.status ?? 'unknown';
}

export async function getQueueHealth({
  queueConfig = env.queue,
  registry = undefined,
  redisHealth = null
} = {}) {
  const currentRegistry = registry ?? (queueConfig.enabled ? getQueueRegistry({ queueConfig }) : null);

  if (!queueConfig.enabled && !currentRegistry) {
    return {
      enabled: false,
      redis_status: 'disabled',
      command_queue: 'disabled',
      inbound_queue: 'disabled',
      outbound_queue: 'disabled'
    };
  }

  if (queueConfig.enabled && !currentRegistry) {
    return {
      enabled: true,
      redis_status: 'error',
      command_queue: 'unknown',
      inbound_queue: 'unknown',
      outbound_queue: 'unknown'
    };
  }

  const redis = redisHealth ?? await getRedisHealth({ queueConfig });

  return {
    enabled: Boolean(queueConfig.enabled),
    redis_status: redis.redis_status,
    command_queue: queueStatus(currentRegistry.whatsappCommandQueue),
    inbound_queue: queueStatus(currentRegistry.whatsappInboundQueue),
    outbound_queue: queueStatus(currentRegistry.whatsappOutboundQueue)
  };
}

export function isQueueHealthDegraded(queueHealth) {
  return queueHealth.enabled && queueHealth.redis_status !== 'ready';
}
