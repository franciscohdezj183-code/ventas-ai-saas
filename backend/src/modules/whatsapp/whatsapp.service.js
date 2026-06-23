// Legacy/deprecated compatibility facade.
// The WhatsApp session owner now lives in backend/src/whatsapp/whatsapp-session.manager.js.
// Keep this file only to avoid breaking older imports while the app migrates module by module.

import {
  disconnectSession,
  destroySession,
  getQr,
  getSessionStatus,
  getWhatsappHealthSummary,
  listSessions,
  restartSession,
  sendWhatsappMessage,
  shutdownWhatsappSessions,
  startSession
} from '../../whatsapp/whatsapp-session.manager.js';
import { getPublicSession, listPublicSessions } from '../../whatsapp/whatsapp-session.store.js';
import { WHATSAPP_SESSION_STATUSES } from '../../whatsapp/whatsapp.types.js';

export { getWhatsappHealthSummary, sendWhatsappMessage, shutdownWhatsappSessions };

function toLegacyStatus(status) {
  const statusMap = {
    [WHATSAPP_SESSION_STATUSES.IDLE]: 'DISCONNECTED',
    [WHATSAPP_SESSION_STATUSES.INITIALIZING]: 'INITIALIZING',
    [WHATSAPP_SESSION_STATUSES.QR]: 'QR_READY',
    [WHATSAPP_SESSION_STATUSES.AUTHENTICATED]: 'AUTHENTICATED',
    [WHATSAPP_SESSION_STATUSES.READY]: 'CONNECTED',
    [WHATSAPP_SESSION_STATUSES.DISCONNECTED]: 'DISCONNECTED',
    [WHATSAPP_SESSION_STATUSES.FAILED]: 'ERROR',
    [WHATSAPP_SESSION_STATUSES.DESTROYED]: 'DISCONNECTED'
  };

  return {
    empresa_id: status.companyId,
    companyId: status.companyId,
    status: statusMap[status.status] ?? status.status,
    status_normalized: status.status,
    qr: status.qr,
    qr_image: status.qrImage,
    qr_available: Boolean(status.qr || status.qrImage),
    phone: status.phoneNumber,
    phoneNumber: status.phoneNumber,
    connected_at: status.connectedAt,
    disconnected_at: status.disconnectedAt,
    last_error: status.lastError,
    lastError: status.lastError,
    updated_at: status.connectedAt ?? status.disconnectedAt ?? status.startedAt ?? new Date().toISOString(),
    started_at: status.startedAt,
    isInitializing: status.isInitializing,
    events: []
  };
}

export async function getWhatsappStatusSnapshot(companyId) {
  return toLegacyStatus(await getSessionStatus(companyId));
}

export function getWhatsappStatus(companyId) {
  return toLegacyStatus(getPublicSession(companyId));
}

export function listWhatsappStatuses() {
  return listPublicSessions().map(toLegacyStatus);
}

export async function listWhatsappStatusSnapshots() {
  return (await listSessions()).map(toLegacyStatus);
}

export async function startWhatsappSession(companyId) {
  return toLegacyStatus(await startSession(companyId));
}

export async function restartWhatsappSession(companyId) {
  return toLegacyStatus(await restartSession(companyId));
}

export async function disconnectWhatsappSession(companyId) {
  return toLegacyStatus(await disconnectSession(companyId));
}

export async function destroyWhatsappSession(companyId) {
  return toLegacyStatus(await destroySession(companyId));
}

export async function getWhatsappQr(companyId) {
  const qr = await getQr(companyId);
  return {
    empresa_id: qr.companyId,
    companyId: qr.companyId,
    status: qr.status,
    qr: qr.qr,
    qr_image: qr.qrImage,
    qrImage: qr.qrImage,
    qr_available: Boolean(qr.qr || qr.qrImage)
  };
}

export async function requestWhatsappSessionCommand(companyId, command) {
  const normalizedCommand = String(command ?? '').toUpperCase();

  if (normalizedCommand === 'START') {
    return startWhatsappSession(companyId);
  }

  if (normalizedCommand === 'RESTART') {
    return restartWhatsappSession(companyId);
  }

  if (normalizedCommand === 'STOP') {
    return disconnectWhatsappSession(companyId);
  }

  if (normalizedCommand === 'LOGOUT') {
    return destroyWhatsappSession(companyId);
  }

  return getWhatsappStatusSnapshot(companyId);
}

export async function processPendingWhatsappCommands() {
  return 0;
}

export async function processPendingWhatsappOutboundMessages() {
  return 0;
}
