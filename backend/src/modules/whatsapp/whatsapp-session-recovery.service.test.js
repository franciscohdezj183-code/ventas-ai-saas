import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateReconnectDelay,
  createWhatsappSessionRecoveryService
} from './whatsapp-session-recovery.service.js';

function createMemoryRepository() {
  const rows = new Map();

  function current(empresaId) {
    return rows.get(Number(empresaId)) ?? {
      empresaId: Number(empresaId),
      consecutiveFailures: 0,
      recoveryStatus: 'IDLE',
      nextRetryAt: null,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastErrorCode: null,
      blockedReason: null,
      reconnectAttemptsTotal: 0
    };
  }

  function save(empresaId, patch) {
    const next = { ...current(empresaId), ...patch };
    rows.set(Number(empresaId), next);
    return next;
  }

  return {
    rows,
    async get(empresaId) {
      return rows.get(Number(empresaId)) ?? null;
    },
    async upsertStatus({ empresaId, status, consecutiveFailures = null, nextRetryAt = null, lastConnectedAt = null, lastDisconnectedAt = null, lastErrorCode = null, blockedReason = null }) {
      return save(empresaId, {
        recoveryStatus: status,
        consecutiveFailures: consecutiveFailures ?? current(empresaId).consecutiveFailures,
        nextRetryAt,
        lastConnectedAt: lastConnectedAt ?? current(empresaId).lastConnectedAt,
        lastDisconnectedAt: lastDisconnectedAt ?? current(empresaId).lastDisconnectedAt,
        lastErrorCode,
        blockedReason
      });
    },
    async incrementFailure({ empresaId, status, nextRetryAt, lastErrorCode, blockedReason, now }) {
      const existing = current(empresaId);
      return save(empresaId, {
        recoveryStatus: status,
        consecutiveFailures: existing.consecutiveFailures + 1,
        nextRetryAt,
        lastDisconnectedAt: now,
        lastErrorCode,
        blockedReason,
        reconnectAttemptsTotal: existing.reconnectAttemptsTotal + 1
      });
    },
    async resetConnected({ empresaId, now }) {
      return save(empresaId, {
        recoveryStatus: 'CONNECTED',
        consecutiveFailures: 0,
        nextRetryAt: null,
        lastConnectedAt: now,
        lastErrorCode: null,
        blockedReason: null
      });
    },
    async aggregate() {
      const counts = new Map();

      for (const row of rows.values()) {
        const entry = counts.get(row.recoveryStatus) ?? { recovery_status: row.recoveryStatus, count: 0, attempts: 0 };
        entry.count += 1;
        entry.attempts += row.reconnectAttemptsTotal;
        counts.set(row.recoveryStatus, entry);
      }

      return Array.from(counts.values());
    }
  };
}

function createService(options = {}) {
  const repository = options.repository ?? createMemoryRepository();
  const logs = [];
  const service = createWhatsappSessionRecoveryService({
    config: {
      whatsapp: {
        baileys: { reconnectBaseDelayMs: 1000, reconnectMaxAttempts: 2 },
        reconnect: { maxDelayMs: 10000, jitterMs: 100, cooldownMs: 60000 }
      }
    },
    repository,
    loggerInstance: {
      info(message, meta) { logs.push({ level: 'info', message, meta }); },
      warn(message, meta) { logs.push({ level: 'warn', message, meta }); },
      error(message, meta) { logs.push({ level: 'error', message, meta }); }
    },
    now: options.now ?? (() => 100000),
    random: options.random ?? (() => 0.5)
  });
  return { logs, repository, service };
}

test('retryable failure uses exponential backoff with jitter and then cooldown', async () => {
  const { service } = createService({ random: () => 0.25 });

  const first = await service.retryableFailure({ empresaId: 5, error: { code: 'ECONNRESET' } });
  const second = await service.retryableFailure({ empresaId: 5, error: { code: 'ETIMEDOUT' } });
  const cooldown = await service.retryableFailure({ empresaId: 5, error: { code: 'ECONNREFUSED' } });

  assert.equal(first.delayMs, 1025);
  assert.equal(second.delayMs, 2025);
  assert.equal(cooldown.cooldown, true);
  assert.equal(cooldown.shouldRetry, false);
  assert.equal(cooldown.recoveryStatus, 'COOLDOWN');
});

test('stable connection resets consecutive failures', async () => {
  const { service } = createService();

  await service.retryableFailure({ empresaId: 5, error: { code: 'ETEMP' } });
  await service.connected({ empresaId: 5 });

  const row = await service.getStatus(5);
  assert.equal(row.recoveryStatus, 'CONNECTED');
  assert.equal(row.consecutiveFailures, 0);
});

test('terminal failure is blocked until explicit retry', async () => {
  const { service } = createService();

  await service.blocked({ empresaId: 5, reason: 'logged_out', error: { statusCode: 401 } });
  const blocked = await service.getStatus(5);
  await service.retry({ empresaId: 5 });
  const scheduled = await service.getStatus(5);

  assert.equal(blocked.recoveryStatus, 'BLOCKED');
  assert.equal(blocked.blockedReason, 'logged_out');
  assert.equal(scheduled.recoveryStatus, 'SCHEDULED');
  assert.equal(scheduled.blockedReason, null);
});

test('aggregate health does not expose secrets', async () => {
  const { service } = createService();

  await service.schedule({ empresaId: 5, delayMs: 1 });
  await service.started({ empresaId: 6 });
  await service.blocked({ empresaId: 7, reason: 'bad_session' });

  assert.deepEqual(await service.aggregateHealth(), {
    recovery_scheduled: 1,
    recovery_connecting: 1,
    recovery_cooldown: 0,
    recovery_blocked: 1,
    reconnect_attempts_total: 0
  });
});

test('calculateReconnectDelay caps exponential backoff', () => {
  assert.equal(calculateReconnectDelay({
    failures: 10,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    jitterMs: 0
  }), 5000);
});
