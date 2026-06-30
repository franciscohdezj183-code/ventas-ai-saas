import { closeDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import {
  restoreSessionsOnBoot,
  shutdownWhatsappSessions
} from '../whatsapp/whatsapp-session.manager.js';

let shuttingDown = false;

async function startWorker() {
  logger.info('whatsapp_worker_started');
  await restoreSessionsOnBoot();
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('whatsapp_worker_shutdown_started', { signal });

  try {
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
