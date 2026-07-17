import qrcode from 'qrcode';
import pino from 'pino';
import { env } from '../../config/env.js';
import { createHttpError } from '../../utils/http-error.js';
import { logger } from '../../utils/logger.js';
import { getQueueRegistry } from '../../queues/queue-registry.js';
import {
  baseWhatsappStatus,
  getPersistedWhatsappStatus,
  listPersistedWhatsappStatuses,
  persistWhatsappStatus
} from './whatsapp-session-status.store.js';
import {
  createBaileysAuthState,
  removeBaileysAuthState
} from './baileys-auth.store.js';
import {
  normalizeBaileysDestination,
  normalizeBaileysInboundMessage
} from './baileys-message.normalizer.js';
import {
  classifyBaileysDisconnect,
  isBaileysLoggedOut,
  normalizeBaileysError
} from './baileys-status.mapper.js';
import { whatsappSessionRecoveryService } from '../whatsapp/whatsapp-session-recovery.service.js';

function normalizeEmpresaId(empresaId) {
  const id = Number(empresaId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return id;
}

function maskIdentifier(value) {
  const rawValue = String(value ?? '');

  if (!rawValue) {
    return null;
  }

  if (rawValue.length <= 8) {
    return `${rawValue.slice(0, 2)}***`;
  }

  return `${rawValue.slice(0, 4)}***${rawValue.slice(-5)}`;
}

function phoneFromUser(user) {
  return String(user ?? '').split(':')[0].replace(/\D/g, '') || null;
}

function statusEvent(type, message) {
  return { type, message, at: new Date().toISOString() };
}

export function createBaileysService({
  config = env,
  loggerInstance = logger,
  getRegistry = getQueueRegistry,
  authStore = { createAuthState: createBaileysAuthState, removeAuthState: removeBaileysAuthState },
  statusStore = {
    persistStatus: persistWhatsappStatus,
    getStatus: getPersistedWhatsappStatus,
    listStatuses: listPersistedWhatsappStatuses
  },
  recoveryStore = whatsappSessionRecoveryService,
  importBaileys = () => import('@whiskeysockets/baileys'),
  socketFactory,
  qrToDataUrl = qrcode.toDataURL,
  now = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
} = {}) {
  const sessions = new Map();
  const lastStatuses = new Map();
  const operationLocks = new Map();
  let shuttingDown = false;
  let cachedBaileys = null;

  async function loadBaileys() {
    if (!cachedBaileys) {
      cachedBaileys = await importBaileys();
    }

    return cachedBaileys;
  }

  function currentState(id) {
    return sessions.get(id)?.state ?? lastStatuses.get(id) ?? baseWhatsappStatus(id);
  }

  async function withCompanyLock(empresaId, operation) {
    const id = normalizeEmpresaId(empresaId);
    const currentLock = operationLocks.get(id) ?? Promise.resolve();
    let release;
    const nextLock = new Promise((resolve) => {
      release = resolve;
    });
    const queuedLock = currentLock.then(() => nextLock, () => nextLock);
    operationLocks.set(id, queuedLock);
    await currentLock.catch(() => {});

    try {
      return await operation(id);
    } finally {
      release();

      if (operationLocks.get(id) === queuedLock) {
        operationLocks.delete(id);
      }
    }
  }

  function updateState(session, updates, event) {
    session.state = {
      ...session.state,
      ...updates,
      updated_at: new Date(now()).toISOString(),
      events: event ? [event, ...(session.state.events ?? [])].slice(0, 12) : session.state.events
    };
    statusStore.persistStatus(session.state).catch(() => {});
    return session.state;
  }

  function clearQrTimer(session) {
    if (session.qrTimer) {
      clearTimeoutFn(session.qrTimer);
      session.qrTimer = null;
    }
  }

  function clearReconnectTimer(session) {
    if (session.reconnectTimer) {
      clearTimeoutFn(session.reconnectTimer);
      session.reconnectTimer = null;
    }
  }

  function clearStableTimer(session) {
    if (session.stableTimer) {
      clearTimeoutFn(session.stableTimer);
      session.stableTimer = null;
    }
  }

  function removeSocketListeners(sock, listeners) {
    if (!sock?.ev || !listeners) {
      return;
    }

    for (const [event, handler] of listeners) {
      if (typeof sock.ev.off === 'function') {
        sock.ev.off(event, handler);
      } else if (typeof sock.ev.removeListener === 'function') {
        sock.ev.removeListener(event, handler);
      }
    }
  }

  function cleanupSocket(session) {
    clearQrTimer(session);
    clearStableTimer(session);
    removeSocketListeners(session.sock, session.socketListeners);
    session.socketListeners = [];
    session.sock?.end?.();
    session.sock?.ws?.close?.();
    session.sock = null;
  }

  async function enqueueInbound(session, inboundJob) {
    const queueWrapper = getRegistry()?.whatsappInboundQueue;

    if (!queueWrapper || queueWrapper.status !== 'ready') {
      throw createHttpError(503, 'La cola de entrada de WhatsApp no esta disponible');
    }

    await queueWrapper.enqueue(inboundJob);
    loggerInstance.info('baileys_inbound_enqueued', {
      empresaId: session.companyId,
      messageId: inboundJob.messageId,
      whatsappChatId: maskIdentifier(inboundJob.whatsappChatId)
    });
  }

  async function handleMessagesUpsert(session, payload) {
    for (const message of payload?.messages ?? []) {
      const inboundJob = await normalizeBaileysInboundMessage({
        empresaId: session.companyId,
        message,
        sock: session.sock
      });

      if (!inboundJob) {
        continue;
      }

      if (session.seenMessageIds.has(inboundJob.messageId)) {
        continue;
      }

      session.seenMessageIds.add(inboundJob.messageId);
      loggerInstance.info('baileys_inbound_received', {
        empresaId: session.companyId,
        messageId: inboundJob.messageId,
        whatsappChatId: maskIdentifier(inboundJob.whatsappChatId),
        bodyLength: inboundJob.body.length
      });
      await enqueueInbound(session, inboundJob);
    }
  }

  async function scheduleReconnect(session, reason, classification) {
    if (shuttingDown || session.manualDisconnect) {
      return;
    }

    const recovery = await recoveryStore.retryableFailure({
      empresaId: session.companyId,
      error: reason,
      classification: classification?.category
    });
    session.reconnectAttempts = recovery.consecutiveFailures;

    if (!recovery.shouldRetry) {
      updateState(session, {
        status: 'RECONNECTING',
        qr: null,
        qr_image: null,
        reconnect_attempt: session.reconnectAttempts,
        next_reconnect_at: recovery.nextRetryAt ? new Date(recovery.nextRetryAt).toISOString() : null,
        last_error: reason?.message ?? 'Limite de reconexiones alcanzado'
      }, statusEvent('RECONNECTING', 'Sesion Baileys en cooldown'));
      return;
    }

    const delay = recovery.delayMs;
    const nextReconnectAt = new Date(now() + delay).toISOString();
    updateState(session, {
      status: 'RECONNECTING',
      qr: null,
      qr_image: null,
      reconnect_attempt: session.reconnectAttempts,
      next_reconnect_at: nextReconnectAt,
      last_error: reason?.message ?? 'Conexion temporal cerrada'
    }, statusEvent('RECONNECTING', 'Reconexion Baileys programada'));
    loggerInstance.info('whatsapp_recovery_scheduled', {
      empresaId: session.companyId,
      attempt: session.reconnectAttempts,
      delayMs: delay
    });
    clearReconnectTimer(session);
    session.reconnectTimer = setTimeoutFn(() => {
      startSessionUnlocked(session.companyId, { fromReconnect: true }).catch((error) => {
        loggerInstance.error('baileys_reconnect_error', { empresaId: session.companyId, error: normalizeBaileysError(error) });
      });
    }, delay);
    session.reconnectTimer.unref?.();
  }

  function markStableAfterOpen(session, generation) {
    clearStableTimer(session);
    session.stableTimer = setTimeoutFn(() => {
      if (sessions.get(session.companyId) !== session || session.generation !== generation || shuttingDown) {
        return;
      }

      session.reconnectAttempts = 0;
      recoveryStore.connected({ empresaId: session.companyId }).catch(() => {});
    }, config.whatsapp.reconnect?.stableAfterMs ?? 60000);
    session.stableTimer.unref?.();
  }

  async function handleConnectionUpdate(session, update, generation) {
    if (sessions.get(session.companyId) !== session || session.generation !== generation) {
      loggerInstance.warn('whatsapp_stale_socket_event_ignored', {
        empresaId: session.companyId,
        event: 'connection.update'
      });
      return;
    }

    if (update.qr) {
      clearQrTimer(session);
      const qrImage = await qrToDataUrl(update.qr);
      updateState(session, {
        status: 'QR_READY',
        qr: update.qr,
        qr_image: qrImage,
        last_error: null
      }, statusEvent('QR_READY', 'QR Baileys listo'));
      loggerInstance.info('baileys_qr_ready', { empresaId: session.companyId });
      session.qrTimer = setTimeoutFn(() => {
        updateState(session, { qr: null, qr_image: null }, statusEvent('QR_EXPIRED', 'QR Baileys expirado'));
      }, config.whatsapp.baileys.qrTtlMs);
      session.qrTimer.unref?.();
    }

    if (update.connection === 'open') {
      clearQrTimer(session);
      const phone = phoneFromUser(session.sock?.user?.id ?? session.authState?.state?.creds?.me?.id);
      updateState(session, {
        status: 'CONNECTED',
        qr: null,
        qr_image: null,
        phone,
        connected_at: new Date(now()).toISOString(),
        last_error: null,
        reconnect_attempt: 0,
        next_reconnect_at: null
      }, statusEvent('CONNECTED', 'Sesion Baileys conectada'));
      await recoveryStore.started({ empresaId: session.companyId }).catch(() => {});
      markStableAfterOpen(session, generation);
      loggerInstance.info('baileys_session_connected', { empresaId: session.companyId, phone: maskIdentifier(phone) });
    }

    if (update.connection === 'close') {
      clearQrTimer(session);
      clearStableTimer(session);
      const { DisconnectReason } = await loadBaileys();
      const classification = classifyBaileysDisconnect(update.lastDisconnect?.error, DisconnectReason);
      const loggedOut = isBaileysLoggedOut(update.lastDisconnect?.error, DisconnectReason);
      loggerInstance.warn('baileys_session_disconnected', {
        empresaId: session.companyId,
        loggedOut,
        classification: classification.category,
        error: normalizeBaileysError(update.lastDisconnect?.error)
      });

      if (classification.category === 'terminal') {
        session.manualDisconnect = true;
        loggerInstance.warn('baileys_auth_blocked', { empresaId: session.companyId, reason: classification.reason });
        await recoveryStore.blocked({
          empresaId: session.companyId,
          reason: classification.reason,
          error: update.lastDisconnect?.error
        }).catch(() => {});
        updateState(session, {
          status: 'AUTH_FAILED',
          qr: null,
          qr_image: null,
          last_error: 'Sesion Baileys cerrada o credenciales invalidas',
          next_reconnect_at: null
        }, statusEvent('AUTH_FAILED', 'Credenciales Baileys invalidas'));
        lastStatuses.set(session.companyId, session.state);
        cleanupSocket(session);
        sessions.delete(session.companyId);
        return;
      }

      if (session.manualDisconnect || shuttingDown) {
        updateState(session, {
          status: 'DISCONNECTED',
          qr: null,
          qr_image: null,
          next_reconnect_at: null
        }, statusEvent('DISCONNECTED', 'Sesion Baileys cerrada'));
        await recoveryStore.disconnected({ empresaId: session.companyId, error: update.lastDisconnect?.error }).catch(() => {});
        return;
      }

      await scheduleReconnect(session, update.lastDisconnect?.error, classification);
    }
  }

  async function createSocket(session) {
    const baileys = await loadBaileys();
    const factory = socketFactory ?? baileys.makeWASocket ?? baileys.default;
    const sock = factory({
      auth: session.authState.state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' })
    });
    const generation = session.generation;
    session.sock = sock;
    const onConnectionUpdate = (update) => {
      handleConnectionUpdate(session, update, generation).catch((error) => {
        loggerInstance.error('baileys_connection_update_error', { empresaId: session.companyId, error: normalizeBaileysError(error) });
      });
    };
    const onCredsUpdate = session.authState.saveCreds;
    const onMessagesUpsert = (payload) => {
      if (sessions.get(session.companyId) !== session || session.generation !== generation) {
        loggerInstance.warn('whatsapp_stale_socket_event_ignored', {
          empresaId: session.companyId,
          event: 'messages.upsert'
        });
        return;
      }

      handleMessagesUpsert(session, payload).catch((error) => {
        loggerInstance.error('baileys_inbound_error', { empresaId: session.companyId, error: normalizeBaileysError(error) });
      });
    };
    sock.ev.on('connection.update', onConnectionUpdate);
    sock.ev.on('creds.update', onCredsUpdate);
    sock.ev.on('messages.upsert', onMessagesUpsert);
    session.socketListeners = [
      ['connection.update', onConnectionUpdate],
      ['creds.update', onCredsUpdate],
      ['messages.upsert', onMessagesUpsert]
    ];
    return sock;
  }

  async function startSessionUnlocked(id, { fromReconnect = false } = {}) {
    const registry = getRegistry();

    if (config.queue?.enabled && registry?.status !== 'ready') {
      const error = createHttpError(503, 'Redis no esta listo para iniciar sesiones WhatsApp');
      error.code = 'WHATSAPP_REDIS_NOT_READY';
      throw error;
    }

    let session = sessions.get(id);

    if (session && ['INITIALIZING', 'QR_READY', 'CONNECTED', 'RECONNECTING'].includes(session.state.status) && !fromReconnect) {
      return session.state;
    }

    if (!session) {
      let authState;

      try {
        authState = await authStore.createAuthState(id, {
          authPath: config.whatsapp.baileys.authPath,
          authStore: config.whatsapp.baileys.authStore,
          importBaileys,
          loggerInstance
        });
      } catch (error) {
        const failedState = {
          ...baseWhatsappStatus(id),
          status: 'AUTH_FAILED',
          last_error: 'No se pudo cargar la autenticacion de Baileys',
          updated_at: new Date(now()).toISOString(),
          events: [statusEvent('AUTH_FAILED', 'Error de autenticacion Baileys')]
        };
        lastStatuses.set(id, failedState);
        await statusStore.persistStatus(failedState).catch(() => {});
        loggerInstance.error(config.whatsapp.baileys.authStore === 'mysql' ? 'baileys_auth_mysql_error' : 'baileys_auth_store_error', {
          empresaId: id,
          error: normalizeBaileysError(error)
        });
        throw error;
      }
      session = {
        companyId: id,
        authState,
        state: baseWhatsappStatus(id),
        seenMessageIds: new Set(),
        reconnectAttempts: 0,
        reconnectTimer: null,
        qrTimer: null,
        stableTimer: null,
        generation: 0,
        socketListeners: [],
        manualDisconnect: false,
        sock: null
      };
      sessions.set(id, session);
    }

    clearReconnectTimer(session);
    cleanupSocket(session);
    session.generation += 1;
    session.manualDisconnect = false;
    await recoveryStore.started({ empresaId: id }).catch(() => {});
    updateState(session, {
      status: 'INITIALIZING',
      last_error: null,
      next_reconnect_at: null
    }, statusEvent('INITIALIZING', 'Iniciando sesion Baileys'));
    loggerInstance.info('baileys_session_initializing', { empresaId: id });
    await createSocket(session);
    return session.state;
  }

  return {
    async startSession(empresaId) {
      return withCompanyLock(empresaId, (id) => startSessionUnlocked(id));
    },

    getStatus(empresaId) {
      return currentState(normalizeEmpresaId(empresaId));
    },

    async getStatusSnapshot(empresaId) {
      const id = normalizeEmpresaId(empresaId);
      return sessions.get(id)?.state ?? lastStatuses.get(id) ?? (await statusStore.getStatus(id)) ?? baseWhatsappStatus(id);
    },

    async listStatusSnapshots() {
      const localStatuses = Array.from(sessions.values()).map((session) => session.state);
      const localCompanyIds = new Set(localStatuses.map((status) => Number(status.empresa_id)));
      const persisted = (await statusStore.listStatuses()).filter((status) => !localCompanyIds.has(Number(status.empresa_id)));
      return [...localStatuses, ...persisted];
    },

    async getQr(empresaId) {
      const status = await this.getStatusSnapshot(empresaId);
      return {
        empresa_id: status.empresa_id,
        status: status.status,
        qr: status.qr,
        qr_image: status.qr_image,
        updated_at: status.updated_at
      };
    },

    async disconnectSession(empresaId) {
      return withCompanyLock(empresaId, async (id) => {
        const session = sessions.get(id);
        const disconnectedState = {
          ...baseWhatsappStatus(id),
          updated_at: new Date(now()).toISOString(),
          events: [statusEvent('DISCONNECTED', 'Sesion Baileys cerrada manualmente')]
        };

        if (session) {
          session.manualDisconnect = true;
          clearReconnectTimer(session);
          cleanupSocket(session);
          sessions.delete(id);
        }

        await recoveryStore.cancel({ empresaId: id, reason: 'manual_disconnect' }).catch(() => {});
        await authStore.removeAuthState(id, {
          authPath: config.whatsapp.baileys.authPath,
          authStore: config.whatsapp.baileys.authStore,
          loggerInstance,
          importBaileys
        });
        lastStatuses.set(id, disconnectedState);
        await statusStore.persistStatus(disconnectedState).catch(() => {});
        return disconnectedState;
      });
    },

    async restartSession(empresaId) {
      return withCompanyLock(empresaId, async (id) => {
        const session = sessions.get(id);

        if (session) {
          clearReconnectTimer(session);
          cleanupSocket(session);
          session.generation += 1;
          updateState(session, {
            status: 'RECONNECTING',
            qr: null,
            qr_image: null,
            last_error: null
          }, statusEvent('RESTARTING', 'Reiniciando sesion Baileys'));
        }

        return startSessionUnlocked(id);
      });
    },

    async closeSession(empresaId, reason = 'lease_lost') {
      return withCompanyLock(empresaId, async (id) => {
        const session = sessions.get(id);

        if (!session) {
          return false;
        }

        session.manualDisconnect = true;
        clearReconnectTimer(session);
        cleanupSocket(session);
        sessions.delete(id);
        const disconnectedState = {
          ...session.state,
          status: 'DISCONNECTED',
          qr: null,
          qr_image: null,
          next_reconnect_at: null,
          updated_at: new Date(now()).toISOString(),
          events: [statusEvent('DISCONNECTED', `Sesion Baileys cerrada por ${reason}`), ...(session.state.events ?? [])].slice(0, 12)
        };
        lastStatuses.set(id, disconnectedState);
        await statusStore.persistStatus(disconnectedState).catch(() => {});
        await recoveryStore.cancel({ empresaId: id, reason }).catch(() => {});
        loggerInstance.warn('whatsapp_session_lease_lost', { empresaId: id, reason });
        return true;
      });
    },

    async sendText(empresaId, destination, message) {
      return this.sendTextDirect(empresaId, destination, message);
    },

    async sendTextDirect(empresaId, destination, message) {
      const id = normalizeEmpresaId(empresaId);
      const session = sessions.get(id);

      if (!session || session.state.status !== 'CONNECTED' || !session.sock) {
        throw createHttpError(409, 'La sesion de WhatsApp de la empresa no esta conectada');
      }

      const cleanMessage = String(message ?? '').trim();

      if (!cleanMessage) {
        throw createHttpError(400, 'El mensaje es requerido');
      }

      const jid = normalizeBaileysDestination(destination);
      loggerInstance.info('baileys_outbound_started', { empresaId: id, destination: maskIdentifier(jid), textLength: cleanMessage.length });
      await session.sock.sendMessage(jid, { text: cleanMessage });
      loggerInstance.info('baileys_outbound_sent', { empresaId: id, destination: maskIdentifier(jid) });
      return {
        empresa_id: id,
        telefono_destino: destination,
        status: 'SENT',
        sent_at: new Date(now()).toISOString()
      };
    },

    async sendMedia() {
      throw createHttpError(501, 'El envio de multimedia por Baileys no esta implementado en esta fase');
    },

    async shutdown() {
      shuttingDown = true;
      for (const session of sessions.values()) {
        clearReconnectTimer(session);
        cleanupSocket(session);
        lastStatuses.set(session.companyId, session.state);
      }
      sessions.clear();
    },

    _sessions: sessions
  };
}

export const baileysService = createBaileysService();
