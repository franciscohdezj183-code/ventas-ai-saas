-- Nexus production schema patch for WhatsApp bot / NCIE engine config.
-- Safe to run manually in phpMyAdmin on MariaDB/MySQL.
-- This script is idempotent: it only adds missing columns/tables and preserves existing data.
-- It does not drop, truncate, or recreate existing tables.

START TRANSACTION;

-- The current backend reads these columns before calling OpenAI in:
-- backend/src/conversation-engine/tenant-engine.service.js:getTenantEngineConfig()
-- Missing columns cause ER_BAD_FIELD_ERROR and prevent the bot from reaching OpenAI.

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'configuracion_empresas'
     AND COLUMN_NAME = 'conversation_engine_explicit') = 0,
  'ALTER TABLE configuracion_empresas ADD COLUMN conversation_engine_explicit TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT ''conversation_engine_explicit already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'configuracion_empresas'
     AND COLUMN_NAME = 'conversation_engine_version') = 0,
  'ALTER TABLE configuracion_empresas ADD COLUMN conversation_engine_version ENUM(''legacy'',''ncie'',''shadow'') NOT NULL DEFAULT ''legacy''',
  'SELECT ''conversation_engine_version already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'configuracion_empresas'
     AND COLUMN_NAME = 'ncie_enabled') = 0,
  'ALTER TABLE configuracion_empresas ADD COLUMN ncie_enabled TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT ''ncie_enabled already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'configuracion_empresas'
     AND COLUMN_NAME = 'ncie_canary_percentage') = 0,
  'ALTER TABLE configuracion_empresas ADD COLUMN ncie_canary_percentage TINYINT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT ''ncie_canary_percentage already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'configuracion_empresas'
     AND COLUMN_NAME = 'ncie_min_confidence') = 0,
  'ALTER TABLE configuracion_empresas ADD COLUMN ncie_min_confidence DECIMAL(5,4) NOT NULL DEFAULT 0.5500',
  'SELECT ''ncie_min_confidence already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'configuracion_empresas'
     AND COLUMN_NAME = 'ncie_min_retrieval_score') = 0,
  'ALTER TABLE configuracion_empresas ADD COLUMN ncie_min_retrieval_score DECIMAL(10,4) NOT NULL DEFAULT 1.0000',
  'SELECT ''ncie_min_retrieval_score already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'configuracion_empresas'
     AND COLUMN_NAME = 'ncie_auto_rollback_enabled') = 0,
  'ALTER TABLE configuracion_empresas ADD COLUMN ncie_auto_rollback_enabled TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT ''ncie_auto_rollback_enabled already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'configuracion_empresas'
     AND COLUMN_NAME = 'ncie_max_risk_rate') = 0,
  'ALTER TABLE configuracion_empresas ADD COLUMN ncie_max_risk_rate DECIMAL(5,4) NOT NULL DEFAULT 0.3500',
  'SELECT ''ncie_max_risk_rate already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Tables used by NCIE shadow/canary metrics. They are created only if missing.

CREATE TABLE IF NOT EXISTS ncie_shadow_evaluations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  conversacion_id BIGINT UNSIGNED NULL,
  mensaje_cliente TEXT NOT NULL,
  respuesta_legacy TEXT NULL,
  respuesta_ncie TEXT NULL,
  intent_ncie VARCHAR(80) NULL,
  confidence_ncie DECIMAL(5,4) NULL,
  retrieval_score DECIMAL(10,4) NULL,
  decision_ncie VARCHAR(80) NULL,
  tiempo_ncie_ms INT UNSIGNED NULL,
  legacy_dijo_no_contamos TINYINT(1) NOT NULL DEFAULT 0,
  ncie_hizo_pregunta TINYINT(1) NOT NULL DEFAULT 0,
  ncie_encontro_opciones TINYINT(1) NOT NULL DEFAULT 0,
  posible_mejora TINYINT(1) NOT NULL DEFAULT 0,
  posible_riesgo TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ncie_shadow_empresa_created_index (empresa_id, created_at),
  KEY ncie_shadow_conversacion_index (conversacion_id),
  KEY ncie_shadow_intent_index (intent_ncie),
  KEY ncie_shadow_mejora_index (posible_mejora),
  KEY ncie_shadow_riesgo_index (posible_riesgo),
  CONSTRAINT ncie_shadow_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT ncie_shadow_conversacion_foreign
    FOREIGN KEY (conversacion_id) REFERENCES conversaciones (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Mark the matching repository migrations as applied when schema_migrations exists.
-- INSERT IGNORE preserves existing rows.

INSERT IGNORE INTO schema_migrations (version) VALUES
  ('202606300001_ncie_shadow_evaluations'),
  ('202606300002_ncie_tenant_canary'),
  ('202606300003_ncie_explicit_engine_config');

COMMIT;
