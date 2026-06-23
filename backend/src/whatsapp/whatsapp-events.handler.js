import qrcode from 'qrcode';
import { logger } from '../utils/logger.js';
import { handleIncomingWhatsappMessage } from './whatsapp-message.handler.js';
import {
  clearQr,
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

export function registerWhatsappClientEvents({ companyId, client }) {
  const empresaId = normalizeCompanyId(companyId);

  client.on('qr', async (qr) => {
    const qrImage = await qrcode.toDataURL(qr);
    const session = setQr(empresaId, qr, qrImage);
    emitWhatsappQr(empresaId, { qrText: qr, qrImage, status: session.status });
    emitWhatsappStatus(empresaId, session);
    logger.info('whatsapp_qr_ready', { empresaId });
  });

  client.on('authenticated', () => {
    markClientReady(empresaId, client, 'authenticated');
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
      await handleIncomingWhatsappMessage({ companyId: empresaId, client, message });
    } catch (error) {
      upsertSession(empresaId, {
        lastError: error instanceof Error ? error.message : String(error ?? 'Error procesando mensaje')
      });
      emitWhatsappError(empresaId, error);
      logger.error('whatsapp_message_processing_error', {
        empresaId,
        error
      });
    }
  });
}
