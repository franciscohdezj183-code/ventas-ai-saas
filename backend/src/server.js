import { env } from './config/env.js';
import { app } from './app.js';
import { closeDatabase } from './config/database.js';
import { messagingService } from './messaging/messaging.service.js';
import {
  startHumanHandoffExpirationJob,
  stopHumanHandoffExpirationJob
} from './bot/humanHandoffManager.js';
import { logger } from './utils/logger.js';

const server = app.listen(env.port, () => {
  logger.info('server_started', {
    port: env.port,
    environment: env.nodeEnv
  });
});

if (process.env.HANDOFF_JOB_ENABLED !== 'false') {
  startHumanHandoffExpirationJob();
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('server_shutdown_started', { signal });

  server.close(async (error) => {
    if (error) {
      logger.error('server_close_error', { error });
      process.exit(1);
      return;
    }

    try {
      if (process.env.HANDOFF_JOB_ENABLED !== 'false') {
        stopHumanHandoffExpirationJob();
      }
      await messagingService.shutdown();
      await closeDatabase();
      logger.info('server_shutdown_completed');
      process.exit(0);
    } catch (shutdownError) {
      logger.error('server_shutdown_error', { error: shutdownError });
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('server_shutdown_timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (error) => {
  logger.error('unhandled_rejection', { error });
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught_exception', { error });
  shutdown('uncaughtException');
});
