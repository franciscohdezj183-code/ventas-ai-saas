import { query } from '../../config/database.js';
import { decryptField, encryptField } from '../../utils/crypto-field.js';

let statusTableReadyPromise = null;

export function baseWhatsappStatus(empresaId) {
  return {
    empresa_id: Number(empresaId),
    status: 'DISCONNECTED',
    qr: null,
    qr_image: null,
    phone: null,
    connected_at: null,
    last_error: null,
    reconnect_attempt: 0,
    next_reconnect_at: null,
    events: [],
    updated_at: new Date().toISOString()
  };
}

export async function ensureWhatsappStatusTable() {
  if (!statusTableReadyPromise) {
    statusTableReadyPromise = query(
      `CREATE TABLE IF NOT EXISTS whatsapp_session_status (
        empresa_id BIGINT UNSIGNED NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'DISCONNECTED',
        qr MEDIUMTEXT NULL,
        qr_image MEDIUMTEXT NULL,
        phone VARCHAR(80) NULL,
        connected_at DATETIME NULL,
        last_error TEXT NULL,
        reconnect_attempt INT UNSIGNED NOT NULL DEFAULT 0,
        next_reconnect_at DATETIME NULL,
        events_json JSON NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (empresa_id),
        KEY whatsapp_session_status_status_index (status),
        KEY whatsapp_session_status_updated_at_index (updated_at),
        CONSTRAINT whatsapp_session_status_empresa_foreign
          FOREIGN KEY (empresa_id) REFERENCES empresas (id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
  }

  return statusTableReadyPromise;
}

function mysqlDateTime(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function mapPersistedStatus(row) {
  if (!row) {
    return null;
  }

  let events = [];

  try {
    events = Array.isArray(row.events_json) ? row.events_json : JSON.parse(row.events_json ?? '[]');
  } catch {
    events = [];
  }

  return {
    empresa_id: row.empresa_id,
    status: row.status,
    qr: decryptField(row.qr),
    qr_image: decryptField(row.qr_image),
    phone: row.phone,
    connected_at: row.connected_at ? new Date(row.connected_at).toISOString() : null,
    last_error: row.last_error,
    reconnect_attempt: Number(row.reconnect_attempt ?? 0),
    next_reconnect_at: row.next_reconnect_at ? new Date(row.next_reconnect_at).toISOString() : null,
    events,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  };
}

export async function persistWhatsappStatus(state) {
  await ensureWhatsappStatusTable();
  await query(
    `INSERT INTO whatsapp_session_status
      (empresa_id, status, qr, qr_image, phone, connected_at, last_error,
       reconnect_attempt, next_reconnect_at, events_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       qr = VALUES(qr),
       qr_image = VALUES(qr_image),
       phone = VALUES(phone),
       connected_at = VALUES(connected_at),
       last_error = VALUES(last_error),
       reconnect_attempt = VALUES(reconnect_attempt),
       next_reconnect_at = VALUES(next_reconnect_at),
       events_json = VALUES(events_json),
       updated_at = VALUES(updated_at)`,
    [
      state.empresa_id,
      state.status,
      encryptField(state.qr),
      encryptField(state.qr_image),
      state.phone,
      mysqlDateTime(state.connected_at),
      state.last_error,
      Number(state.reconnect_attempt ?? 0),
      mysqlDateTime(state.next_reconnect_at),
      JSON.stringify(state.events ?? []),
      mysqlDateTime(state.updated_at)
    ]
  );
}

export async function getPersistedWhatsappStatus(empresaId) {
  await ensureWhatsappStatusTable();
  const [rows] = await query('SELECT * FROM whatsapp_session_status WHERE empresa_id = ? LIMIT 1', [empresaId]);
  return mapPersistedStatus(rows[0] ?? null);
}

export async function listPersistedWhatsappStatuses() {
  await ensureWhatsappStatusTable();
  const [rows] = await query('SELECT * FROM whatsapp_session_status ORDER BY updated_at DESC');
  return rows.map(mapPersistedStatus);
}
