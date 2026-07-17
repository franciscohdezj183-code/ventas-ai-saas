import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { closeDatabase } from '../config/database.js';
import { messagingService } from '../messaging/messaging.service.js';
import { closeQueueRegistry, initializeQueueRegistry } from '../queues/queue-registry.js';
import { createBullQueueName } from '../queues/queue-factory.js';
import { createQueueNames } from '../queues/queue-names.js';
import { processWhatsappCommand } from '../queues/workers/whatsapp-command.processor.js';
import { processWhatsappOutbound } from '../queues/workers/whatsapp-outbound.processor.js';
import { logger } from '../utils/logger.js';
import { createWhatsappGatewayLeaderService } from '../queues/whatsapp-gateway-leader.service.js';
import { whatsappSessionRestoreService } from '../queues/whatsapp-session-restore.service.js';
import { whatsappSessionLeaseService } from '../queues/whatsapp-session-lease.service.js';

const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TTL_SECONDS = 45;
const workerId = `whatsapp-command-${process.pid}-${Date.now()}`;
let worker = null;
let outboundWorker = null;
let heartbeatTimer = null;
let leaderService = null;
let standbyTimer = null;
let shuttingDown = false;

function normalizeError(error) {
  return {
    name: error?.name ?? 'Error',
    message: String(error?.message ?? error ?? 'Unknown error'),
    code: error?.code
  };
}

function heartbeatKey() {
  const prefix = String(env.queue.redisPrefix ?? 'nexus').replace(/:+$/g, '') || 'nexus';
  return `${prefix}:workers:whatsapp-command:${workerId}`;
}

async function writeHeartbeat(redisClient) {
  await redisClient?.set?.(heartbeatKey(), JSON.stringify({
    workerId,
    processRole: 'whatsapp_command_worker',
    updatedAt: new Date().toISOString()
  }), 'EX', HEARTBEAT_TTL_SECONDS);
}

function startHeartbeat(redisClient) {
  heartbeatTimer = setInterval(() => {
    writeHeartbeat(redisClient).catch((error) => {
      logger.warn('whatsapp_command_worker_heartbeat_error', { error: normalizeError(error) });
    });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();
  return writeHeartbeat(redisClient);
}

function assertWorkerConfig() {
  if (!env.queue.enabled) {
    throw new Error('QUEUE_ENABLED must be true to run whatsapp-command.worker');
  }

  if (!env.whatsapp.commandWorker.enabled) {
    throw new Error('WHATSAPP_COMMAND_WORKER_ENABLED must be true to run whatsapp-command.worker');
  }

  if (!env.whatsapp.commandsViaQueue) {
    throw new Error('WHATSAPP_COMMANDS_VIA_QUEUE must be true to run whatsapp-command.worker');
  }

  if (env.whatsapp.outboundViaQueue && !env.whatsapp.outboundWorker.enabled) {
    throw new Error('WHATSAPP_OUTBOUND_WORKER_ENABLED must be true when WHATSAPP_OUTBOUND_VIA_QUEUE=true');
  }
}

async function startWorker() {
  assertWorkerConfig();
  logger.info('whatsapp_process_role', { process_role: 'whatsapp_command_worker' });
  const registry = await initializeQueueRegistry();
  const queueNames = createQueueNames(env.queue.redisPrefix);
  const bullQueueName = createBullQueueName(queueNames.whatsappCommand, env.queue);
  const outboundQueueName = createBullQueueName(queueNames.whatsappOutbound, env.queue);

  await startHeartbeat(registry.redisClient);
  leaderService = createWhatsappGatewayLeaderService({ redisClient: registry.redisClient });
  leaderService.onLost(async () => {
    await stopGatewayConsumption({ closeSessions: true });
    scheduleLeadershipRetry(registry);
  });
  whatsappSessionLeaseService.onLost(async (empresaId, reason) => {
    await messagingService.closeSession(empresaId, reason);
  });

  const acquired = await leaderService.acquire();

  if (!acquired) {
    scheduleLeadershipRetry(registry);
    return;
  }

  await startGatewayConsumption(registry, queueNames, bullQueueName, outboundQueueName);
}

async function startGatewayConsumption(registry, queueNames, bullQueueName, outboundQueueName) {
  if (worker || outboundWorker) {
    return;
  }

  worker = new Worker(bullQueueName, processWhatsappCommand, {
    connection: registry.redisClient,
    prefix: String(env.queue.redisPrefix ?? 'nexus').replace(/:+$/g, '') || 'nexus',
    concurrency: env.whatsapp.commandWorker.concurrency
  });

  worker.on('completed', (job) => {
    logger.info('whatsapp_command_completed', {
      jobId: job?.id,
      command: job?.data?.command,
      empresaId: job?.data?.empresaId
    });
  });
  worker.on('failed', (job, error) => {
    logger.error('whatsapp_command_failed', {
      jobId: job?.id,
      command: job?.data?.command,
      empresaId: job?.data?.empresaId,
      error: normalizeError(error)
    });
  });
  worker.on('stalled', (jobId) => {
    logger.warn('whatsapp_command_stalled', { jobId });
  });
  worker.on('error', (error) => {
    logger.error('whatsapp_command_worker_error', { error: normalizeError(error) });
  });
  await worker.waitUntilReady();

  if (env.whatsapp.outboundWorker.enabled) {
    outboundWorker = new Worker(outboundQueueName, processWhatsappOutbound, {
      connection: registry.redisClient,
      prefix: String(env.queue.redisPrefix ?? 'nexus').replace(/:+$/g, '') || 'nexus',
      concurrency: env.whatsapp.outboundWorker.concurrency
    });
    outboundWorker.on('completed', (job) => {
      logger.info('whatsapp_outbound_completed', {
        jobId: job?.id,
        empresaId: job?.data?.empresaId
      });
    });
    outboundWorker.on('failed', (job, error) => {
      logger.error('whatsapp_outbound_failed', {
        jobId: job?.id,
        empresaId: job?.data?.empresaId,
        error: normalizeError(error)
      });
    });
    outboundWorker.on('stalled', (jobId) => {
      logger.warn('whatsapp_outbound_stalled', { jobId });
    });
    outboundWorker.on('error', (error) => {
      logger.error('whatsapp_outbound_worker_error', { error: normalizeError(error) });
    });
    await outboundWorker.waitUntilReady();
    logger.info('whatsapp_outbound_worker_ready', {
      workerId,
      concurrency: env.whatsapp.outboundWorker.concurrency
    });
  }

  logger.info('whatsapp_command_worker_ready', {
    workerId,
    concurrency: env.whatsapp.commandWorker.concurrency
  });

  whatsappSessionRestoreService.restoreDesiredSessions().catch((error) => {
    logger.error('whatsapp_restore_failed', { error: normalizeError(error) });
  });
}

async function stopGatewayConsumption({ closeSessions = false } = {}) {
  if (standbyTimer) {
    clearTimeout(standbyTimer);
    standbyTimer = null;
  }

  const workers = [worker, outboundWorker];
  worker = null;
  outboundWorker = null;
  whatsappSessionRestoreService.cancel();
  await Promise.allSettled(workers.filter(Boolean).map((currentWorker) => currentWorker.close()));

  if (closeSessions) {
    await messagingService.shutdown();
  }

  await whatsappSessionLeaseService.releaseAll();
}

function scheduleLeadershipRetry(registry) {
  if (shuttingDown || standbyTimer) {
    return;
  }

  standbyTimer = setTimeout(async () => {
    standbyTimer = null;

    if (shuttingDown) {
      return;
    }

    try {
      const acquired = await leaderService.acquire();

      if (acquired) {
        const queueNames = createQueueNames(env.queue.redisPrefix);
        await startGatewayConsumption(
          registry,
          queueNames,
          createBullQueueName(queueNames.whatsappCommand, env.queue),
          createBullQueueName(queueNames.whatsappOutbound, env.queue)
        );
        return;
      }
    } catch (error) {
      logger.warn('whatsapp_gateway_standby_retry_error', { error: normalizeError(error) });
    }

    scheduleLeadershipRetry(registry);
  }, env.whatsapp.gateway.standbyRetryMs);
  standbyTimer.unref?.();
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('whatsapp_command_worker_shutdown', { signal });

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  try {
    if (standbyTimer) {
      clearTimeout(standbyTimer);
      standbyTimer = null;
    }

    await stopGatewayConsumption({ closeSessions: true });
    await leaderService?.release();
    await closeQueueRegistry();
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    logger.error('whatsapp_command_worker_shutdown_error', { error: normalizeError(error) });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  logger.error('whatsapp_command_worker_unhandled_rejection', { error: normalizeError(error) });
});
process.on('uncaughtException', (error) => {
  logger.error('whatsapp_command_worker_uncaught_exception', { error: normalizeError(error) });
  shutdown('uncaughtException');
});

startWorker().catch((error) => {
  logger.error('whatsapp_command_worker_start_error', { error: normalizeError(error) });
  process.exit(1);
});
