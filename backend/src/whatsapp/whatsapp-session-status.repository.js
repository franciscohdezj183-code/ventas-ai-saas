import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { buildClientId, WHATSAPP_SESSION_STATUSES, normalizeCompanyId } from './whatsapp.types.js';

const LEGACY_STATUS_BY_INTERNAL = {
  [WHATSAPP_SESSION_STATUSES.IDLE]: 'DISCONNECTED',
  [WHATSAPP_SESSION_STATUSES.INITIALIZING]: 'INITIALIZING',
  [WHATSAPP_SESSION_STATUSES.QR]: 'QR_READY',
  [WHATSAPP_SESSION_STATUSES.AUTHENTICATED]: 'AUTHENTICATED',
  [WHATSAPP_SESSION_STATUSES.READY]: 'CONNECTED',
  [WHATSAPP_SESSION_STATUSES.DISCONNECTED]: 'DISCONNECTED',
  [WHATSAPP_SESSION_STATUSES.FAILED]: 'ERROR',
  [WHATSAPP_SESSION_STATUSES.DESTROYED]: 'DISCONNECTED'
};

const INTERNAL_STATUS_BY_LEGACY = {
  NOT_STARTED: WHATSAPP_SESSION_STATUSES.IDLE,
  DISCONNECTED: WHATSAPP_SESSION_STATUSES.DISCONNECTED,
  INITIALIZING: WHATSAPP_SESSION_STATUSES.INITIALIZING,
  WAITING_QR: WHATSAPP_SESSION_STATUSES.INITIALIZING,
  QR_READY: WHATSAPP_SESSION_STATUSES.QR,
  QR_EXPIRED: WHATSAPP_SESSION_STATUSES.QR,
  AUTHENTICATED: WHATSAPP_SESSION_STATUSES.AUTHENTICATED,
  CONNECTED: WHATSAPP_SESSION_STATUSES.READY,
  RECONNECTING: WHATSAPP_SESSION_STATUSES.INITIALIZING,
  LOADING_SCREEN: WHATSAPP_SESSION_STATUSES.INITIALIZING,
  AUTH_FAILED: WHATSAPP_SESSION_STATUSES.FAILED,
  ERROR: WHATSAPP_SESSION_STATUSES.FAILED
};

function shouldSkipDatabase() {
  return env.nodeEnv === 'test';
}

function toMysqlDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeStoredStatus(status) {
  const value = String(status ?? '').trim();

  if (!value) {
    return 'DISCONNECTED';
  }

  return LEGACY_STATUS_BY_INTERNAL[value] ?? value.toUpperCase();
}

export function mapStoredWhatsappStatusRow(row = {}) {
  const companyId = Number(row.empresa_id ?? row.companyId);
  const legacyStatus = normalizeStoredStatus(row.status);
  const internalStatus = INTERNAL_STATUS_BY_LEGACY[legacyStatus] ?? String(row.status ?? WHATSAPP_SESSION_STATUSES.DISCONNECTED).toLowerCase();

  return {
    empresa_id: companyId,
    companyId,
    clientId: row.session_id ?? buildClientId(companyId),
    status: internalStatus,
    status_normalized: internalStatus,
    legacy_status: legacyStatus,
    qr: row.qr ?? null,
    qrText: row.qr ?? null,
    qrImage: row.qr_image ?? null,
    qr_image: row.qr_image ?? null,
    qr_available: Boolean(row.qr || row.qr_image),
    phone: row.phone ?? null,
    phoneNumber: row.phone ?? null,
    connectedAt: row.connected_at ?? null,
    connected_at: row.connected_at ?? null,
    disconnectedAt: null,
    disconnected_at: null,
    lastError: row.last_error ?? null,
    last_error: row.last_error ?? null,
    updated_at: row.updated_at ?? null,
    started_at: null,
    isInitializing: ['INITIALIZING', 'WAITING_QR', 'AUTHENTICATED', 'RECONNECTING', 'LOADING_SCREEN'].includes(legacyStatus),
    auto_restore: Boolean(row.auto_restore),
    last_qr_at: row.last_qr_at ?? null,
    qr_expires_at: row.qr_expires_at ?? null,
    events: []
  };
}

export async function saveWhatsappSessionStatus(session) {
  if (shouldSkipDatabase() || !session?.companyId) {
    return;
  }

  const status = normalizeStoredStatus(session.status);

  await query(
    `INSERT INTO whatsapp_session_status
       (empresa_id, session_id, status, qr, qr_image, phone, connected_at, last_error, last_qr_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       session_id = VALUES(session_id),
       status = VALUES(status),
       qr = VALUES(qr),
       qr_image = VALUES(qr_image),
       phone = VALUES(phone),
       connected_at = VALUES(connected_at),
       last_error = VALUES(last_error),
       last_qr_at = VALUES(last_qr_at),
       updated_at = NOW()`,
    [
      normalizeCompanyId(session.companyId),
      session.clientId ?? buildClientId(session.companyId),
      status,
      session.qrText ?? session.qr ?? null,
      session.qrImage ?? null,
      session.phoneNumber ?? session.phone ?? null,
      toMysqlDate(session.connectedAt),
      session.lastError ?? null,
      status === 'QR_READY' ? toMysqlDate(new Date()) : null
    ]
  );
}

export async function getStoredWhatsappSessionStatus(companyId) {
  if (shouldSkipDatabase()) {
    return null;
  }

  const [rows] = await query(
    `SELECT empresa_id, session_id, status, qr, qr_image, phone, connected_at,
            last_error, auto_restore, last_qr_at, qr_expires_at, updated_at
     FROM whatsapp_session_status
     WHERE empresa_id = ?
     LIMIT 1`,
    [normalizeCompanyId(companyId)]
  );

  return rows[0] ? mapStoredWhatsappStatusRow(rows[0]) : null;
}

export async function listStoredWhatsappSessionStatuses({ companyId = null } = {}) {
  if (shouldSkipDatabase()) {
    return [];
  }

  const params = [];
  const companyFilter = companyId ? 'AND e.id = ?' : '';

  if (companyId) {
    params.push(normalizeCompanyId(companyId));
  }

  const [rows] = await query(
    `SELECT e.id AS empresa_id,
            COALESCE(w.session_id, CONCAT('company_', e.id)) AS session_id,
            COALESCE(w.status, 'DISCONNECTED') AS status,
            w.qr,
            w.qr_image,
            w.phone,
            w.connected_at,
            w.last_error,
            COALESCE(w.auto_restore, 0) AS auto_restore,
            w.last_qr_at,
            w.qr_expires_at,
            COALESCE(w.updated_at, e.fecha_actualizacion, e.fecha_creacion) AS updated_at
     FROM empresas e
     LEFT JOIN whatsapp_session_status w ON w.empresa_id = e.id
     WHERE e.activo = 1
       ${companyFilter}
     ORDER BY e.id ASC`,
    params
  );

  return rows.map(mapStoredWhatsappStatusRow);
}
