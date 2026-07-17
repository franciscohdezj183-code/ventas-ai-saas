import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { getQueueRegistry } from './queue-registry.js';
import { createRedisLease } from '../redis/redis-lease.js';
import { createHttpError } from '../utils/http-error.js';
import { logger } from '../utils/logger.js';

function normalizeEmpresaId(empresaId) {
  const id = Number(empresaId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return id;
}

export function createWhatsappSessionLeaseService({
  config = env,
  getRegistry = getQueueRegistry,
  tokenPrefix = `session-owner-${process.pid}`,
  loggerInstance = logger,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
} = {}) {
  const leases = new Map();
  let onLost = async () => {};

  function createLease(empresaId) {
    const registry = getRegistry();

    if (!registry?.redisClient) {
      const error = createHttpError(503, 'Redis no esta disponible para el lease de sesion');
      error.code = 'WHATSAPP_SESSION_LEASE_UNAVAILABLE';
      throw error;
    }

    return createRedisLease({
      redisClient: registry.redisClient,
      queueConfig: config.queue,
      key: `whatsapp:session-owner:${empresaId}`,
      ttlMs: config.whatsapp.sessionLease.ttlMs,
      token: `${tokenPrefix}:${empresaId}:${randomUUID()}`
    });
  }

  async function closeOwnedSession(empresaId, reason) {
    loggerInstance.warn('whatsapp_session_lease_lost', { empresaId, reason });
    await onLost(empresaId, reason);
  }

  return {
    onLost(handler) {
      onLost = handler;
    },

    owns(empresaId) {
      return leases.has(Number(empresaId));
    },

    async acquire(empresaId) {
      const id = normalizeEmpresaId(empresaId);

      if (leases.has(id)) {
        return leases.get(id);
      }

      const lease = createLease(id);
      const acquired = await lease.acquire();

      if (!acquired) {
        const error = createHttpError(409, 'Otra instancia posee la sesion de WhatsApp');
        error.code = 'WHATSAPP_SESSION_LEASE_HELD';
        throw error;
      }

      const timer = setIntervalFn(() => {
        lease.renew().then((renewed) => {
          if (!renewed) {
            clearIntervalFn(timer);
            leases.delete(id);
            closeOwnedSession(id, 'renew_failed');
          }
        }).catch(() => {
          clearIntervalFn(timer);
          leases.delete(id);
          closeOwnedSession(id, 'redis_error');
        });
      }, config.whatsapp.sessionLease.renewMs);
      timer.unref?.();
      leases.set(id, { lease, timer });
      loggerInstance.info('whatsapp_session_lease_acquired', { empresaId: id });
      return leases.get(id);
    },

    async release(empresaId) {
      const id = normalizeEmpresaId(empresaId);
      const entry = leases.get(id);

      if (!entry) {
        return false;
      }

      clearIntervalFn(entry.timer);
      leases.delete(id);
      const released = await entry.lease.release();
      loggerInstance.info('whatsapp_session_lease_released', { empresaId: id, released });
      return released;
    },

    async releaseAll() {
      await Promise.allSettled(Array.from(leases.keys()).map((empresaId) => this.release(empresaId)));
    },

    activeEmpresaIds() {
      return Array.from(leases.keys());
    }
  };
}

export const whatsappSessionLeaseService = createWhatsappSessionLeaseService();
