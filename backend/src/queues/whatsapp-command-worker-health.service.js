import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { getQueueRegistry } from './queue-registry.js';
import { whatsappSessionRecoveryService } from '../modules/whatsapp/whatsapp-session-recovery.service.js';

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
  now = Date.now,
  queryFn = query,
  recoveryService = whatsappSessionRecoveryService
} = {}) {
  if (!config.whatsapp.commandsViaQueue) {
    return {
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
      whatsapp_outbound_worker: config.whatsapp.outboundViaQueue ? 'unavailable' : 'disabled',
      gateway_role: 'unknown',
      gateway_leader_status: 'unavailable',
      recovery_scheduled: 0,
      recovery_connecting: 0,
      recovery_cooldown: 0,
      recovery_blocked: 0,
      reconnect_attempts_total: 0,
      restore_pending: 0
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

  let desiredConnectedSessions = 0;
  let configuredSessions = 0;
  let recoveryHealth = {
    recovery_scheduled: 0,
    recovery_connecting: 0,
    recovery_cooldown: 0,
    recovery_blocked: 0,
    reconnect_attempts_total: 0
  };

  try {
    const [rows] = await queryFn(
      `SELECT COUNT(*) AS configured_sessions,
              SUM(CASE WHEN desired_state = 'CONNECTED' THEN 1 ELSE 0 END) AS desired_connected_sessions
         FROM whatsapp_session_config`
    );
    configuredSessions = Number(rows[0]?.configured_sessions ?? 0);
    desiredConnectedSessions = Number(rows[0]?.desired_connected_sessions ?? 0);
  } catch {
    configuredSessions = 0;
    desiredConnectedSessions = 0;
  }

  try {
    recoveryHealth = await recoveryService.aggregateHealth();
  } catch {
    recoveryHealth = {
      recovery_scheduled: 0,
      recovery_connecting: 0,
      recovery_cooldown: 0,
      recovery_blocked: 0,
      reconnect_attempts_total: 0
    };
  }

  const leaderKey = `${String(config.queue.redisPrefix ?? 'nexus').replace(/:+$/g, '') || 'nexus'}:whatsapp:gateway:leader`;
  const leaderTtl = typeof currentRegistry.redisClient.pttl === 'function'
    ? await currentRegistry.redisClient.pttl(leaderKey).catch(() => -2)
    : -2;

  return {
    via_queue: true,
    queue_status: [commandWorker, inboundWorker, outboundWorker].includes('unavailable')
      ? 'unavailable'
      : ([commandWorker, inboundWorker, outboundWorker].includes('stale') ? 'stale' : 'ready'),
    whatsapp_command_worker: commandWorker,
    whatsapp_inbound_worker: inboundWorker,
    whatsapp_outbound_worker: outboundWorker,
    gateway_role: leaderTtl > 0 ? 'leader_or_standby' : 'standby',
    gateway_leader_status: leaderTtl > 0 ? 'active' : 'missing',
    gateway_lease_remaining_ms: leaderTtl > 0 ? leaderTtl : 0,
    configured_sessions: configuredSessions,
    desired_connected_sessions: desiredConnectedSessions,
    restore_pending: 0,
    ...recoveryHealth
  };
}
