import { checkDatabaseConnection } from '../../config/database.js';
import { env } from '../../config/env.js';
import { messagingService } from '../../messaging/messaging.service.js';
import { getQueueHealth, isQueueHealthDegraded } from '../../queues/queue-health.service.js';
import { getWhatsappCommandWorkerHealth } from '../../queues/whatsapp-command-worker-health.service.js';

export async function getHealth(req, res, next) {
  const checks = {
    database: 'unknown',
    whatsapp: {
      total_sessions: 0,
      connected_sessions: 0
    },
    queues: {
      enabled: false,
      redis_status: 'disabled'
    },
    whatsapp_commands: {
      via_queue: false,
      queue_status: 'disabled'
    }
  };

  try {
    await checkDatabaseConnection();
    checks.database = 'connected';
  } catch (error) {
    checks.database = 'disconnected';
  }

  try {
    const statuses = await messagingService.listStatusSnapshots();
    checks.whatsapp = {
      total_sessions: statuses.length,
      connected_sessions: statuses.filter((status) => status.status === 'CONNECTED').length
    };
  } catch {
    checks.whatsapp = {
      total_sessions: 0,
      connected_sessions: 0
    };
  }

  try {
    checks.queues = await getQueueHealth();
    checks.whatsapp_commands = await getWhatsappCommandWorkerHealth();
  } catch {
    checks.queues = {
      enabled: env.queue.enabled,
      redis_status: env.queue.enabled ? 'error' : 'disabled',
      command_queue: 'unknown',
      inbound_queue: 'unknown',
      outbound_queue: 'unknown'
    };
    checks.whatsapp_commands = {
      via_queue: env.whatsapp.commandsViaQueue,
      queue_status: env.whatsapp.commandsViaQueue ? 'unavailable' : 'disabled'
    };
  }

  const commandsDegraded = checks.whatsapp_commands.via_queue &&
    !['disabled', 'ready'].includes(checks.whatsapp_commands.queue_status);
  const status = checks.database === 'connected' && !isQueueHealthDegraded(checks.queues) && !commandsDegraded ? 'ok' : 'degraded';

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    service: 'ventas-ai-saas-api',
    environment: env.nodeEnv,
    uptime_seconds: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    checks
  });
}
