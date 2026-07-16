import { env } from '../config/env.js';
import { getQueueRegistry } from './queue-registry.js';

function heartbeatPattern(workerName, queueConfig = env.queue) {
  const prefix = String(queueConfig.redisPrefix ?? 'nexus').replace(/:+$/g, '') || 'nexus';
  return `${prefix}:workers:${workerName}:*`;
}

async function readWorkerStatus({ workerName, enabled, currentRegistry, config, now }) {
  if (!enabled) {
    return 'disabled';
  }

  if (!currentRegistry?.redisClient || typeof currentRegistry.redisClient.keys !== 'function' || typeof currentRegistry.redisClient.get !== 'function') {
    return 'unavailable';
  }

  const keys = await currentRegistry.redisClient.keys(heartbeatPattern(workerName, config.queue));

  if (!keys.length) {
    return 'unavailable';
  }

  const heartbeats = await Promise.all(keys.map(async (key) => {
    try {
      return JSON.parse(await currentRegistry.redisClient.get(key));
    } catch {
      return null;
    }
  }));
  const newestHeartbeatAt = heartbeats
    .map((heartbeat) => new Date(heartbeat?.updatedAt ?? 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)[0];

  if (!newestHeartbeatAt) {
    return 'unavailable';
  }

  return now() - newestHeartbeatAt > config.whatsapp.commandWorker.staleMs ? 'stale' : 'ready';
}

export async function getWhatsappCommandWorkerHealth({
  config = env,
  registry = undefined,
  now = Date.now
} = {}) {
  if (!config.whatsapp.commandsViaQueue) {
    return {
      via_queue: false,
      queue_status: 'disabled',
      whatsapp_command_worker: 'disabled',
      whatsapp_inbound_worker: 'disabled',
      whatsapp_outbound_worker: 'disabled'
    };
  }

  const currentRegistry = registry ?? getQueueRegistry({ queueConfig: config.queue });
  const commandQueueStatus = currentRegistry?.whatsappCommandQueue?.status ?? 'unknown';

  if (commandQueueStatus !== 'ready') {
    return {
      via_queue: true,
      queue_status: 'unavailable',
      whatsapp_command_worker: 'unavailable',
      whatsapp_inbound_worker: config.whatsapp.inboundViaQueue ? 'unavailable' : 'disabled',
      whatsapp_outbound_worker: config.whatsapp.outboundViaQueue ? 'unavailable' : 'disabled'
    };
  }
  const commandWorker = await readWorkerStatus({
    workerName: 'whatsapp-command',
    enabled: config.whatsapp.commandWorker.enabled,
    currentRegistry,
    config,
    now
  });
  const inboundWorker = await readWorkerStatus({
    workerName: 'whatsapp-inbound',
    enabled: config.whatsapp.inboundViaQueue,
    currentRegistry,
    config,
    now
  });
  const outboundWorker = await readWorkerStatus({
    workerName: 'whatsapp-command',
    enabled: config.whatsapp.outboundViaQueue,
    currentRegistry,
    config,
    now
  });

  return {
    via_queue: true,
    queue_status: [commandWorker, inboundWorker, outboundWorker].includes('unavailable')
      ? 'unavailable'
      : ([commandWorker, inboundWorker, outboundWorker].includes('stale') ? 'stale' : 'ready'),
    whatsapp_command_worker: commandWorker,
    whatsapp_inbound_worker: inboundWorker,
    whatsapp_outbound_worker: outboundWorker
  };
}
