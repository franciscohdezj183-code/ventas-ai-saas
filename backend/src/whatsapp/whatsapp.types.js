import { createHttpError } from '../utils/http-error.js';

export const WHATSAPP_SESSION_STATUSES = Object.freeze({
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  QR: 'qr',
  AUTHENTICATED: 'authenticated',
  READY: 'ready',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  DESTROYED: 'destroyed'
});

export const ACTIVE_SESSION_STATUSES = new Set([
  WHATSAPP_SESSION_STATUSES.INITIALIZING,
  WHATSAPP_SESSION_STATUSES.QR,
  WHATSAPP_SESSION_STATUSES.AUTHENTICATED,
  WHATSAPP_SESSION_STATUSES.READY
]);

export function normalizeCompanyId(companyId) {
  const id = Number(companyId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return id;
}

export function buildClientId(companyId) {
  return `company_${normalizeCompanyId(companyId)}`;
}

export function normalizePhoneForWhatsapp(phone) {
  const value = String(phone ?? '').trim();

  if (value.includes('@')) {
    return value;
  }

  const cleanPhone = String(phone ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');

  if (!cleanPhone) {
    throw createHttpError(400, 'El telefono destino es requerido');
  }

  return `${cleanPhone}@c.us`;
}

export function cleanWhatsappPhone(phone) {
  return String(phone ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}
