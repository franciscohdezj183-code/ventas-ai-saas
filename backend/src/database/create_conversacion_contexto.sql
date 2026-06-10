CREATE TABLE IF NOT EXISTS conversacion_contexto (
  empresa_id BIGINT UNSIGNED NOT NULL,
  telefono_cliente VARCHAR(40) NOT NULL,
  ultima_intencion VARCHAR(80) NULL,
  ultimo_producto_id BIGINT UNSIGNED NULL,
  ultimo_servicio_id BIGINT UNSIGNED NULL,
  ultimo_texto_busqueda VARCHAR(255) NULL,
  datos_json JSON NULL,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (empresa_id, telefono_cliente),
  KEY conversacion_contexto_producto_index (empresa_id, ultimo_producto_id),
  KEY conversacion_contexto_servicio_index (empresa_id, ultimo_servicio_id),
  CONSTRAINT conversacion_contexto_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
