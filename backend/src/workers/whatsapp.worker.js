import { closeDatabase, query } from '../config/database.js';
import {
  getWhatsappStatus,
  shutdownWhatsappSessions,
  startWhatsappSession
} from '../modules/whatsapp/whatsapp.service.js';
import {
  startHumanHandoffExpirationJob,
  stopHumanHandoffExpirationJob
} from '../bot/humanHandoffManager.js';
import { logger } from '../utils/logger.js';

const DEFAULT_MONITOR_INTERVAL_MS = 60000;
const DEFAULT_START_STAGGER_MS = 3000;
let monitorTimer = null;
let shuttingDown = false;

function numberEnv(name, fallback) {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function listWhatsappEnabledCompanies() {
  const [rows] = await query(
    `SELECT e.id, e.nombre
     FROM empresas e
     LEFT JOIN configuracion_empresas ce ON ce.empresa_id = e.id
     WHERE e.activo = 1
       AND e.estado = 'ACTIVA'
       AND COALESCE(ce.activo_whatsapp, 1) = 1
     ORDER BY e.id ASC`
  );

  return rows;
}

async function ensureCompanySession(company) {
  const status = getWhatsappStatus(company.id);

  if (['INITIALIZING', 'QR_READY', 'AUTHENTICATED', 'CONNECTED', 'RECONNECTING'].includes(status.status)) {
    return status;
  }

  try {
    const nextStatus = await startWhatsappSession(company.id);
    logger.info('whatsapp_worker_session_started', {
      empresaId: company.id,
      empresa: company.nombre,
      status: nextStatus.status
    });
    return nextStatus;
  } catch (error) {
    logger.error('whatsapp_worker_session_start_error', {
      empresaId: company.id,
      empresa: company.nombre,
      error
    });
    return getWhatsappStatus(company.id);
  }
}

async function monitorWhatsappCompanies() {
  const companies = await listWhatsappEnabledCompanies();
  const staggerMs = numberEnv('WHATSAPP_WORKER_START_STAGGER_MS', DEFAULT_START_STAGGER_MS);
  const summary = {
    total: companies.length,
    connected: 0,
    qrReady: 0,
    reconnecting: 0,
    errors: 0
  };

  for (const company of companies) {
    const status = await ensureCompanySession(company);

    if (status.status === 'CONNECTED') summary.connected += 1;
    if (status.status === 'QR_READY') summary.qrReady += 1;
    if (status.status === 'RECONNECTING') summary.reconnecting += 1;
    if (['ERROR', 'AUTH_FAILED'].includes(status.status)) summary.errors += 1;

    await wait(staggerMs);
  }

  logger.info('whatsapp_worker_monitor_completed', summary);
}

async function startWorker() {
  logger.info('whatsapp_worker_started');
  if (process.env.HANDOFF_JOB_ENABLED !== 'false') {
    startHumanHandoffExpirationJob();
  }
  await monitorWhatsappCompanies();

  monitorTimer = setInterval(() => {
    monitorWhatsappCompanies().catch((error) => {
      logger.error('whatsapp_worker_monitor_error', { error });
    });
  }, numberEnv('WHATSAPP_WORKER_MONITOR_INTERVAL_MS', DEFAULT_MONITOR_INTERVAL_MS));
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('whatsapp_worker_shutdown_started', { signal });

  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }

  try {
    if (process.env.HANDOFF_JOB_ENABLED !== 'false') {
      stopHumanHandoffExpirationJob();
    }
    await shutdownWhatsappSessions();
    await closeDatabase();
    logger.info('whatsapp_worker_shutdown_completed');
    process.exit(0);
  } catch (error) {
    logger.error('whatsapp_worker_shutdown_error', { error });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  logger.error('whatsapp_worker_unhandled_rejection', { error });
});
process.on('uncaughtException', (error) => {
  logger.error('whatsapp_worker_uncaught_exception', { error });
  shutdown('uncaughtException');
});

startWorker().catch((error) => {
  logger.error('whatsapp_worker_start_error', { error });
  process.exit(1);
});
