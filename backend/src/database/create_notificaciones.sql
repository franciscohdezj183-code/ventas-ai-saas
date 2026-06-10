CREATE TABLE IF NOT EXISTS notificaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  lead_id BIGINT UNSIGNED NULL,
  tipo VARCHAR(80) NOT NULL,
  telefono_destino VARCHAR(40) NULL,
  mensaje TEXT NOT NULL,
  estado ENUM('PENDIENTE', 'ENVIADA', 'ERROR') NOT NULL DEFAULT 'PENDIENTE',
  error TEXT NULL,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_envio TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY notificaciones_empresa_id_index (empresa_id),
  KEY notificaciones_lead_id_index (lead_id),
  KEY notificaciones_estado_index (estado),
  CONSTRAINT notificaciones_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT notificaciones_lead_id_foreign
    FOREIGN KEY (lead_id) REFERENCES leads (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
