import { promises as fs } from 'node:fs';
import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { createWhatsappClient, getCompanyLocalAuthPath } from './whatsapp-client.factory.js';
import {
  registerWhatsappClientEvents,
  WHATSAPP_EVENT_CONTROL
} from './whatsapp-events.handler.js';
import {
  emitWhatsappError,
  emitWhatsappStatus
} from './whatsapp-socket.gateway.js';
import {
  clearQr,
  getPublicSession,
  getSession,
  listPublicSessions,
  markStarted,
  removeSession,
  resetStoreForTests,
  setClient,
  setError,
  setStatus,
  upsertSession
} from './whatsapp-session.store.js';
import {
  ACTIVE_SESSION_STATUSES,
  WHATSAPP_SESSION_STATUSES,
  normalizeCompanyId,
  normalizePhoneForWhatsapp
} from './whatsapp.types.js';
import {
  getStoredWhatsappSessionStatus,
  listStoredWhatsappSessionStatuses,
  saveWhatsappSessionStatus
} from './whatsapp-session-status.repository.js';
import {
  backoffWithJitter,
  isLockedLocalAuthError,
  isTargetClosedError,
  resetWhatsappStartupCoordinatorForTests,
  wait,
  waitForWhatsappTerminalState,
  withGlobalWhatsappInitLock,
  withTimeout
} from './whatsapp-startup.coordinator.js';

let clientFactory = createWhatsappClient;
const sessionOperations = new Map();
const reconnectTimers = new Map();
const reconnectAttempts = new Map();
const operationGenerations = new Map();
const restartRequests = new Map();
const initializationCancellations = new Map();
const pendingClientDestroys = new Map();

function numberEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function shouldAutoReconnect(reason) {
  if (process.env.WHATSAPP_AUTO_RECONNECT === 'false') {
    return false;
  }

  const normalizedReason = String(reason ?? '').toLowerCase();
  return !['logout', 'logged_out', 'auth_failure', 'conflict'].some((value) => normalizedReason.includes(value));
}

function clearReconnectTimer(companyId) {
  const id = normalizeCompanyId(companyId);
  const timer = reconnectTimers.get(id);

  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(id);
  }
}

function getOperationGeneration(companyId) {
  return operationGenerations.get(normalizeCompanyId(companyId)) ?? 0;
}

function invalidatePendingOperations(companyId) {
  const id = normalizeCompanyId(companyId);
  const cancellation = initializationCancellations.get(id);

  if (cancellation) {
    const error = new Error('WhatsApp initialization cancelled');
    error.code = 'WHATSAPP_INIT_CANCELLED';
    cancellation.reject(error);
    initializationCancellations.delete(id);
  }

  const generation = getOperationGeneration(id) + 1;
  operationGenerations.set(id, generation);
  clearReconnectTimer(id);
  return generation;
}

function createInitializationCancellation(companyId, generation) {
  let rejectCancellation;
  const promise = new Promise((_, reject) => {
    rejectCancellation = reject;
  });
  const cancellation = { generation, reject: rejectCancellation };
  initializationCancellations.set(normalizeCompanyId(companyId), cancellation);

  return {
    promise,
    clear() {
      if (initializationCancellations.get(normalizeCompanyId(companyId)) === cancellation) {
        initializationCancellations.delete(normalizeCompanyId(companyId));
      }
    }
  };
}

async function runSessionOperation(companyId, operation) {
  const id = normalizeCompanyId(companyId);
  const previous = sessionOperations.get(id) ?? Promise.resolve();
  const next = previous
    .catch(() => null)
    .then(operation)
    .finally(() => {
      if (sessionOperations.get(id) === next) {
        sessionOperations.delete(id);
      }
    });

  sessionOperations.set(id, next);
  return next;
}

function buildWhatsappNumberCandidates(phone) {
  const value = String(phone ?? '').trim();

  if (value.includes('@')) {
    return [value];
  }

  const digits = value.replace(/\D/g, '');
  const candidates = [digits];

  if (digits.startsWith('521') && digits.length === 13) {
    candidates.push(`52${digits.slice(3)}`);
  }

  if (digits.startsWith('52') && !digits.startsWith('521') && digits.length === 12) {
    candidates.push(`521${digits.slice(2)}`);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function getSerializedWhatsappId(numberId) {
  if (!numberId) {
    return null;
  }

  if (typeof numberId === 'string') {
    return numberId;
  }

  return numberId._serialized ?? numberId.id?._serialized ?? (
    numberId.user ? `${numberId.user}@${numberId.server ?? 'c.us'}` : null
  );
}

async function resolveWhatsappRecipientId(client, phone) {
  const fallback = normalizePhoneForWhatsapp(phone);

  if (fallback.includes('@g.us') || !client?.getNumberId) {
    return fallback;
  }

  for (const candidate of buildWhatsappNumberCandidates(phone)) {
    let serialized = null;

    try {
      serialized = getSerializedWhatsappId(await client.getNumberId(candidate));
    } catch (error) {
      logger.warn('whatsapp_number_id_resolution_failed', {
        candidate,
        error: error instanceof Error ? error.message : String(error ?? 'unknown')
      });
    }

    if (serialized) {
      return serialized;
    }
  }

  return fallback;
}

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayRange() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    start: `${today} 00:00:00`,
    endExclusive: `${addDays(today, 1)} 00:00:00`
  };
}

async function destroyClientQuietly(client) {
  if (!client) {
    return;
  }

  try {
    client[WHATSAPP_EVENT_CONTROL]?.stop?.();
  } catch {
    // Polling cleanup is best-effort.
  }

  try {
    client.removeAllListeners?.();
  } catch {
    // Listener cleanup is best-effort.
  }

  try {
    await withTimeout(
      client.destroy(),
      numberEnv('WHATSAPP_DESTROY_TIMEOUT_MS', 15000),
      'WhatsApp client destroy timed out'
    );
  } catch (error) {
    logger.error('whatsapp_client_destroy_error', {
      error,
      targetClosed: isTargetClosedError(error),
      lockedLocalAuth: isLockedLocalAuthError(error)
    });
  }
}

function trackClientDestroy(companyId, client) {
  const id = normalizeCompanyId(companyId);
  const destroyPromise = destroyClientQuietly(client)
    .finally(() => {
      if (pendingClientDestroys.get(id) === destroyPromise) {
        pendingClientDestroys.delete(id);
      }
    });
  pendingClientDestroys.set(id, destroyPromise);
  return destroyPromise;
}

async function waitForPendingClientDestroy(companyId) {
  const id = normalizeCompanyId(companyId);
  const pendingDestroy = pendingClientDestroys.get(id);

  if (!pendingDestroy) {
    return;
  }

  logger.info('whatsapp_waiting_for_pending_destroy', { empresaId: id });
  await withTimeout(
    pendingDestroy.catch(() => null),
    numberEnv('WHATSAPP_PENDING_DESTROY_WAIT_MS', 20000),
    'Timed out waiting for previous WhatsApp browser to close'
  ).catch((error) => {
    logger.warn('whatsapp_pending_destroy_wait_timeout', {
      empresaId: id,
      error: error instanceof Error ? error.message : String(error ?? 'unknown')
    });
  });
}

async function removeCompanyLocalAuthQuietly(companyId) {
  const sessionPath = getCompanyLocalAuthPath(companyId);

  if (process.env.WHATSAPP_ALLOW_AUTH_DELETE !== 'true') {
    logger.info('whatsapp_auth_delete_skipped', {
      empresaId: companyId,
      reason: 'WHATSAPP_ALLOW_AUTH_DELETE is not true',
      sessionPath
    });
    return false;
  }

  try {
    await fs.rm(sessionPath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 300
    });
    logger.info('whatsapp_auth_deleted', { empresaId: companyId });
    return true;
  } catch (error) {
    logger.error('whatsapp_company_localauth_remove_error', {
      empresaId: companyId,
      lockedLocalAuth: isLockedLocalAuthError(error),
      error
    });
    return false;
  }
}

async function archiveCompanyLocalAuthQuietly(companyId) {
  const sessionPath = getCompanyLocalAuthPath(companyId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivedPath = `${sessionPath}.corrupt-${timestamp}`;

  try {
    await fs.access(sessionPath);
  } catch {
    logger.info('whatsapp_auth_archive_skipped_missing_path', {
      empresaId: companyId,
      sessionPath
    });
    return false;
  }

  try {
    await fs.rename(sessionPath, archivedPath);
    logger.warn('whatsapp_auth_archived_for_new_link', {
      empresaId: companyId,
      previousPath: sessionPath,
      archivedPath
    });
    return true;
  } catch (error) {
    logger.error('whatsapp_auth_archive_error', {
      empresaId: companyId,
      sessionPath,
      archivedPath,
      lockedLocalAuth: isLockedLocalAuthError(error),
      error
    });
    return false;
  }
}

async function getWhatsappSessionMetrics(companyId, status) {
  const fallbackMetrics = {
    chats_count: 0,
    total_chats: 0,
    conversations_count: 0,
    messages_today: 0,
    today_messages: 0,
    bot_status: status === WHATSAPP_SESSION_STATUSES.READY ? 'Activo' : 'En espera',
    ai_status: env.openai.apiKey ? (env.openai.autoReply ? 'Activa' : 'Manual') : 'No configurada'
  };

  if (env.nodeEnv === 'test') {
    return fallbackMetrics;
  }

  const range = todayRange();

  try {
    const [[chatRows], [messageRows]] = await Promise.all([
      query(
        `SELECT COUNT(DISTINCT telefono_cliente) AS total
         FROM conversaciones
         WHERE empresa_id = ?`,
        [companyId]
      ),
      query(
        `SELECT COUNT(*) AS total
         FROM conversaciones
         WHERE empresa_id = ?
           AND fecha >= ?
           AND fecha < ?`,
        [companyId, range.start, range.endExclusive]
      )
    ]);

    const chatsCount = Number(chatRows[0]?.total ?? 0);
    const messagesToday = Number(messageRows[0]?.total ?? 0);

    return {
      chats_count: chatsCount,
      total_chats: chatsCount,
      conversations_count: chatsCount,
      messages_today: messagesToday,
      today_messages: messagesToday,
      bot_status: status === WHATSAPP_SESSION_STATUSES.READY ? 'Activo' : 'En espera',
      ai_status: env.openai.apiKey ? (env.openai.autoReply ? 'Activa' : 'Manual') : 'No configurada'
    };
  } catch (error) {
    logger.error('whatsapp_session_metrics_error', { empresaId: companyId, error });
    return fallbackMetrics;
  }
}

async function enrichPublicSession(session) {
  return {
    ...session,
    ...(await getWhatsappSessionMetrics(session.companyId, session.status))
  };
}

export function setWhatsappClientFactoryForTests(factory) {
  clientFactory = factory ?? createWhatsappClient;
}

export function resetWhatsappSessionsForTests() {
  for (const timer of reconnectTimers.values()) {
    clearTimeout(timer);
  }

  sessionOperations.clear();
  reconnectTimers.clear();
  reconnectAttempts.clear();
  operationGenerations.clear();
  restartRequests.clear();
  initializationCancellations.clear();
  pendingClientDestroys.clear();
  resetWhatsappStartupCoordinatorForTests();
  resetStoreForTests();
  clientFactory = createWhatsappClient;
}

export async function getSessionStatus(companyId) {
  const id = normalizeCompanyId(companyId);
  const liveSession = getSession(id);

  if (liveSession) {
    return enrichPublicSession(getPublicSession(id));
  }

  const storedSession = await getStoredWhatsappSessionStatus(id);
  return enrichPublicSession(storedSession ?? getPublicSession(id));
}

function scheduleReconnect(companyId, client, reason) {
  const id = normalizeCompanyId(companyId);
  const generation = getOperationGeneration(id);

  if (!shouldAutoReconnect(reason)) {
    reconnectAttempts.delete(id);
    logger.info('whatsapp_auto_reconnect_skipped', { empresaId: id, reason });
    return;
  }

  const attempt = (reconnectAttempts.get(id) ?? 0) + 1;
  const maxAttempts = Math.max(0, numberEnv('WHATSAPP_RECONNECT_MAX_ATTEMPTS', 5));

  if (maxAttempts > 0 && attempt > maxAttempts) {
    reconnectAttempts.delete(id);
    logger.error('whatsapp_auto_reconnect_exhausted', { empresaId: id, reason, attempt: attempt - 1 });
    return;
  }

  const delay = backoffWithJitter(attempt, {
    baseDelayMs: Math.max(1000, numberEnv('WHATSAPP_RECONNECT_BASE_DELAY_MS', 5000)),
    maxDelayMs: numberEnv('WHATSAPP_RECONNECT_MAX_DELAY_MS', 60000),
    jitterRatio: numberEnv('WHATSAPP_RECONNECT_JITTER_RATIO', 0.2)
  });

  clearReconnectTimer(id);
  reconnectAttempts.set(id, attempt);

  const timer = setTimeout(async () => {
    reconnectTimers.delete(id);

    try {
      const current = getSession(id);

      if (
        getOperationGeneration(id) !== generation
        || (
          current?.client
          && current.client !== client
        )
        || ![
          WHATSAPP_SESSION_STATUSES.DISCONNECTED,
          WHATSAPP_SESSION_STATUSES.FAILED
        ].includes(current?.status)
      ) {
        logger.info('whatsapp_auto_reconnect_cancelled', {
          empresaId: id,
          reason,
          attempt,
          currentStatus: current?.status ?? null
        });
        return;
      }

      logger.info('whatsapp_auto_reconnect_start', { empresaId: id, reason, attempt });
      const requestedGeneration = invalidatePendingOperations(id);
      await runSessionOperation(id, () => restartSessionNow(id, requestedGeneration));
    } catch (error) {
      logger.error('whatsapp_auto_reconnect_error', { empresaId: id, reason, attempt, error });
      const current = getSession(id);
      scheduleReconnect(id, current?.client ?? null, reason);
    }
  }, delay);

  timer.unref?.();
  reconnectTimers.set(id, timer);
  logger.info('whatsapp_auto_reconnect_scheduled', { empresaId: id, reason, attempt, delayMs: delay });
}

async function startSessionNow(companyId, requestedGeneration = getOperationGeneration(companyId)) {
  const id = normalizeCompanyId(companyId);
  const existing = getSession(id);

  if (requestedGeneration !== getOperationGeneration(id)) {
    return getPublicSession(id);
  }

  if (
    existing
    && ACTIVE_SESSION_STATUSES.has(existing.status)
    && !(existing.status === WHATSAPP_SESSION_STATUSES.INITIALIZING && !existing.client)
  ) {
    return getPublicSession(id);
  }

  return withGlobalWhatsappInitLock(async () => {
    const generation = requestedGeneration;
    const currentBeforeStart = getSession(id);

    if (generation !== getOperationGeneration(id)) {
      return getPublicSession(id);
    }

    if (currentBeforeStart?.client) {
      await trackClientDestroy(id, currentBeforeStart.client);
    } else {
      await waitForPendingClientDestroy(id);
    }

    if (generation !== getOperationGeneration(id)) {
      return getPublicSession(id);
    }

    clearReconnectTimer(id);
    const client = clientFactory(id);
    markStarted(id, client);
    setClient(id, client);
    saveWhatsappSessionStatus(getPublicSession(id)).catch((error) => {
      logger.error('whatsapp_status_persist_error', { empresaId: id, error });
    });
    registerWhatsappClientEvents({
      companyId: id,
      client,
      onReady: () => {
        reconnectAttempts.delete(id);
        clearReconnectTimer(id);
      },
      onDisconnected: ({ reason }) => {
        if (shouldAutoReconnect(reason)) {
          scheduleReconnect(id, client, reason);
          return;
        }

        invalidatePendingOperations(id);
        const current = getSession(id);
        if (current?.client === client) {
          upsertSession(id, {
            client: null,
            isInitializing: false
          });
        }

        logger.info('whatsapp_disconnected_client_cleanup_started', { empresaId: id, reason });
        trackClientDestroy(id, client)
          .then(() => logger.info('whatsapp_disconnected_client_cleanup_completed', { empresaId: id, reason }))
          .catch((error) => logger.error('whatsapp_disconnected_client_cleanup_error', { empresaId: id, reason, error }));
      }
    });
    logger.info('whatsapp_session_initialize_requested', { empresaId: id });

    const timeoutMs = Math.max(100, numberEnv('WHATSAPP_INITIALIZE_TIMEOUT_MS', 90000));
    const cancellation = createInitializationCancellation(id, generation);

    try {
      const initializePromise = Promise.resolve()
        .then(() => client.initialize());
      initializePromise.catch((error) => {
        const current = getSession(id);
        if (current?.client !== client || generation !== getOperationGeneration(id)) {
          logger.info('whatsapp_initialize_late_rejection_ignored', {
            empresaId: id,
            error: error instanceof Error ? error.message : String(error ?? 'unknown'),
            targetClosed: isTargetClosedError(error)
          });
        }
      });
      await withTimeout(
        Promise.race([
          initializePromise,
          cancellation.promise
        ]),
        timeoutMs,
        `WhatsApp client.initialize timed out after ${timeoutMs}ms`
      );
      const terminalSession = await waitForWhatsappTerminalState({
        getSession: () => getSession(id),
        timeoutMs,
        pollIntervalMs: Math.max(25, numberEnv('WHATSAPP_INIT_POLL_INTERVAL_MS', 100)),
        isCancelled: () => generation !== getOperationGeneration(id)
      });
      const publicSession = getPublicSession(id);
      emitWhatsappStatus(id, publicSession);
      logger.info('whatsapp_session_initialize_completed', {
        empresaId: id,
        status: terminalSession.status
      });
      return publicSession;
    } catch (error) {
      if (error?.code === 'WHATSAPP_INIT_CANCELLED') {
        logger.info('whatsapp_session_initialize_cancelled', { empresaId: id });
        if (getSession(id)?.client === client) {
          await destroyClientQuietly(client);
        }
        return getPublicSession(id);
      }

      const current = getSession(id);

      if (current?.client === client) {
        await destroyClientQuietly(client);
        const errorMessage = error instanceof Error ? error.message : String(error ?? 'Error inicializando WhatsApp');
        const lockedLocalAuth = isLockedLocalAuthError(error);
        const transientInitializationError =
          error?.code === 'WHATSAPP_INIT_TIMEOUT'
          || isTargetClosedError(error)
          || lockedLocalAuth;

        if (transientInitializationError && shouldAutoReconnect(errorMessage) && (!lockedLocalAuth || pendingClientDestroys.has(id))) {
          const session = setStatus(id, WHATSAPP_SESSION_STATUSES.DISCONNECTED, {
            client: null,
            disconnectedAt: new Date().toISOString(),
            phoneNumber: null,
            lastError: null,
            isInitializing: false
          });
          emitWhatsappStatus(id, session);
          saveWhatsappSessionStatus(getPublicSession(id)).catch((persistError) => {
            logger.error('whatsapp_status_persist_error', { empresaId: id, error: persistError });
          });
          logger.warn('whatsapp_initialize_retryable_error', {
            empresaId: id,
            reason: errorMessage,
            targetClosed: isTargetClosedError(error),
            lockedLocalAuth,
            timeout: error?.code === 'WHATSAPP_INIT_TIMEOUT'
          });
          scheduleReconnect(id, null, errorMessage);
          return getPublicSession(id);
        }

        if (lockedLocalAuth) {
          logger.error('whatsapp_profile_lock_requires_manual_cleanup', {
            empresaId: id,
            sessionPath: getCompanyLocalAuthPath(id),
            reason: errorMessage
          });
        }

        const session = setStatus(id, WHATSAPP_SESSION_STATUSES.FAILED, {
          client: null,
          disconnectedAt: new Date().toISOString(),
          phoneNumber: null,
          lastError: errorMessage,
          isInitializing: false
        });
        emitWhatsappError(id, error);
        emitWhatsappStatus(id, session);
        saveWhatsappSessionStatus(getPublicSession(id)).catch((persistError) => {
          logger.error('whatsapp_status_persist_error', { empresaId: id, error: persistError });
        });
      } else {
        logger.info('whatsapp_initialize_error_ignored_for_stale_client', {
          empresaId: id,
          error: error instanceof Error ? error.message : String(error ?? 'unknown')
        });
        return getPublicSession(id);
      }

      logger.error('whatsapp_initialize_error', {
        empresaId: id,
        message: error instanceof Error ? error.message : String(error ?? 'unknown'),
        targetClosed: isTargetClosedError(error),
        lockedLocalAuth: isLockedLocalAuthError(error),
        error
      });
      if (isLockedLocalAuthError(error)) {
        logger.info('whatsapp_auto_reconnect_skipped', {
          empresaId: id,
          reason: 'local_auth_profile_locked'
        });
      } else {
        scheduleReconnect(id, null, error?.message ?? String(error));
      }
      return getPublicSession(id);
    } finally {
      cancellation.clear();
    }
  });
}

export async function startSession(companyId) {
  const id = normalizeCompanyId(companyId);
  const requestedGeneration = getOperationGeneration(id);
  return runSessionOperation(id, () => startSessionNow(id, requestedGeneration));
}

export async function requestStartSession(companyId) {
  const id = normalizeCompanyId(companyId);
  const existing = getSession(id);

  logger.info('whatsapp_manual_start_requested', { empresaId: id, action: 'start' });

  if (
    existing
    && ACTIVE_SESSION_STATUSES.has(existing.status)
    && !(existing.status === WHATSAPP_SESSION_STATUSES.INITIALIZING && !existing.client)
  ) {
    return getPublicSession(id);
  }

  const storedSession = existing ? null : await getStoredWhatsappSessionStatus(id);

  if (storedSession && ACTIVE_SESSION_STATUSES.has(storedSession.status)) {
    logger.info('whatsapp_manual_start_rehydrating_stored_active_session', {
      empresaId: id,
      status: storedSession.status
    });
  }

  const session = upsertSession(id, {
    status: WHATSAPP_SESSION_STATUSES.INITIALIZING,
    qr: null,
    qrText: null,
    qrImage: null,
    lastError: null,
    disconnectedAt: null,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    isInitializing: true
  });
  emitWhatsappStatus(id, session);
  saveWhatsappSessionStatus(getPublicSession(id)).catch((error) => {
    logger.error('whatsapp_status_persist_error', { empresaId: id, error });
  });

  startSession(id).catch((error) => {
    logger.error('whatsapp_background_start_error', { empresaId: id, error });
  });

  return getPublicSession(id);
}

async function restartSessionNow(companyId, requestedGeneration = getOperationGeneration(companyId)) {
  const id = normalizeCompanyId(companyId);
  const existing = getSession(id);

  if (requestedGeneration !== getOperationGeneration(id)) {
    return getPublicSession(id);
  }

  clearReconnectTimer(id);

  if (existing?.client) {
    await trackClientDestroy(id, existing.client);
  } else {
    await waitForPendingClientDestroy(id);
  }

  const session = upsertSession(id, {
    status: WHATSAPP_SESSION_STATUSES.DISCONNECTED,
    client: null,
    qr: null,
    qrText: null,
    qrImage: null,
    disconnectedAt: new Date().toISOString(),
    isInitializing: false
  });
  emitWhatsappStatus(id, session);
  saveWhatsappSessionStatus(getPublicSession(id)).catch((error) => {
    logger.error('whatsapp_status_persist_error', { empresaId: id, error });
  });

  return startSessionNow(id, requestedGeneration);
}

export async function restartSession(companyId) {
  const id = normalizeCompanyId(companyId);

  logger.info('whatsapp_manual_start_requested', { empresaId: id, action: 'restart' });

  if (restartRequests.has(id)) {
    return restartRequests.get(id);
  }

  const existing = getSession(id);
  const storedSession = existing ? null : await getStoredWhatsappSessionStatus(id);

  if (storedSession && ACTIVE_SESSION_STATUSES.has(storedSession.status)) {
    logger.info('whatsapp_restart_recreating_stored_active_session', {
      empresaId: id,
      action: 'restart',
      status: storedSession.status
    });
  }

  const requestedGeneration = invalidatePendingOperations(id);
  const request = runSessionOperation(id, () => restartSessionNow(id, requestedGeneration))
    .finally(() => {
      if (restartRequests.get(id) === request) {
        restartRequests.delete(id);
      }
    });
  restartRequests.set(id, request);
  return request;
}

export async function disconnectSession(companyId) {
  const id = normalizeCompanyId(companyId);
  invalidatePendingOperations(id);
  return disconnectSessionNow(id, { backgroundDestroy: true });
}

async function disconnectSessionNow(companyId, { backgroundDestroy = false } = {}) {
  const id = normalizeCompanyId(companyId);
  const existing = getSession(id);

  clearReconnectTimer(id);
  reconnectAttempts.delete(id);

  const session = upsertSession(id, {
    status: WHATSAPP_SESSION_STATUSES.DISCONNECTED,
    client: null,
    qr: null,
    qrText: null,
    qrImage: null,
    lastError: null,
    isInitializing: false,
    disconnectedAt: new Date().toISOString()
  });
  emitWhatsappStatus(id, session);
  saveWhatsappSessionStatus(getPublicSession(id)).catch((error) => {
    logger.error('whatsapp_status_persist_error', { empresaId: id, error });
  });

  if (existing?.client) {
    if (backgroundDestroy) {
      logger.info('whatsapp_disconnect_destroy_background_started', { empresaId: id });
      trackClientDestroy(id, existing.client)
        .then(() => logger.info('whatsapp_disconnect_destroy_background_completed', { empresaId: id }))
        .catch((error) => logger.error('whatsapp_disconnect_destroy_background_error', { empresaId: id, error }));
    } else {
      await trackClientDestroy(id, existing.client);
    }
  }

  return getPublicSession(id);
}

async function destroySessionNow(companyId) {
  const id = normalizeCompanyId(companyId);
  await disconnectSessionNow(id);
  removeSession(id);
  const archived = process.env.WHATSAPP_ARCHIVE_AUTH_ON_DESTROY !== 'false'
    ? await archiveCompanyLocalAuthQuietly(id)
    : false;
  if (!archived) {
    await removeCompanyLocalAuthQuietly(id);
  }

  const session = upsertSession(id, {
    status: WHATSAPP_SESSION_STATUSES.DESTROYED,
    client: null,
    qr: null,
    qrText: null,
    qrImage: null,
    lastError: null,
    isInitializing: false,
    disconnectedAt: new Date().toISOString()
  });
  emitWhatsappStatus(id, session);
  saveWhatsappSessionStatus(getPublicSession(id)).catch((error) => {
    logger.error('whatsapp_status_persist_error', { empresaId: id, error });
  });
  return getPublicSession(id);
}

export async function destroySession(companyId) {
  const id = normalizeCompanyId(companyId);
  invalidatePendingOperations(id);
  return runSessionOperation(id, () => destroySessionNow(id));
}

export async function getQr(companyId) {
  const id = normalizeCompanyId(companyId);
  const session = getSession(id)
    ? getPublicSession(id)
    : (await getStoredWhatsappSessionStatus(id)) ?? getPublicSession(id);

  return {
    companyId: session.companyId,
    status: session.status,
    qr: session.qr,
    qrText: session.qrText,
    qrImage: session.qrImage
  };
}

export async function listSessions() {
  const liveSessions = new Map(listPublicSessions().map((session) => [session.companyId, session]));
  const storedSessions = await listStoredWhatsappSessionStatuses();

  for (const storedSession of storedSessions) {
    if (!liveSessions.has(storedSession.companyId)) {
      liveSessions.set(storedSession.companyId, storedSession);
    }
  }

  return Array.from(liveSessions.values());
}

export async function sendWhatsappMessage(companyId, phone, message) {
  const id = normalizeCompanyId(companyId);
  const session = getSession(id);
  const cleanMessage = String(message ?? '').trim();

  if (!cleanMessage) {
    throw new Error('El mensaje es requerido');
  }

  if (!session?.client || session.status !== WHATSAPP_SESSION_STATUSES.READY) {
    throw new Error('La sesion de WhatsApp de la empresa no esta conectada');
  }

  const to = await resolveWhatsappRecipientId(session.client, phone);
  await session.client.sendMessage(to, cleanMessage);
  upsertSession(id, { lastOutboundAt: new Date().toISOString() });
  logger.info('whatsapp_message_sent', {
    empresaId: id,
    phone,
    to
  });

  return {
    companyId: id,
    phone,
    to,
    status: 'sent'
  };
}

export async function restoreSessionsOnBoot() {
  if (env.whatsapp.restoreSessions !== true) {
    logger.info('whatsapp_restore_skipped', { enabled: false });
    return [];
  }

  logger.info('whatsapp_restore_started');

  const [companies] = await query(
    `SELECT e.id
     FROM empresas e
     INNER JOIN whatsapp_session_status w ON w.empresa_id = e.id
     LEFT JOIN configuracion_empresas ce ON ce.empresa_id = e.id
     WHERE e.activo = 1
       AND e.estado = 'ACTIVA'
       AND COALESCE(ce.activo_whatsapp, 1) = 1
       AND COALESCE(w.auto_restore, 0) = 1
     ORDER BY e.id ASC`
  );

  const sessions = await restoreCompanySessions(companies, startSession, {
    keepQrSessions: process.env.WHATSAPP_RESTORE_KEEP_QR_SESSIONS === 'true'
  });

  logger.info('whatsapp_restore_completed', { restored: sessions.length });
  return sessions;
}

export async function restoreCompanySessions(companies, starter = startSession, {
  keepQrSessions = true
} = {}) {
  const restored = [];

  for (const company of companies) {
    try {
      logger.info('whatsapp_restore_started', { empresaId: company.id });
      let session = await starter(company.id);

      if (!keepQrSessions && session.status === WHATSAPP_SESSION_STATUSES.QR) {
        logger.info('whatsapp_restore_qr_session_disconnected', {
          empresaId: company.id,
          reason: 'qr_required_during_boot'
        });
        session = await disconnectSession(company.id);
      }

      restored.push(session);
      logger.info('whatsapp_restore_completed', {
        empresaId: company.id,
        status: session.status
      });
      await wait(env.whatsapp.restoreSessionDelayMs);
    } catch (error) {
      logger.error('whatsapp_restore_session_error', {
        empresaId: company.id,
        error
      });
    }
  }

  return restored;
}

export async function shutdownWhatsappSessions() {
  for (const timer of reconnectTimers.values()) {
    clearTimeout(timer);
  }

  reconnectTimers.clear();
  reconnectAttempts.clear();

  const sessions = listPublicSessions();
  await Promise.allSettled(sessions.map(async (session) => {
    const current = getSession(session.companyId);

    if (current?.client) {
      await destroyClientQuietly(current.client);
    }

    clearQr(session.companyId);
    setStatus(session.companyId, WHATSAPP_SESSION_STATUSES.DISCONNECTED, {
      client: null,
      disconnectedAt: new Date().toISOString(),
      phoneNumber: null,
      isInitializing: false
    });
  }));
}

export async function getWhatsappHealthSummary() {
  const sessions = listPublicSessions();

  return {
    active_sessions: sessions.filter((session) => session.status !== WHATSAPP_SESSION_STATUSES.IDLE).length,
    total_sessions: sessions.length,
    connected_sessions: sessions.filter((session) => session.status === WHATSAPP_SESSION_STATUSES.READY).length,
    error_sessions: sessions.filter((session) => session.status === WHATSAPP_SESSION_STATUSES.FAILED).length,
    sessions
  };
}
