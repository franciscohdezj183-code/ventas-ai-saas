import { checkDatabaseConnection } from '../../config/database.js';
import { env } from '../../config/env.js';
import { getWhatsappHealthSummary } from '../whatsapp/whatsapp.service.js';

export async function getHealth(req, res, next) {
  const checks = {
    database: 'unknown',
    whatsapp: {
      total_sessions: 0,
      connected_sessions: 0,
      error_sessions: 0,
      active_sessions: 0
    }
  };

  try {
    await checkDatabaseConnection();
    checks.database = 'connected';
  } catch (error) {
    checks.database = 'disconnected';
  }

  try {
    checks.whatsapp = await getWhatsappHealthSummary();
  } catch {
    checks.whatsapp = {
      total_sessions: 0,
      connected_sessions: 0,
      error_sessions: 0,
      active_sessions: 0
    };
  }

  const status = checks.database === 'connected' ? 'ok' : 'degraded';

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
