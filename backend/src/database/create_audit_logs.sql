CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NULL,
  empresa_id BIGINT UNSIGNED NULL,
  accion VARCHAR(80) NOT NULL,
  modulo VARCHAR(80) NOT NULL,
  descripcion TEXT NULL,
  ip VARCHAR(80) NULL,
  user_agent TEXT NULL,
  fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY audit_logs_usuario_id_index (usuario_id),
  KEY audit_logs_empresa_id_index (empresa_id),
  KEY audit_logs_accion_index (accion),
  KEY audit_logs_modulo_index (modulo),
  KEY audit_logs_fecha_index (fecha),
  CONSTRAINT audit_logs_usuario_id_foreign
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT audit_logs_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
