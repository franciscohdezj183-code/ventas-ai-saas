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
import { WHATSAPP_SESSION_STATUSES, normalizeCompanyId } from './whatsapp.types.js';
import { isTargetClosedError } from './whatsapp-startup.coordinator.js';

const UNREAD_POLL_INTERVAL_MS = Number(process.env.WHATSAPP_UNREAD_POLL_INTERVAL_MS ?? 3000);
const UNREAD_POLL_MESSAGE_LIMIT = Number(process.env.WHATSAPP_UNREAD_POLL_MESSAGE_LIMIT ?? 5);
export const WHATSAPP_EVENT_CONTROL = Symbol.for('ventas-ai.whatsapp-event-control');

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
  logger.info('whatsapp_authenticated_waiting_ready', { empresaId });
  return session;
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
    logger.error('whatsapp_unread_poll_reconnect_required', {
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

  function scheduleUnreadMessagePoll() {
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
          const state = await client.getState();
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
        logger.error('whatsapp_unread_poll_error', {
          empresaId,
          consecutiveFailures: consecutiveUnreadPollFailures,
          error
        });

        const clientContextLost =
          isTargetClosedError(error)
          || ['WHATSAPP_PAGE_CLOSED', 'WHATSAPP_NOT_CONNECTED', 'WHATSAPP_GETCHATS_UNAVAILABLE']
            .includes(error?.code);

        if (clientContextLost || consecutiveUnreadPollFailures >= 3) {
          markPollingConnectionLost(error);
        }
      } finally {
        unreadPollRunning = false;
        const currentSession = getSession(empresaId);

        if (
          !unreadPollStopped
          && currentSession?.client === client
          && currentSession?.status === WHATSAPP_SESSION_STATUSES.READY
        ) {
          scheduleUnreadMessagePoll();
        }
      }
    }, unreadPollIntervalMs);

    unreadPollTimer.unref?.();
  }

  client.on('qr', async (qr) => {
    if (getSession(empresaId)?.client !== client) {
      return;
    }

    const qrImage = await qrcode.toDataURL(qr);
    const session = setQr(empresaId, qr, qrImage);
    emitWhatsappQr(empresaId, { qrText: qr, qrImage, status: session.status });
    emitWhatsappStatus(empresaId, session);
    logger.info('whatsapp_qr_ready', { empresaId });
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
    logger.error('whatsapp_auth_failure', { empresaId, error: message });
  });

  client.on('ready', () => {
    if (getSession(empresaId)?.client !== client) {
      return;
    }

    markClientReady(empresaId, client);
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
