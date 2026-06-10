CREATE TABLE IF NOT EXISTS configuracion_empresas (
  empresa_id BIGINT UNSIGNED NOT NULL,
  nombre_bot VARCHAR(120) NULL,
  tono_respuesta VARCHAR(80) NULL,
  mensaje_bienvenida TEXT NULL,
  mensaje_fuera_horario TEXT NULL,
  telefono_dueno VARCHAR(40) NULL,
  direccion VARCHAR(255) NULL,
  horario_atencion TEXT NULL,
  politica_entrega TEXT NULL,
  politica_pagos TEXT NULL,
  activo_ia TINYINT(1) NOT NULL DEFAULT 1,
  activo_whatsapp TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (empresa_id),
  CONSTRAINT configuracion_empresas_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
