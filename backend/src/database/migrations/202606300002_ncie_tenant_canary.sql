ALTER TABLE configuracion_empresas
  ADD COLUMN conversation_engine_version ENUM('legacy','ncie','shadow') NOT NULL DEFAULT 'legacy' AFTER activo_whatsapp,
  ADD COLUMN ncie_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER conversation_engine_version,
  ADD COLUMN ncie_canary_percentage TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER ncie_enabled,
  ADD COLUMN ncie_min_confidence DECIMAL(5,4) NOT NULL DEFAULT 0.5500 AFTER ncie_canary_percentage,
  ADD COLUMN ncie_min_retrieval_score DECIMAL(10,4) NOT NULL DEFAULT 1.0000 AFTER ncie_min_confidence,
  ADD COLUMN ncie_auto_rollback_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER ncie_min_retrieval_score,
  ADD COLUMN ncie_max_risk_rate DECIMAL(5,4) NOT NULL DEFAULT 0.3500 AFTER ncie_auto_rollback_enabled;

CREATE TABLE IF NOT EXISTS ncie_engine_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  conversacion_id BIGINT UNSIGNED NULL,
  engine_config VARCHAR(20) NOT NULL,
  engine_selected VARCHAR(20) NOT NULL,
  engine_responded VARCHAR(20) NOT NULL,
  canary_selected TINYINT(1) NOT NULL DEFAULT 0,
  fallback_to_legacy TINYINT(1) NOT NULL DEFAULT 0,
  confidence_ncie DECIMAL(5,4) NULL,
  retrieval_score DECIMAL(10,4) NULL,
  ncie_hizo_pregunta TINYINT(1) NOT NULL DEFAULT 0,
  handoff_confusion TINYINT(1) NOT NULL DEFAULT 0,
  falso_negativo_sospechoso TINYINT(1) NOT NULL DEFAULT 0,
  error_ncie TINYINT(1) NOT NULL DEFAULT 0,
  error_message VARCHAR(255) NULL,
  tiempo_ncie_ms INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ncie_engine_events_empresa_created_index (empresa_id, created_at),
  KEY ncie_engine_events_selected_index (engine_selected),
  KEY ncie_engine_events_responded_index (engine_responded),
  KEY ncie_engine_events_fallback_index (fallback_to_legacy),
  KEY ncie_engine_events_error_index (error_ncie),
  CONSTRAINT ncie_engine_events_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT ncie_engine_events_conversacion_foreign
    FOREIGN KEY (conversacion_id) REFERENCES conversaciones (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
