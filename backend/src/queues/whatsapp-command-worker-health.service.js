import { env } from '../config/env.js';
import { getQueueRegistry } from './queue-registry.js';

function heartbeatPattern(queueConfig = env.queue) {
  const prefix = String(queueConfig.redisPrefix ?? 'nexus').replace(/:+$/g, '') || 'nexus';
  return `${prefix}:workers:whatsapp-command:*`;
}

export async function getWhatsappCommandWorkerHealth({
  config = env,
  registry = undefined,
  now = Date.now
} = {}) {
  if (!config.whatsapp.commandsViaQueue) {
    return {
      via_queue: false,
      queue_status: 'disabled'
    };
  }

  const currentRegistry = registry ?? getQueueRegistry({ queueConfig: config.queue });
  const commandQueueStatus = currentRegistry?.whatsappCommandQueue?.status ?? 'unknown';

  if (commandQueueStatus !== 'ready') {
    return {
      via_queue: true,
      queue_status: 'unavailable'
    };
  }

  const redisClient = currentRegistry?.redisClient;

  if (!redisClient || typeof redisClient.keys !== 'function' || typeof redisClient.get !== 'function') {
    return {
      via_queue: true,
      queue_status: 'unavailable'
    };
  }

  const keys = await redisClient.keys(heartbeatPattern(config.queue));

  if (!keys.length) {
    return {
      via_queue: true,
      queue_status: 'unavailable'
    };
  }

  const heartbeats = await Promise.all(keys.map(async (key) => {
    try {
      return JSON.parse(await redisClient.get(key));
    } catch {
      return null;
    }
  }));
  const newestHeartbeatAt = heartbeats
    .map((heartbeat) => new Date(heartbeat?.updatedAt ?? 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)[0];

  if (!newestHeartbeatAt) {
    return {
      via_queue: true,
      queue_status: 'unavailable'
    };
  }

  return {
    via_queue: true,
    queue_status: now() - newestHeartbeatAt > config.whatsapp.commandWorker.staleMs ? 'stale' : 'ready'
  };
}
