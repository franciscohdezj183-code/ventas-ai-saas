import { WHATSAPP_SESSION_STATUSES, buildClientId, normalizeCompanyId } from './whatsapp.types.js';

const sessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function createBaseSession(companyId) {
  const id = normalizeCompanyId(companyId);

  return {
    companyId: id,
    clientId: buildClientId(id),
    status: WHATSAPP_SESSION_STATUSES.IDLE,
    qr: null,
    qrText: null,
    qrImage: null,
    client: null,
    lastError: null,
    startedAt: null,
    connectedAt: null,
    disconnectedAt: null,
    phoneNumber: null,
    isInitializing: false
  };
}

function toPublicSession(session) {
  const publicSession = {
    companyId: session.companyId,
    clientId: session.clientId,
    status: session.status,
    qr: session.qr,
    qrText: session.qrText ?? session.qr,
    qrImage: session.qrImage,
    lastError: session.lastError,
    startedAt: session.startedAt,
    connectedAt: session.connectedAt,
    disconnectedAt: session.disconnectedAt,
    phoneNumber: session.phoneNumber,
    phone: session.phoneNumber,
    number: session.phoneNumber,
    telefono: session.phoneNumber,
    isInitializing: Boolean(session.isInitializing)
  };

  return publicSession;
}

export function getSession(companyId) {
  return sessions.get(normalizeCompanyId(companyId)) ?? null;
}

export function getPublicSession(companyId) {
  return toPublicSession(getSession(companyId) ?? createBaseSession(companyId));
}

export function upsertSession(companyId, patch = {}) {
  const id = normalizeCompanyId(companyId);
  const current = sessions.get(id) ?? createBaseSession(id);
  const next = {
    ...current,
    ...patch,
    companyId: id,
    clientId: current.clientId ?? buildClientId(id)
  };

  if (patch.status) {
    next.isInitializing =
      patch.status === WHATSAPP_SESSION_STATUSES.INITIALIZING ||
      patch.status === WHATSAPP_SESSION_STATUSES.AUTHENTICATED;
  }

  sessions.set(id, next);
  return next;
}

export function setClient(companyId, client) {
  return upsertSession(companyId, { client });
}

export function setStatus(companyId, status, patch = {}) {
  return upsertSession(companyId, {
    status,
    lastError: status === WHATSAPP_SESSION_STATUSES.FAILED ? patch.lastError ?? null : patch.lastError ?? null,
    ...patch
  });
}

export function setQr(companyId, qr, qrImage = null) {
  return upsertSession(companyId, {
    status: WHATSAPP_SESSION_STATUSES.QR,
    qr,
    qrText: qr,
    qrImage,
    lastError: null,
    isInitializing: false
  });
}

export function setError(companyId, error) {
  const message = error instanceof Error ? error.message : String(error ?? 'Error desconocido');

  return upsertSession(companyId, {
    status: WHATSAPP_SESSION_STATUSES.FAILED,
    lastError: message,
    isInitializing: false
  });
}

export function clearQr(companyId) {
  return upsertSession(companyId, {
    qr: null,
    qrText: null,
    qrImage: null
  });
}

export function removeSession(companyId) {
  const id = normalizeCompanyId(companyId);
  const current = sessions.get(id);
  sessions.delete(id);

  return current ?? createBaseSession(id);
}

export function listPublicSessions() {
  return Array.from(sessions.values()).map(toPublicSession);
}

export function markStarted(companyId, client) {
  return upsertSession(companyId, {
    client,
    status: WHATSAPP_SESSION_STATUSES.INITIALIZING,
    qr: null,
    qrText: null,
    qrImage: null,
    startedAt: nowIso(),
    disconnectedAt: null,
    lastError: null,
    isInitializing: true
  });
}

export function resetStoreForTests() {
  sessions.clear();
}
