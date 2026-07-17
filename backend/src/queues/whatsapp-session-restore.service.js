import { env } from '../config/env.js';
import { messagingService } from '../messaging/messaging.service.js';
import { companyProviderService } from '../messaging/company-provider.service.js';
import { whatsappSessionLeaseService } from './whatsapp-session-lease.service.js';
import { logger } from '../utils/logger.js';

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function createWhatsappSessionRestoreService({
  config = env,
  service = messagingService,
  companyProvider = companyProviderService,
  sessionLease = whatsappSessionLeaseService,
  loggerInstance = logger,
  delayFn = wait
} = {}) {
  let cancelled = false;
  let restoring = 0;

  async function restoreOne(sessionConfig) {
    if (cancelled) {
      return { skipped: true };
    }

    await delayFn(config.whatsapp.restore.delayMs);
    await sessionLease.acquire(sessionConfig.empresaId);
    loggerInstance.info('whatsapp_restore_session_started', {
      empresaId: sessionConfig.empresaId,
      provider: sessionConfig.effectiveProvider
    });
    return service.startSession(sessionConfig.empresaId);
  }

  return {
    cancel() {
      cancelled = true;
    },

    get restoringSessions() {
      return restoring;
    },

    async restoreDesiredSessions() {
      cancelled = false;
      const sessions = await companyProvider.listRestorableSessions();
      let restored = 0;
      let failed = 0;
      let skipped = 0;
      let cursor = 0;

      loggerInstance.info('whatsapp_restore_started', {
        total: sessions.length,
        concurrency: config.whatsapp.restore.concurrency
      });

      async function worker() {
        while (!cancelled && cursor < sessions.length) {
          const sessionConfig = sessions[cursor];
          cursor += 1;
          restoring += 1;

          try {
            const result = await restoreOne(sessionConfig);

            if (result?.skipped) {
              skipped += 1;
            } else {
              restored += 1;
            }
          } catch (error) {
            failed += 1;
            loggerInstance.error('whatsapp_restore_session_failed', {
              empresaId: sessionConfig.empresaId,
              provider: sessionConfig.effectiveProvider,
              error: {
                name: error?.name,
                message: error?.message,
                code: error?.code
              }
            });
          } finally {
            restoring -= 1;
          }
        }
      }

      await Promise.all(Array.from(
        { length: Math.min(config.whatsapp.restore.concurrency, sessions.length) },
        () => worker()
      ));

      loggerInstance.info('whatsapp_restore_completed', {
        total: sessions.length,
        restored,
        failed,
        skipped,
        cancelled
      });

      return { total: sessions.length, restored, failed, skipped, cancelled };
    }
  };
}

export const whatsappSessionRestoreService = createWhatsappSessionRestoreService();
