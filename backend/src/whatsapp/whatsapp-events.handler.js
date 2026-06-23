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

function scheduleReadyStateProbe(empresaId, client, attemptsLeft = 60) {
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
        return;
      }

      if (state === 'CONNECTED') {
        logger.info('whatsapp_state_connected_waiting_ready_event', {
          empresaId,
          hasPhoneNumber: Boolean(phoneNumber)
        });
      }

      if (attemptsLeft > 1) {
        scheduleReadyStateProbe(empresaId, client, attemptsLeft - 1);
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
        scheduleReadyStateProbe(empresaId, client, attemptsLeft - 1);
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

export function registerWhatsappClientEvents({ companyId, client }) {
  const empresaId = normalizeCompanyId(companyId);
  const handledMessageKeys = new Set();

  async function handleWhatsappMessageEvent(message, source) {
    const messageKey = getMessageKey(message);
    const receivedAt = new Date().toISOString();

    upsertSession(empresaId, { lastInboundAt: receivedAt });

    logger.info('whatsapp_message_event_received', {
      empresaId,
      source,
      from: message?.from ?? null,
      to: message?.to ?? null,
      id: message?.id?._serialized ?? message?.id?.id ?? null,
      fromMe: Boolean(message?.fromMe),
      hasBody: Boolean(message?.body?.trim()),
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

    await handleIncomingWhatsappMessage({ companyId: empresaId, client, message });
    upsertSession(empresaId, { lastProcessedAt: new Date().toISOString() });
  }

  client.on('qr', async (qr) => {
    const qrImage = await qrcode.toDataURL(qr);
    const session = setQr(empresaId, qr, qrImage);
    emitWhatsappQr(empresaId, { qrText: qr, qrImage, status: session.status });
    emitWhatsappStatus(empresaId, session);
    logger.info('whatsapp_qr_ready', { empresaId });
  });

  client.on('authenticated', () => {
    markClientAuthenticated(empresaId);
    scheduleReadyStateProbe(empresaId, client);
    logger.info('whatsapp_authenticated', { empresaId });
  });

  client.on('auth_failure', (message) => {
    clearQr(empresaId);
    const session = setError(empresaId, message || 'Fallo de autenticacion');
    emitWhatsappError(empresaId, message || 'Fallo de autenticacion');
    emitWhatsappStatus(empresaId, session);
    logger.error('whatsapp_auth_failure', { empresaId, error: message });
  });

  client.on('ready', () => {
    markClientReady(empresaId, client);
  });

  client.on('disconnected', (reason) => {
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
  });

  client.on('loading_screen', (percent, message) => {
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
    }
  });
}
