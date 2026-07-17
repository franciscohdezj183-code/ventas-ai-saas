CREATE TABLE IF NOT EXISTS whatsapp_inbound_idempotency (
  empresa_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(32) NOT NULL,
  external_message_id VARCHAR(255) NOT NULL,
  correlation_id VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  processing_started_at DATETIME NULL,
  completed_at DATETIME NULL,
  last_error_code VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (empresa_id, provider, external_message_id),
  KEY whatsapp_inbound_idempotency_status_index (status),
  KEY whatsapp_inbound_idempotency_completed_index (completed_at),
  CONSTRAINT whatsapp_inbound_idempotency_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_outbound_idempotency (
  empresa_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(32) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  correlation_id VARCHAR(255) NULL,
  payload_hash CHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'SENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(255) NULL,
  sending_started_at DATETIME NULL,
  sent_at DATETIME NULL,
  last_error_code VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (empresa_id, provider, idempotency_key),
  KEY whatsapp_outbound_idempotency_status_index (status),
  KEY whatsapp_outbound_idempotency_sent_index (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
