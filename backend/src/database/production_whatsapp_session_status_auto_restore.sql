-- WhatsApp session status production patch
-- Safe to run more than once on a database with the Nexus IA schema.
-- Adds the auto_restore flag used by the WhatsApp worker restore flow.

CREATE TABLE IF NOT EXISTS whatsapp_session_status (
  empresa_id BIGINT UNSIGNED NOT NULL,
  session_id VARCHAR(80) NULL,
  owner_instance VARCHAR(120) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DISCONNECTED',
  qr MEDIUMTEXT NULL,
  qr_image MEDIUMTEXT NULL,
  phone VARCHAR(80) NULL,
  auto_restore TINYINT(1) NOT NULL DEFAULT 0,
  connected_at DATETIME NULL,
  last_error TEXT NULL,
  reconnect_attempt INT UNSIGNED NOT NULL DEFAULT 0,
  next_reconnect_at DATETIME NULL,
  lease_until DATETIME NULL,
  heartbeat_at DATETIME NULL,
  last_qr_at DATETIME NULL,
  qr_expires_at DATETIME NULL,
  events_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (empresa_id),
  KEY whatsapp_session_status_owner_index (owner_instance),
  KEY whatsapp_session_status_auto_restore_index (auto_restore),
  KEY whatsapp_session_status_status_index (status),
  KEY whatsapp_session_status_lease_until_index (lease_until),
  KEY whatsapp_session_status_updated_at_index (updated_at),
  CONSTRAINT whatsapp_session_status_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE whatsapp_session_status ADD COLUMN auto_restore TINYINT(1) NOT NULL DEFAULT 0 AFTER phone',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'whatsapp_session_status'
    AND COLUMN_NAME = 'auto_restore'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE whatsapp_session_status ADD INDEX whatsapp_session_status_auto_restore_index (auto_restore)',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'whatsapp_session_status'
    AND INDEX_NAME = 'whatsapp_session_status_auto_restore_index'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
