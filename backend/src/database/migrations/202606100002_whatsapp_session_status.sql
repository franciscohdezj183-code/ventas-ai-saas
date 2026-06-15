CREATE TABLE IF NOT EXISTS whatsapp_session_status (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
