SET @sql = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE whatsapp_session_status ADD COLUMN session_id VARCHAR(80) NULL AFTER empresa_id', 'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_session_status' AND COLUMN_NAME = 'session_id'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE whatsapp_session_status ADD COLUMN owner_instance VARCHAR(120) NULL AFTER session_id', 'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_session_status' AND COLUMN_NAME = 'owner_instance'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE whatsapp_session_status ADD COLUMN lease_until DATETIME NULL AFTER next_reconnect_at', 'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_session_status' AND COLUMN_NAME = 'lease_until'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE whatsapp_session_status ADD COLUMN heartbeat_at DATETIME NULL AFTER lease_until', 'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_session_status' AND COLUMN_NAME = 'heartbeat_at'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE whatsapp_session_status ADD COLUMN last_qr_at DATETIME NULL AFTER heartbeat_at', 'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_session_status' AND COLUMN_NAME = 'last_qr_at'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE whatsapp_session_status ADD COLUMN qr_expires_at DATETIME NULL AFTER last_qr_at', 'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_session_status' AND COLUMN_NAME = 'qr_expires_at'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS whatsapp_session_commands (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  command VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  requested_by BIGINT UNSIGNED NULL,
  requested_by_role VARCHAR(40) NULL,
  owner_instance VARCHAR(120) NULL,
  error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at DATETIME NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY whatsapp_session_commands_pending_index (status, created_at),
  KEY whatsapp_session_commands_empresa_index (empresa_id, created_at),
  CONSTRAINT whatsapp_session_commands_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_outbound_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  phone VARCHAR(80) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  owner_instance VARCHAR(120) NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at DATETIME NULL,
  sent_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY whatsapp_outbound_pending_index (status, created_at),
  KEY whatsapp_outbound_empresa_index (empresa_id, created_at),
  CONSTRAINT whatsapp_outbound_messages_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE whatsapp_session_status ADD INDEX whatsapp_session_status_owner_index (owner_instance)', 'SELECT 1')
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_session_status' AND INDEX_NAME = 'whatsapp_session_status_owner_index'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE whatsapp_session_status ADD INDEX whatsapp_session_status_lease_until_index (lease_until)', 'SELECT 1')
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_session_status' AND INDEX_NAME = 'whatsapp_session_status_lease_until_index'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
