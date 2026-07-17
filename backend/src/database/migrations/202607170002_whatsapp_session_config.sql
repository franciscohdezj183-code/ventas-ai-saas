CREATE TABLE IF NOT EXISTS whatsapp_session_config (
  empresa_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(32) NULL,
  desired_state VARCHAR(32) NOT NULL DEFAULT 'DISCONNECTED',
  auto_restore TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (empresa_id),
  KEY whatsapp_session_config_provider_index (provider),
  KEY whatsapp_session_config_desired_state_index (desired_state),
  CONSTRAINT whatsapp_session_config_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT whatsapp_session_config_provider_check
    CHECK (provider IS NULL OR provider IN ('whatsapp-web', 'baileys')),
  CONSTRAINT whatsapp_session_config_desired_state_check
    CHECK (desired_state IN ('CONNECTED', 'DISCONNECTED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
