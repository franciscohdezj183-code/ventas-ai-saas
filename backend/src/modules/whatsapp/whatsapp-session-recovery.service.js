import { env } from '../../config/env.js';
import { query } from '../../config/database.js';
import { createHttpError } from '../../utils/http-error.js';
import { logger } from '../../utils/logger.js';

export const RECOVERY_STATUSES = ['IDLE', 'SCHEDULED', 'CONNECTING', 'CONNECTED', 'COOLDOWN', 'BLOCKED'];

function normalizeEmpresaId(empresaId) {
  const id = Number(empresaId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return id;
}

function normalizeStatus(status) {
  const value = String(status ?? '').trim().toUpperCase();

  if (!RECOVERY_STATUSES.includes(value)) {
    throw createHttpError(400, `Estado de recuperacion invalido: ${value || 'vacio'}`);
  }

  return value;
}

function normalizeErrorCode(error, fallback = 'UNKNOWN') {
  return String(error?.code ?? error?.statusCode ?? error?.status ?? error?.name ?? fallback).slice(0, 120);
}

function toMysqlDate(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function fromRow(row) {
  if (!row) {
    return null;
  }

  return {
    empresaId: Number(row.empresa_id),
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    recoveryStatus: row.recovery_status,
    nextRetryAt: row.next_retry_at,
    lastConnectedAt: row.last_connected_at,
    lastDisconnectedAt: row.last_disconnected_at,
    lastErrorCode: row.last_error_code ?? null,
    blockedReason: row.blocked_reason ?? null,
    reconnectAttemptsTotal: Number(row.reconnect_attempts_total ?? 0),
    updatedAt: row.updated_at
  };
}

export function calculateReconnectDelay({
  failures,
  baseDelayMs,
  maxDelayMs,
  jitterMs,
  random = Math.random
}) {
  const exponent = Math.max(0, Number(failures ?? 1) - 1);
  const rawDelay = Number(baseDelayMs) * (2 ** exponent);
  const cappedDelay = Math.min(Number(maxDelayMs), rawDelay);
  const jitter = Number(jitterMs) > 0 ? Math.floor(random() * (Number(jitterMs) + 1)) : 0;
  return cappedDelay + jitter;
}

export function createWhatsappSessionRecoveryRepository({ queryFn = query } = {}) {
  return {
    async get(empresaId) {
      const [rows] = await queryFn(
        `SELECT empresa_id, consecutive_failures, recovery_status, next_retry_at,
                last_connected_at, last_disconnected_at, last_error_code,
                blocked_reason, reconnect_attempts_total, updated_at
           FROM whatsapp_session_recovery
          WHERE empresa_id = ?
          LIMIT 1`,
        [normalizeEmpresaId(empresaId)]
      );
      return fromRow(rows[0]);
    },

    async upsertStatus({
      empresaId,
      status,
      consecutiveFailures = null,
      nextRetryAt = null,
      lastConnectedAt = null,
      lastDisconnectedAt = null,
      lastErrorCode = null,
      blockedReason = null,
      incrementAttempts = false
    }) {
      const id = normalizeEmpresaId(empresaId);
      const recoveryStatus = normalizeStatus(status);
      await queryFn(
        `INSERT INTO whatsapp_session_recovery
          (empresa_id, consecutive_failures, recovery_status, next_retry_at,
           last_connected_at, last_disconnected_at, last_error_code, blocked_reason,
           reconnect_attempts_total)
         VALUES (?, COALESCE(?, 0), ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           consecutive_failures = IF(? IS NULL, consecutive_failures, ?),
           recovery_status = VALUES(recovery_status),
           next_retry_at = VALUES(next_retry_at),
           last_connected_at = COALESCE(VALUES(last_connected_at), last_connected_at),
           last_disconnected_at = COALESCE(VALUES(last_disconnected_at), last_disconnected_at),
           last_error_code = VALUES(last_error_code),
           blocked_reason = VALUES(blocked_reason),
           reconnect_attempts_total = reconnect_attempts_total + VALUES(reconnect_attempts_total),
           updated_at = CURRENT_TIMESTAMP`,
        [
          id,
          consecutiveFailures,
          recoveryStatus,
          toMysqlDate(nextRetryAt),
          toMysqlDate(lastConnectedAt),
          toMysqlDate(lastDisconnectedAt),
          lastErrorCode,
          blockedReason,
          incrementAttempts ? 1 : 0,
          consecutiveFailures,
          consecutiveFailures
        ]
      );
      return this.get(id);
    },

    async incrementFailure({ empresaId, status, nextRetryAt, lastErrorCode, blockedReason, now }) {
      const id = normalizeEmpresaId(empresaId);
      const recoveryStatus = normalizeStatus(status);
      await queryFn(
        `INSERT INTO whatsapp_session_recovery
          (empresa_id, consecutive_failures, recovery_status, next_retry_at,
           last_disconnected_at, last_error_code, blocked_reason, reconnect_attempts_total)
         VALUES (?, 1, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           consecutive_failures = consecutive_failures + 1,
           recovery_status = VALUES(recovery_status),
           next_retry_at = VALUES(next_retry_at),
           last_disconnected_at = VALUES(last_disconnected_at),
           last_error_code = VALUES(last_error_code),
           blocked_reason = VALUES(blocked_reason),
           reconnect_attempts_total = reconnect_attempts_total + 1,
           updated_at = CURRENT_TIMESTAMP`,
        [id, recoveryStatus, toMysqlDate(nextRetryAt), toMysqlDate(now), lastErrorCode, blockedReason]
      );
      return this.get(id);
    },

    async resetConnected({ empresaId, now }) {
      return this.upsertStatus({
        empresaId,
        status: 'CONNECTED',
        consecutiveFailures: 0,
        nextRetryAt: null,
        lastConnectedAt: now,
        lastErrorCode: null,
        blockedReason: null
      });
    },

    async aggregate() {
      const [rows] = await queryFn(
        `SELECT recovery_status, COUNT(*) AS count, SUM(reconnect_attempts_total) AS attempts
           FROM whatsapp_session_recovery
          GROUP BY recovery_status`
      );
      return rows;
    },

    async listByEmpresa(empresaId) {
      return this.get(empresaId);
    }
  };
}

export function createWhatsappSessionRecoveryService({
  config = env,
  repository = createWhatsappSessionRecoveryRepository(),
  loggerInstance = logger,
  now = () => Date.now(),
  random = Math.random
} = {}) {
  const lastLogAt = new Map();

  function throttled(level, message, meta = {}) {
    const key = `${message}:${meta.empresaId ?? 'global'}:${meta.errorCode ?? meta.status ?? ''}`;
    const currentTime = now();
    const last = lastLogAt.get(key);

    if (last !== undefined && currentTime - last < 30000) {
      return;
    }

    lastLogAt.set(key, currentTime);
    loggerInstance[level](message, meta);
  }

  async function recordRetryableFailure({ empresaId, error, classification = 'retryable' }) {
    const existing = await repository.get(empresaId);
    const nextFailures = Number(existing?.consecutiveFailures ?? 0) + 1;
    const errorCode = normalizeErrorCode(error, classification);
    const maxAttempts = config.whatsapp.baileys.reconnectMaxAttempts;

    if (nextFailures > maxAttempts) {
      const nextRetryAt = now() + config.whatsapp.reconnect.cooldownMs;
      const row = await repository.incrementFailure({
        empresaId,
        status: 'COOLDOWN',
        nextRetryAt,
        lastErrorCode: errorCode,
        blockedReason: 'max_reconnect_attempts',
        now: now()
      });
      throttled('warn', 'whatsapp_recovery_cooldown', {
        empresaId: normalizeEmpresaId(empresaId),
        failures: row.consecutiveFailures,
        nextRetryAt: new Date(nextRetryAt).toISOString(),
        errorCode
      });
      return { ...row, delayMs: config.whatsapp.reconnect.cooldownMs, shouldRetry: false, cooldown: true };
    }

    const delayMs = calculateReconnectDelay({
      failures: nextFailures,
      baseDelayMs: config.whatsapp.baileys.reconnectBaseDelayMs,
      maxDelayMs: config.whatsapp.reconnect.maxDelayMs,
      jitterMs: config.whatsapp.reconnect.jitterMs,
      random
    });
    const nextRetryAt = now() + delayMs;
    const row = await repository.incrementFailure({
      empresaId,
      status: 'SCHEDULED',
      nextRetryAt,
      lastErrorCode: errorCode,
      blockedReason: null,
      now: now()
    });
    throttled('warn', 'whatsapp_recovery_retryable_failure', {
      empresaId: normalizeEmpresaId(empresaId),
      failures: row.consecutiveFailures,
      delayMs,
      errorCode
    });
    return { ...row, delayMs, shouldRetry: true, cooldown: false };
  }

  return {
    async getStatus(empresaId) {
      return repository.get(empresaId);
    },

    async schedule({ empresaId, delayMs = 0, reason = 'restore' }) {
      const nextRetryAt = now() + Number(delayMs);
      const row = await repository.upsertStatus({
        empresaId,
        status: 'SCHEDULED',
        nextRetryAt,
        lastErrorCode: null,
        blockedReason: null
      });
      throttled('info', 'whatsapp_recovery_scheduled', {
        empresaId: normalizeEmpresaId(empresaId),
        delayMs: Number(delayMs),
        reason
      });
      return row;
    },

    async started({ empresaId }) {
      const row = await repository.upsertStatus({
        empresaId,
        status: 'CONNECTING',
        nextRetryAt: null,
        blockedReason: null
      });
      throttled('info', 'whatsapp_recovery_started', { empresaId: normalizeEmpresaId(empresaId) });
      return row;
    },

    async connected({ empresaId }) {
      const row = await repository.resetConnected({ empresaId, now: now() });
      throttled('info', 'whatsapp_recovery_connected', { empresaId: normalizeEmpresaId(empresaId) });
      return row;
    },

    async disconnected({ empresaId, error }) {
      return repository.upsertStatus({
        empresaId,
        status: 'IDLE',
        lastDisconnectedAt: now(),
        lastErrorCode: error ? normalizeErrorCode(error) : null
      });
    },

    async retryableFailure(args) {
      return recordRetryableFailure(args);
    },

    async blocked({ empresaId, reason, error }) {
      const errorCode = normalizeErrorCode(error, reason);
      const row = await repository.upsertStatus({
        empresaId,
        status: 'BLOCKED',
        nextRetryAt: null,
        lastDisconnectedAt: now(),
        lastErrorCode: errorCode,
        blockedReason: String(reason ?? 'auth_failure').slice(0, 255)
      });
      throttled('warn', 'whatsapp_recovery_blocked', {
        empresaId: normalizeEmpresaId(empresaId),
        reason: row.blockedReason,
        errorCode
      });
      return row;
    },

    async cancel({ empresaId, reason = 'manual_cancel' }) {
      const row = await repository.upsertStatus({
        empresaId,
        status: 'IDLE',
        nextRetryAt: null,
        consecutiveFailures: 0,
        blockedReason: null,
        lastErrorCode: null
      });
      throttled('info', 'whatsapp_recovery_cancelled', {
        empresaId: normalizeEmpresaId(empresaId),
        reason
      });
      return row;
    },

    async retry({ empresaId }) {
      return this.schedule({ empresaId, delayMs: 0, reason: 'admin_retry' });
    },

    async aggregateHealth() {
      const aggregateRows = await repository.aggregate();
      const health = {
        recovery_scheduled: 0,
        recovery_connecting: 0,
        recovery_cooldown: 0,
        recovery_blocked: 0,
        reconnect_attempts_total: 0
      };

      for (const row of aggregateRows) {
        const count = Number(row.count ?? 0);
        const attempts = Number(row.attempts ?? 0);
        health.reconnect_attempts_total += attempts;

        if (row.recovery_status === 'SCHEDULED') health.recovery_scheduled = count;
        if (row.recovery_status === 'CONNECTING') health.recovery_connecting = count;
        if (row.recovery_status === 'COOLDOWN') health.recovery_cooldown = count;
        if (row.recovery_status === 'BLOCKED') health.recovery_blocked = count;
      }

      return health;
    }
  };
}

export const whatsappSessionRecoveryService = createWhatsappSessionRecoveryService();
