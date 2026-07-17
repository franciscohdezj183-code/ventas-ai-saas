import { env } from '../config/env.js';
import { messagingService } from '../messaging/messaging.service.js';
import { companyProviderService } from '../messaging/company-provider.service.js';
import { whatsappSessionLeaseService } from './whatsapp-session-lease.service.js';
import { logger } from '../utils/logger.js';
import { getQueueRegistry } from './queue-registry.js';
import { whatsappSessionRecoveryService } from '../modules/whatsapp/whatsapp-session-recovery.service.js';

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
  recoveryStore = whatsappSessionRecoveryService,
  getRegistry = getQueueRegistry,
  loggerInstance = logger,
  delayFn = wait,
  random = Math.random,
  isLeader = () => true
} = {}) {
  let cancelled = false;
  let restoring = 0;
  let pending = 0;
  const restoreConfig = () => ({
    concurrency: config.whatsapp.restore.concurrency,
    delayMs: config.whatsapp.restore.delayMs,
    spreadMs: config.whatsapp.restore.spreadMs ?? 0
  });
  const reconnectConfig = () => ({
    maxConcurrency: config.whatsapp.reconnect?.maxConcurrency ?? config.whatsapp.restore.concurrency
  });

  async function restoreOne(sessionConfig, delayMs) {
    if (cancelled) {
      return { skipped: true };
    }

    await recoveryStore.schedule({ empresaId: sessionConfig.empresaId, delayMs, reason: 'startup_restore' });
    await delayFn(delayMs);

    if (cancelled || !isLeader()) {
      return { skipped: true };
    }

    const registry = getRegistry();

    if (config.queue?.enabled && registry?.status !== 'ready') {
      const error = new Error('Redis no esta listo para restaurar sesiones WhatsApp');
      error.code = 'WHATSAPP_REDIS_NOT_READY';
      throw error;
    }

    await sessionLease.acquire(sessionConfig.empresaId);
    await recoveryStore.started({ empresaId: sessionConfig.empresaId });
    loggerInstance.info('whatsapp_restore_session_started', {
      empresaId: sessionConfig.empresaId,
      provider: sessionConfig.effectiveProvider
    });
    const result = await service.startSession(sessionConfig.empresaId);
    return result;
  }

  return {
    cancel() {
      cancelled = true;
    },

    get restoringSessions() {
      return restoring;
    },

    get pendingRestores() {
      return pending;
    },

    async restoreDesiredSessions() {
      cancelled = false;
      if (!isLeader()) {
        return { total: 0, restored: 0, failed: 0, skipped: 0, cancelled: false, maxObservedConcurrency: 0 };
      }

      const sessions = (await companyProvider.listRestorableSessions())
        .sort((a, b) => Number(a.empresaId) - Number(b.empresaId));
      let restored = 0;
      let failed = 0;
      let skipped = 0;
      let cursor = 0;
      let maxObservedConcurrency = 0;
      pending = sessions.length;

      loggerInstance.info('whatsapp_restore_started', {
        total: sessions.length,
        concurrency: Math.min(restoreConfig().concurrency, reconnectConfig().maxConcurrency),
        spreadMs: restoreConfig().spreadMs
      });

      async function worker() {
        while (!cancelled && cursor < sessions.length) {
          const sessionConfig = sessions[cursor];
          cursor += 1;
          pending -= 1;
          restoring += 1;
          maxObservedConcurrency = Math.max(maxObservedConcurrency, restoring);

          try {
            const restore = restoreConfig();
            const spreadDelay = restore.delayMs +
              (restore.spreadMs > 0 ? Math.floor(random() * (restore.spreadMs + 1)) : 0);
            const result = await restoreOne(sessionConfig, spreadDelay);

            if (result?.skipped) {
              skipped += 1;
            } else {
              restored += 1;
              await recoveryStore.connected({ empresaId: sessionConfig.empresaId }).catch(() => {});
            }
          } catch (error) {
            failed += 1;
            await recoveryStore.retryableFailure({
              empresaId: sessionConfig.empresaId,
              error,
              classification: 'restore'
            }).catch(() => {});
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
        { length: Math.min(restoreConfig().concurrency, reconnectConfig().maxConcurrency, sessions.length) },
        () => worker()
      ));
      pending = 0;

      loggerInstance.info('whatsapp_restore_completed', {
        total: sessions.length,
        restored,
        failed,
        skipped,
        cancelled,
        maxObservedConcurrency
      });

      return { total: sessions.length, restored, failed, skipped, cancelled, maxObservedConcurrency };
    }
  };
}

export const whatsappSessionRestoreService = createWhatsappSessionRestoreService();
