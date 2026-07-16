import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { closeDatabase } from '../config/database.js';
import { closeQueueRegistry, initializeQueueRegistry } from '../queues/queue-registry.js';
import { createBullQueueName } from '../queues/queue-factory.js';
import { createQueueNames } from '../queues/queue-names.js';
import { processWhatsappInbound } from '../queues/workers/whatsapp-inbound.processor.js';
import { logger } from '../utils/logger.js';

const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TTL_SECONDS = 45;
const workerId = `whatsapp-inbound-${process.pid}-${Date.now()}`;
let worker = null;
let heartbeatTimer = null;
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
  return `${prefix}:workers:whatsapp-inbound:${workerId}`;
}

async function writeHeartbeat(redisClient) {
  await redisClient?.set?.(heartbeatKey(), JSON.stringify({
    workerId,
    processRole: 'whatsapp_inbound_worker',
    updatedAt: new Date().toISOString()
  }), 'EX', HEARTBEAT_TTL_SECONDS);
}

async function startHeartbeat(redisClient) {
  heartbeatTimer = setInterval(() => {
    writeHeartbeat(redisClient).catch((error) => {
      logger.warn('whatsapp_inbound_worker_heartbeat_error', { error: normalizeError(error) });
    });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();
  await writeHeartbeat(redisClient);
}

function assertWorkerConfig() {
  if (!env.queue.enabled) {
    throw new Error('QUEUE_ENABLED must be true to run whatsapp-inbound.worker');
  }

  if (!env.whatsapp.inboundWorker.enabled) {
    throw new Error('WHATSAPP_INBOUND_WORKER_ENABLED must be true to run whatsapp-inbound.worker');
  }

  if (!env.whatsapp.inboundViaQueue) {
    throw new Error('WHATSAPP_INBOUND_VIA_QUEUE must be true to run whatsapp-inbound.worker');
  }
}

async function startWorker() {
  assertWorkerConfig();
  logger.info('whatsapp_process_role', { process_role: 'whatsapp_inbound_worker' });
  const registry = await initializeQueueRegistry();
  const queueNames = createQueueNames(env.queue.redisPrefix);
  const bullQueueName = createBullQueueName(queueNames.whatsappInbound, env.queue);

  await startHeartbeat(registry.redisClient);
  worker = new Worker(bullQueueName, processWhatsappInbound, {
    connection: registry.redisClient,
    prefix: String(env.queue.redisPrefix ?? 'nexus').replace(/:+$/g, '') || 'nexus',
    concurrency: env.whatsapp.inboundWorker.concurrency
  });

  worker.on('completed', (job) => {
    logger.info('whatsapp_inbound_completed', {
      jobId: job?.id,
      empresaId: job?.data?.empresaId,
      messageId: job?.data?.messageId
    });
  });
  worker.on('failed', (job, error) => {
    logger.error('whatsapp_inbound_failed', {
      jobId: job?.id,
      empresaId: job?.data?.empresaId,
      messageId: job?.data?.messageId,
      error: normalizeError(error)
    });
  });
  worker.on('stalled', (jobId) => {
    logger.warn('whatsapp_inbound_stalled', { jobId });
  });
  worker.on('error', (error) => {
    logger.error('whatsapp_inbound_worker_error', { error: normalizeError(error) });
  });
  await worker.waitUntilReady();
  logger.info('whatsapp_inbound_worker_ready', {
    workerId,
    concurrency: env.whatsapp.inboundWorker.concurrency
  });
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('whatsapp_inbound_worker_shutdown', { signal });

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  try {
    await worker?.close();
    await closeQueueRegistry();
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    logger.error('whatsapp_inbound_worker_shutdown_error', { error: normalizeError(error) });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  logger.error('whatsapp_inbound_worker_unhandled_rejection', { error: normalizeError(error) });
});
process.on('uncaughtException', (error) => {
  logger.error('whatsapp_inbound_worker_uncaught_exception', { error: normalizeError(error) });
  shutdown('uncaughtException');
});

startWorker().catch((error) => {
  logger.error('whatsapp_inbound_worker_start_error', { error: normalizeError(error) });
  process.exit(1);
});
