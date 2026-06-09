DROP TABLE IF EXISTS conversaciones;

CREATE TABLE conversaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  telefono_cliente VARCHAR(40) NOT NULL,
  mensaje TEXT NOT NULL,
  respuesta TEXT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY conversaciones_empresa_id_index (empresa_id),
  KEY conversaciones_telefono_cliente_index (telefono_cliente),
  KEY conversaciones_fecha_index (fecha),
  CONSTRAINT conversaciones_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
