CREATE TABLE IF NOT EXISTS whatsapp_session_recovery (
  empresa_id BIGINT UNSIGNED NOT NULL,
  consecutive_failures INT UNSIGNED NOT NULL DEFAULT 0,
  recovery_status VARCHAR(32) NOT NULL DEFAULT 'IDLE',
  next_retry_at DATETIME NULL,
  last_connected_at DATETIME NULL,
  last_disconnected_at DATETIME NULL,
  last_error_code VARCHAR(120) NULL,
  blocked_reason VARCHAR(255) NULL,
  reconnect_attempts_total BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (empresa_id),
  KEY whatsapp_session_recovery_status_index (recovery_status),
  KEY whatsapp_session_recovery_next_retry_index (next_retry_at),
  CONSTRAINT whatsapp_session_recovery_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT whatsapp_session_recovery_status_check
    CHECK (recovery_status IN ('IDLE', 'SCHEDULED', 'CONNECTING', 'CONNECTED', 'COOLDOWN', 'BLOCKED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
