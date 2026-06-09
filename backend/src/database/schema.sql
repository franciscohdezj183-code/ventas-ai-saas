SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
START TRANSACTION;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS empresas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  telefono VARCHAR(40) NULL,
  direccion VARCHAR(255) NULL,
  tipo_negocio VARCHAR(120) NULL,
  plan ENUM('BASICO', 'PRO', 'ENTERPRISE') NOT NULL DEFAULT 'BASICO',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  estado ENUM('ACTIVA', 'INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY empresas_slug_unique (slug),
  KEY empresas_activo_index (activo),
  KEY empresas_plan_index (plan),
  KEY empresas_estado_index (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(180) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('SUPER_ADMIN', 'OWNER') NOT NULL DEFAULT 'OWNER',
  estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY usuarios_empresa_email_unique (empresa_id, email),
  KEY usuarios_empresa_id_index (empresa_id),
  KEY usuarios_empresa_id_id_index (empresa_id, id),
  KEY usuarios_rol_index (rol),
  CONSTRAINT usuarios_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categorias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  tipo ENUM('PRODUCTO', 'SERVICIO') NOT NULL DEFAULT 'PRODUCTO',
  estado ENUM('ACTIVA', 'INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY categorias_empresa_nombre_tipo_unique (empresa_id, nombre, tipo),
  KEY categorias_empresa_id_index (empresa_id),
  KEY categorias_empresa_id_id_index (empresa_id, id),
  KEY categorias_tipo_index (tipo),
  CONSTRAINT categorias_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS productos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  categoria_id BIGINT UNSIGNED NULL,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT NULL,
  sku VARCHAR(80) NULL,
  precio DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  imagen VARCHAR(255) NULL,
  estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY productos_empresa_sku_unique (empresa_id, sku),
  KEY productos_empresa_id_index (empresa_id),
  KEY productos_categoria_id_index (categoria_id),
  KEY productos_empresa_categoria_index (empresa_id, categoria_id),
  KEY productos_estado_index (estado),
  CONSTRAINT productos_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT productos_categoria_id_foreign
    FOREIGN KEY (empresa_id, categoria_id) REFERENCES categorias (empresa_id, id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS servicios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  categoria_id BIGINT UNSIGNED NULL,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT NULL,
  precio DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  duracion_minutos INT UNSIGNED NULL,
  estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY servicios_empresa_id_index (empresa_id),
  KEY servicios_categoria_id_index (categoria_id),
  KEY servicios_empresa_categoria_index (empresa_id, categoria_id),
  KEY servicios_estado_index (estado),
  CONSTRAINT servicios_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT servicios_categoria_id_foreign
    FOREIGN KEY (empresa_id, categoria_id) REFERENCES categorias (empresa_id, id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  nombre_cliente VARCHAR(150) NOT NULL,
  email VARCHAR(180) NULL,
  telefono VARCHAR(40) NULL,
  interes VARCHAR(180) NULL,
  estado ENUM('NUEVO', 'EN_PROCESO', 'GANADO', 'PERDIDO') NOT NULL DEFAULT 'NUEVO',
  notas TEXT NULL,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY leads_empresa_id_index (empresa_id),
  KEY leads_empresa_id_id_index (empresa_id, id),
  KEY leads_email_index (email),
  KEY leads_telefono_index (telefono),
  KEY leads_estado_index (estado),
  CONSTRAINT leads_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversaciones (
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
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;
