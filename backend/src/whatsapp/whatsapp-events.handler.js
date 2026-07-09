import qrcode from 'qrcode';
import { logger } from '../utils/logger.js';
import { handleIncomingWhatsappMessage } from './whatsapp-message.handler.js';
import {
  clearQr,
  getSession,
  setError,
  setQr,
  setStatus,
  upsertSession
} from './whatsapp-session.store.js';
import {
  emitWhatsappError,
  emitWhatsappLog,
  emitWhatsappQr,
  emitWhatsappStatus
} from './whatsapp-socket.gateway.js';
import { saveWhatsappSessionStatus } from './whatsapp-session-status.repository.js';
import { WHATSAPP_SESSION_STATUSES, normalizeCompanyId } from './whatsapp.types.js';
import {
  backoffWithJitter,
  isTargetClosedError,
  wait
} from './whatsapp-startup.coordinator.js';

const UNREAD_POLL_INTERVAL_MS = Number(process.env.WHATSAPP_UNREAD_POLL_INTERVAL_MS ?? 3000);
const UNREAD_POLL_MESSAGE_LIMIT = Number(process.env.WHATSAPP_UNREAD_POLL_MESSAGE_LIMIT ?? 5);
export const WHATSAPP_EVENT_CONTROL = Symbol.for('ventas-ai.whatsapp-event-control');

function pollingContextMaxRecoveryFailures() {
  return Math.max(1, Number(process.env.WHATSAPP_POLLING_CONTEXT_MAX_RECOVERY_FAILURES ?? 3) || 3);
}

function isPollingStoreUnavailableError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  return message.includes("reading 'getchats'")
    || message.includes('getchats is unavailable')
    || (message.includes('store') && message.includes('getchats'));
}

function buildPollingContextLostError(error) {
  const wrapped = error instanceof Error
    ? error
    : new Error(String(error ?? 'WhatsApp polling context lost'));
  if (!wrapped.code && isTargetClosedError(wrapped)) {
    wrapped.code = 'WHATSAPP_CONTEXT_LOST';
  }
  return wrapped;
}

function getConnectedPhoneNumber(client) {
  const wid = client.info?.wid ?? client.info?.me;
  const phone = wid?.user ?? String(wid?._serialized ?? '').replace('@c.us', '');
  return phone || null;
}

function markClientReady(empresaId, client, source = 'ready') {
  clearQr(empresaId);
  const session = setStatus(empresaId, WHATSAPP_SESSION_STATUSES.READY, {
    connectedAt: new Date().toISOString(),
    disconnectedAt: null,
    phoneNumber: getConnectedPhoneNumber(client),
    lastError: null,
    isInitializing: false
  });
  emitWhatsappStatus(empresaId, session);
  saveWhatsappSessionStatus(session).catch((error) => {
    logger.error('whatsapp_status_persist_error', { empresaId, error });
  });
  logger.info('whatsapp_ready', { empresaId, source });
  return session;
}

function markClientAuthenticated(empresaId) {
  clearQr(empresaId);
  const session = setStatus(empresaId, WHATSAPP_SESSION_STATUSES.AUTHENTICATED, {
    lastError: null,
    isInitializing: true
  });
  emitWhatsappStatus(empresaId, session);
  saveWhatsappSessionStatus(session).catch((error) => {
    logger.error('whatsapp_status_persist_error', { empresaId, error });
  });
  logger.info('whatsapp_authenticated_waiting_ready', { empresaId });
  return session;
}

function markClientReadyOnce(empresaId, client, source) {
  const currentSession = getSession(empresaId);

  if (currentSession?.client !== client) {
    return null;
  }

  if (currentSession.status === WHATSAPP_SESSION_STATUSES.READY) {
    return currentSession;
  }

  return markClientReady(empresaId, client, source);
}

function scheduleReadyStateProbe(empresaId, client, onReadyDetected, attemptsLeft = 60) {
  const timer = setTimeout(async () => {
    try {
      const currentSession = getSession(empresaId);

      if (currentSession?.client !== client || currentSession?.status === WHATSAPP_SESSION_STATUSES.READY) {
        return;
      }

      const state = client.getState ? await client.getState() : null;
      const phoneNumber = getConnectedPhoneNumber(client);

      logger.info('whatsapp_ready_probe', {
        empresaId,
        state,
        hasPhoneNumber: Boolean(phoneNumber),
        attemptsLeft
      });

      if (state === 'CONNECTED' && phoneNumber) {
        markClientReady(empresaId, client, 'state_probe');
        onReadyDetected?.();
        return;
      }

      if (state === 'CONNECTED') {
        logger.info('whatsapp_state_connected_waiting_ready_event', {
          empresaId,
          hasPhoneNumber: Boolean(phoneNumber)
        });
      }

      if (attemptsLeft > 1) {
        scheduleReadyStateProbe(empresaId, client, onReadyDetected, attemptsLeft - 1);
        return;
      }

      const session = setError(empresaId, 'WhatsApp autentico, pero el cliente web no emitio ready');
      emitWhatsappError(empresaId, session.lastError);
      emitWhatsappStatus(empresaId, session);
      saveWhatsappSessionStatus(session).catch((persistError) => {
        logger.error('whatsapp_status_persist_error', { empresaId, error: persistError });
      });
      logger.error('whatsapp_ready_timeout', {
        empresaId,
        state,
        hasPhoneNumber: Boolean(phoneNumber)
      });
    } catch (error) {
      logger.error('whatsapp_ready_probe_error', {
        empresaId,
        error
      });

      if (attemptsLeft > 1) {
        scheduleReadyStateProbe(empresaId, client, onReadyDetected, attemptsLeft - 1);
      }
    }
  }, 1000);
  timer.unref?.();
}

function getMessageKey(message) {
  return message?.id?._serialized
    ?? message?.id?.id
    ?? [
      message?.from,
      message?.to,
      message?.timestamp,
      String(message?.body ?? '').slice(0, 80)
    ].filter(Boolean).join(':');
}

export function registerWhatsappClientEvents({
  companyId,
  client,
  onReady = null,
  onDisconnected = null,
  unreadPollIntervalMs = UNREAD_POLL_INTERVAL_MS,
  unreadPollMessageLimit = UNREAD_POLL_MESSAGE_LIMIT,
  onIncomingMessage = handleIncomingWhatsappMessage
}) {
  const empresaId = normalizeCompanyId(companyId);
  const handledMessageKeys = new Set();
  let consecutiveUnreadPollFailures = 0;
  let unreadPollTimer = null;
  let unreadPollStopped = false;
  let unreadPollRunning = false;
  let unreadPollBackoffDelayMs = null;

  function stopUnreadMessagePoll() {
    unreadPollStopped = true;
    if (unreadPollTimer) {
      clearTimeout(unreadPollTimer);
      unreadPollTimer = null;
    }
  }

  function resumeUnreadMessagePoll() {
    unreadPollStopped = false;
    scheduleUnreadMessagePoll();
  }

  async function probeClientStateAfterPollingError(error) {
    const delayMs = backoffWithJitter(consecutiveUnreadPollFailures, {
      baseDelayMs: Number(process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_BASE_MS ?? 2000),
      maxDelayMs: Number(process.env.WHATSAPP_POLLING_CONTEXT_BACKOFF_MAX_MS ?? 15000),
      jitterRatio: 0.1
    });
    logger.warn('whatsapp_polling_context_lost', {
      empresaId,
      consecutiveFailures: consecutiveUnreadPollFailures,
      delayMs,
      error: error instanceof Error ? error.message : String(error ?? 'unknown')
    });

    await wait(delayMs);
    unreadPollBackoffDelayMs = null;

    const currentSession = getSession(empresaId);
    if (currentSession?.client !== client || unreadPollStopped) {
      return;
    }

    let state = null;
    try {
      state = client.getState ? await client.getState() : null;
    } catch (probeError) {
      markPollingConnectionLost(probeError);
      return;
    }

    if ((!state || state === 'CONNECTED') && isPollingStoreUnavailableError(error)) {
      logger.warn('whatsapp_polling_store_unavailable', {
        empresaId,
        state,
        consecutiveFailures: consecutiveUnreadPollFailures,
        maxRecoveryFailures: pollingContextMaxRecoveryFailures(),
        error: error instanceof Error ? error.message : String(error ?? 'unknown')
      });

      if (consecutiveUnreadPollFailures >= pollingContextMaxRecoveryFailures()) {
        markPollingConnectionLost(error);
      }
      return;
    }

    if (!state || state === 'CONNECTED') {
      consecutiveUnreadPollFailures = 0;
      upsertSession(empresaId, { lastError: null });
      logger.info('whatsapp_polling_context_recovered', { empresaId, state });
      return;
    }

    const disconnected = new Error(`WhatsApp client state is ${state}`);
    disconnected.code = 'WHATSAPP_NOT_CONNECTED';
    markPollingConnectionLost(disconnected);
  }

  function markPollingConnectionLost(error) {
    if (unreadPollStopped) {
      return;
    }

    stopUnreadMessagePoll();
    const reason = `WhatsApp web perdio el contexto durante polling: ${error?.message ?? error}`;
    const currentSession = getSession(empresaId);

    if (
      currentSession?.client !== client
      || currentSession?.status === WHATSAPP_SESSION_STATUSES.DISCONNECTED
    ) {
      return;
    }

    const session = setStatus(empresaId, WHATSAPP_SESSION_STATUSES.DISCONNECTED, {
      disconnectedAt: new Date().toISOString(),
      phoneNumber: null,
      lastError: reason,
      isInitializing: false
    });
    emitWhatsappError(empresaId, reason);
    emitWhatsappStatus(empresaId, session);
    logger.warn('whatsapp_unread_poll_reconnect_required', {
      empresaId,
      consecutiveFailures: consecutiveUnreadPollFailures,
      reason
    });
    onDisconnected?.({ empresaId, client, reason });
  }

  async function handleWhatsappMessageEvent(message, source) {
    const messageKey = getMessageKey(message);
    const receivedAt = new Date().toISOString();
    const hasBody = Boolean(message?.body?.trim());

    upsertSession(empresaId, { lastInboundAt: receivedAt });

    logger.info('whatsapp_message_event_received', {
      empresaId,
      source,
      from: message?.from ?? null,
      to: message?.to ?? null,
      id: message?.id?._serialized ?? message?.id?.id ?? null,
      fromMe: Boolean(message?.fromMe),
      hasBody,
      type: message?.type ?? null
    });

    if (messageKey && handledMessageKeys.has(messageKey)) {
      logger.info('whatsapp_message_event_duplicate_ignored', {
        empresaId,
        source,
        messageKey
      });
      return;
    }

    if (messageKey) {
      handledMessageKeys.add(messageKey);

      if (handledMessageKeys.size > 500) {
        handledMessageKeys.delete(handledMessageKeys.values().next().value);
      }
    }

    await onIncomingMessage({ companyId: empresaId, client, message });
    const processedAt = new Date().toISOString();
    upsertSession(empresaId, { lastProcessedAt: processedAt });
    logger.info('whatsapp_message_event_processed', {
      empresaId,
      source,
      messageKey,
      lastProcessedAt: processedAt
    });
  }

  function scheduleUnreadMessagePoll(delayMs = unreadPollIntervalMs) {
    if (
      unreadPollStopped
      || unreadPollTimer
      || unreadPollRunning
      || !unreadPollIntervalMs
      || unreadPollIntervalMs < 10
    ) {
      return;
    }

    unreadPollTimer = setTimeout(async () => {
      unreadPollTimer = null;
      unreadPollRunning = true;
      try {
        const currentSession = getSession(empresaId);

        if (currentSession?.client !== client) {
          stopUnreadMessagePoll();
          return;
        }

        if (currentSession?.status !== WHATSAPP_SESSION_STATUSES.READY) {
          return;
        }

        if (client.pupPage?.isClosed?.()) {
          const error = new Error('WhatsApp browser page is closed');
          error.code = 'WHATSAPP_PAGE_CLOSED';
          throw error;
        }

        if (client.getState) {
          let state = null;
          try {
            state = await client.getState();
          } catch (error) {
            throw buildPollingContextLostError(error);
          }
          if (state && state !== 'CONNECTED') {
            const error = new Error(`WhatsApp client state is ${state}`);
            error.code = 'WHATSAPP_NOT_CONNECTED';
            throw error;
          }
        }

        if (typeof client.getChats !== 'function') {
          const error = new Error('WhatsApp client getChats is unavailable');
          error.code = 'WHATSAPP_GETCHATS_UNAVAILABLE';
          throw error;
        }

        const chats = await client.getChats();
        consecutiveUnreadPollFailures = 0;
        const unreadChats = chats.filter((chat) => Number(chat?.unreadCount ?? 0) > 0);

        if (unreadChats.length > 0) {
          logger.info('whatsapp_unread_poll_found_chats', {
            empresaId,
            chats: unreadChats.length
          });
        }

        for (const chat of unreadChats) {
          if (!chat?.fetchMessages) {
            continue;
          }

          const limit = Math.max(1, Math.min(Number(chat.unreadCount ?? 1), unreadPollMessageLimit));
          const messages = await chat.fetchMessages({ limit });
          const orderedMessages = [...messages].sort((left, right) => Number(left?.timestamp ?? 0) - Number(right?.timestamp ?? 0));
          let processedMessages = 0;

          for (const message of orderedMessages) {
            if (message?.fromMe || !message?.body?.trim()) {
              continue;
            }

            await handleWhatsappMessageEvent(message, 'unread_poll');
            processedMessages += 1;
          }

          if (processedMessages > 0) {
            try {
              if (chat.sendSeen) {
                await chat.sendSeen();
              } else if (client.sendSeen && chat.id?._serialized) {
                await client.sendSeen(chat.id._serialized);
              }
            } catch (error) {
              logger.error('whatsapp_unread_poll_mark_seen_error', {
                empresaId,
                chatId: chat.id?._serialized ?? null,
                error
              });
            }
          }
        }
      } catch (error) {
        consecutiveUnreadPollFailures += 1;
        const clientContextLost =
          isTargetClosedError(error)
          || ['WHATSAPP_PAGE_CLOSED', 'WHATSAPP_NOT_CONNECTED', 'WHATSAPP_GETCHATS_UNAVAILABLE', 'WHATSAPP_CONTEXT_LOST']
            .includes(error?.code);

        logger[clientContextLost ? 'warn' : 'error']('whatsapp_unread_poll_error', {
          empresaId,
          consecutiveFailures: consecutiveUnreadPollFailures,
          error
        });

        if (clientContextLost) {
          await probeClientStateAfterPollingError(error);
        } else if (consecutiveUnreadPollFailures >= 3) {
          markPollingConnectionLost(error);
        }
      } finally {
        unreadPollRunning = false;
        const currentSession = getSession(empresaId);
        const delayMs = unreadPollBackoffDelayMs ?? unreadPollIntervalMs;
        unreadPollBackoffDelayMs = null;

        if (
          !unreadPollStopped
          && currentSession?.client === client
          && currentSession?.status === WHATSAPP_SESSION_STATUSES.READY
        ) {
          scheduleUnreadMessagePoll(delayMs);
        }
      }
    }, delayMs);

    unreadPollTimer.unref?.();
  }

  client.on('qr', async (qr) => {
    if (getSession(empresaId)?.client !== client) {
      return;
    }

    try {
      const qrImage = await qrcode.toDataURL(qr);
      const session = setQr(empresaId, qr, qrImage);
      emitWhatsappQr(empresaId, { qrText: qr, qrImage, status: session.status });
      emitWhatsappStatus(empresaId, session);
      saveWhatsappSessionStatus(session).catch((error) => {
        logger.error('whatsapp_status_persist_error', { empresaId, error });
      });
      logger.info('whatsapp_qr_ready', { empresaId });
    } catch (error) {
      logger.error('whatsapp_qr_generation_error', { empresaId, error });
      emitWhatsappError(empresaId, error);
    }
  });

  client.on('authenticated', () => {
    if (getSession(empresaId)?.client !== client) {
      return;
    }

    markClientAuthenticated(empresaId);
    scheduleReadyStateProbe(empresaId, client, () => {
      resumeUnreadMessagePoll();
      onReady?.({ empresaId, client });
    });
    logger.info('whatsapp_authenticated', { empresaId });
  });

  client.on('auth_failure', (message) => {
    if (getSession(empresaId)?.client !== client) {
      return;
    }

    stopUnreadMessagePoll();
    clearQr(empresaId);
    const session = setError(empresaId, message || 'Fallo de autenticacion');
    emitWhatsappError(empresaId, message || 'Fallo de autenticacion');
    emitWhatsappStatus(empresaId, session);
    saveWhatsappSessionStatus(session).catch((error) => {
      logger.error('whatsapp_status_persist_error', { empresaId, error });
    });
    logger.error('whatsapp_auth_failure', { empresaId, error: message });
  });

  client.on('ready', () => {
    if (getSession(empresaId)?.client !== client) {
      return;
    }

    markClientReadyOnce(empresaId, client, 'ready');
    resumeUnreadMessagePoll();
    onReady?.({ empresaId, client });
  });

  client.on('disconnected', (reason) => {
    if (getSession(empresaId)?.client !== client) {
      return;
    }

    stopUnreadMessagePoll();
    clearQr(empresaId);
    const session = setStatus(empresaId, WHATSAPP_SESSION_STATUSES.DISCONNECTED, {
      disconnectedAt: new Date().toISOString(),
      phoneNumber: null,
      lastError: reason || null,
      isInitializing: false
    });
    emitWhatsappError(empresaId, reason || 'WhatsApp desconectado');
    emitWhatsappStatus(empresaId, session);
    saveWhatsappSessionStatus(session).catch((error) => {
      logger.error('whatsapp_status_persist_error', { empresaId, error });
    });
    logger.info('whatsapp_disconnected', { empresaId, reason });
    onDisconnected?.({ empresaId, client, reason });
  });

  client.on('loading_screen', (percent, message) => {
    if (getSession(empresaId)?.status === WHATSAPP_SESSION_STATUSES.READY) {
      stopUnreadMessagePoll();
    }
    upsertSession(empresaId, { lastError: null });
    emitWhatsappLog(empresaId, { event: 'loading_screen', percent, message });
    logger.info('whatsapp_loading_screen', {
      empresaId,
      percent,
      message
    });
  });

  client.on('change_state', (state) => {
    emitWhatsappLog(empresaId, { event: 'change_state', state });
    logger.info('whatsapp_change_state', { empresaId, state });

    if (state === 'CONNECTED') {
      const markedSession = markClientReadyOnce(empresaId, client, 'change_state_connected');
      if (markedSession) {
        resumeUnreadMessagePoll();
        onReady?.({ empresaId, client });
      }
    }

    if (state === 'CONNECTED' && getSession(empresaId)?.status === WHATSAPP_SESSION_STATUSES.READY) {
      resumeUnreadMessagePoll();
    }
  });

  client.on('message', async (message) => {
    try {
      await handleWhatsappMessageEvent(message, 'message');
    } catch (error) {
      upsertSession(empresaId, {
        lastError: error instanceof Error ? error.message : String(error ?? 'Error procesando mensaje')
      });
      emitWhatsappError(empresaId, error);
      logger.error('whatsapp_message_processing_error', {
        empresaId,
        source: 'message',
        error
      });
      if (isTargetClosedError(error)) {
        consecutiveUnreadPollFailures += 1;
        markPollingConnectionLost(error);
      }
    }
  });

  client.on('message_create', async (message) => {
    try {
      await handleWhatsappMessageEvent(message, 'message_create');
    } catch (error) {
      upsertSession(empresaId, {
        lastError: error instanceof Error ? error.message : String(error ?? 'Error procesando mensaje')
      });
      emitWhatsappError(empresaId, error);
      logger.error('whatsapp_message_processing_error', {
        empresaId,
        source: 'message_create',
        error
      });
      if (isTargetClosedError(error)) {
        consecutiveUnreadPollFailures += 1;
        markPollingConnectionLost(error);
      }
    }
  });

  const control = {
    stop: stopUnreadMessagePoll,
    resume: resumeUnreadMessagePoll
  };
  client[WHATSAPP_EVENT_CONTROL] = control;
  return control;
}
