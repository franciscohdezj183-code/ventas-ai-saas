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
