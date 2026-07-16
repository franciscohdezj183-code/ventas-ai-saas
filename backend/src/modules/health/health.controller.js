import { checkDatabaseConnection } from '../../config/database.js';
import { env } from '../../config/env.js';
import { messagingService } from '../../messaging/messaging.service.js';
import { getQueueHealth, isQueueHealthDegraded } from '../../queues/queue-health.service.js';

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
  } catch {
    checks.queues = {
      enabled: env.queue.enabled,
      redis_status: env.queue.enabled ? 'error' : 'disabled',
      command_queue: 'unknown',
      inbound_queue: 'unknown',
      outbound_queue: 'unknown'
    };
  }

  const status = checks.database === 'connected' && !isQueueHealthDegraded(checks.queues) ? 'ok' : 'degraded';

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
