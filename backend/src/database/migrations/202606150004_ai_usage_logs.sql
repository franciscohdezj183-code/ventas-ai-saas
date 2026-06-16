CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  conversation_id BIGINT UNSIGNED NULL,
  tokens_input INT UNSIGNED NOT NULL DEFAULT 0,
  tokens_output INT UNSIGNED NOT NULL DEFAULT 0,
  total_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  costo_estimado DECIMAL(12,8) NOT NULL DEFAULT 0.00000000,
  modelo_usado VARCHAR(120) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ai_usage_logs_tenant_fecha_index (tenant_id, fecha),
  KEY ai_usage_logs_user_id_index (user_id),
  KEY ai_usage_logs_conversation_id_index (conversation_id),
  KEY ai_usage_logs_modelo_index (modelo_usado),
  CONSTRAINT ai_usage_logs_tenant_foreign
    FOREIGN KEY (tenant_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT ai_usage_logs_user_foreign
    FOREIGN KEY (user_id) REFERENCES usuarios (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT ai_usage_logs_conversation_foreign
    FOREIGN KEY (conversation_id) REFERENCES conversaciones (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
