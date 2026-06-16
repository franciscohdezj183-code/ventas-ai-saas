CREATE TABLE IF NOT EXISTS pedidos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  cliente_nombre VARCHAR(150) NOT NULL,
  telefono_cliente VARCHAR(40) NULL,
  conversation_id BIGINT UNSIGNED NULL,
  estado ENUM('NUEVO','CONFIRMADO','EN_PROCESO','ENTREGADO','CANCELADO') NOT NULL DEFAULT 'NUEVO',
  total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  notas TEXT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY pedidos_empresa_id_index (empresa_id),
  KEY pedidos_empresa_id_id_index (empresa_id, id),
  KEY pedidos_conversation_id_index (conversation_id),
  KEY pedidos_estado_index (estado),
  KEY pedidos_fecha_index (fecha),
  CONSTRAINT pedidos_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT pedidos_conversation_id_foreign
    FOREIGN KEY (conversation_id) REFERENCES conversaciones (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
