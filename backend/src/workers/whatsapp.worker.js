import { closeDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { isExpectedWhatsappLateRejection } from '../whatsapp/whatsapp-startup.coordinator.js';

// Legacy/deprecated worker.
// WhatsApp sessions are now owned by backend/src/whatsapp/whatsapp-session.manager.js
// inside the API process. Keep this file only so old npm scripts do not create
// duplicate whatsapp-web.js clients or background jobs.

let shuttingDown = false;

async function startWorker() {
  logger.info('whatsapp_worker_deprecated_noop_started');
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('whatsapp_worker_shutdown_started', { signal });

  try {
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
  if (isExpectedWhatsappLateRejection(error)) {
    logger.info('whatsapp_worker_late_rejection_ignored', {
      reason: error?.message ?? String(error ?? 'unknown')
    });
    return;
  }

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
