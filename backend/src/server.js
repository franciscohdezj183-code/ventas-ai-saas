import { env } from './config/env.js';
import { app } from './app.js';
import http from 'node:http';
import { Server } from 'socket.io';
import { closeDatabase } from './config/database.js';
import {
  restoreSessionsOnBoot,
  shutdownWhatsappSessions
} from './whatsapp/whatsapp-session.manager.js';
import { isExpectedWhatsappLateRejection } from './whatsapp/whatsapp-startup.coordinator.js';
import { initializeWhatsappSocket } from './whatsapp/whatsapp-socket.gateway.js';
import {
  startHumanHandoffExpirationJob,
  stopHumanHandoffExpirationJob
} from './bot/humanHandoffManager.js';
import { logger } from './utils/logger.js';

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin && env.nodeEnv !== 'production') {
        callback(null, true);
        return;
      }

      if (env.cors.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});

initializeWhatsappSocket(io);

server.listen(env.port, () => {
  logger.info('server_started', {
    port: env.port,
    environment: env.nodeEnv
  });
});

if (process.env.HANDOFF_JOB_ENABLED !== 'false') {
  startHumanHandoffExpirationJob();
}

restoreSessionsOnBoot()
  .then((sessions) => {
    logger.info('whatsapp_restore_sessions_completed', {
      restored: sessions.length
    });
  })
  .catch((error) => {
    logger.error('whatsapp_restore_sessions_boot_error', { error });
  });

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
      await shutdownWhatsappSessions();
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
  if (isExpectedWhatsappLateRejection(error)) {
    logger.info('whatsapp_late_rejection_ignored', {
      reason: error?.message ?? String(error ?? 'unknown')
    });
    return;
  }

  logger.error('unhandled_rejection', { error });
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught_exception', { error });
  shutdown('uncaughtException');
});
