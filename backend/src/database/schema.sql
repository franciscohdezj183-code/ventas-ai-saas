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
  logo VARCHAR(255) NULL,
  plan ENUM('BASICO','PRO','STARTER','BUSINESS','ENTERPRISE') NOT NULL DEFAULT 'STARTER',
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
  rol ENUM('SUPER_ADMIN','OWNER','super_admin','owner','seller','support','viewer') NOT NULL DEFAULT 'owner',
  estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY usuarios_email_unique (email),
  UNIQUE KEY usuarios_empresa_email_unique (empresa_id, email),
  KEY usuarios_empresa_id_index (empresa_id),
  KEY usuarios_empresa_id_id_index (empresa_id, id),
  KEY usuarios_rol_index (rol),
  CONSTRAINT usuarios_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  plan VARCHAR(40) NOT NULL,
  status ENUM('TRIALING','ACTIVE','PAST_DUE','CANCELED','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  provider VARCHAR(80) NULL,
  provider_customer_id VARCHAR(160) NULL,
  provider_subscription_id VARCHAR(160) NULL,
  current_period_start DATETIME NULL,
  current_period_end DATETIME NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY subscriptions_empresa_id_index (empresa_id),
  KEY subscriptions_status_index (status),
  CONSTRAINT subscriptions_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subscription_id BIGINT UNSIGNED NOT NULL,
  empresa_id BIGINT UNSIGNED NOT NULL,
  provider_invoice_id VARCHAR(160) NULL,
  amount_cents INT UNSIGNED NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'MXN',
  status ENUM('DRAFT','OPEN','PAID','VOID','UNCOLLECTIBLE') NOT NULL DEFAULT 'DRAFT',
  hosted_invoice_url VARCHAR(255) NULL,
  due_at DATETIME NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY subscription_invoices_subscription_index (subscription_id),
  KEY subscription_invoices_empresa_index (empresa_id),
  CONSTRAINT subscription_invoices_subscription_foreign
    FOREIGN KEY (subscription_id) REFERENCES subscriptions (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT subscription_invoices_empresa_foreign
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
  FULLTEXT KEY categorias_fulltext_search (nombre, descripcion),
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
  KEY productos_empresa_estado_nombre_index (empresa_id, estado, nombre),
  FULLTEXT KEY productos_fulltext_search (nombre, descripcion, sku),
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
  precio DECIMAL(12,2) NULL DEFAULT 0.00,
  tipo_precio ENUM('FIJO', 'DESDE', 'POR_UNIDAD', 'POR_M2', 'POR_HORA', 'COTIZACION') NOT NULL DEFAULT 'FIJO',
  unidad_medida ENUM('servicio', 'pieza', 'paquete', 'm2', 'hora', 'asesor') NULL,
  duracion_minutos INT UNSIGNED NULL,
  requiere_medidas TINYINT(1) NOT NULL DEFAULT 0,
  requiere_cantidad TINYINT(1) NOT NULL DEFAULT 0,
  incluye TEXT NULL,
  no_incluye TEXT NULL,
  notas_cotizacion TEXT NULL,
  precio_minimo DECIMAL(12,2) NULL,
  estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY servicios_empresa_id_index (empresa_id),
  KEY servicios_categoria_id_index (categoria_id),
  KEY servicios_empresa_categoria_index (empresa_id, categoria_id),
  KEY servicios_estado_index (estado),
  KEY servicios_empresa_estado_nombre_index (empresa_id, estado, nombre),
  FULLTEXT KEY servicios_fulltext_search (nombre, descripcion),
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
  whatsapp_id VARCHAR(80) NULL,
  contact_name VARCHAR(150) NULL,
  interes VARCHAR(180) NULL,
  estado ENUM('NUEVO', 'EN_PROCESO', 'CONTACTADO', 'COTIZADO', 'GANADO', 'PERDIDO') NOT NULL DEFAULT 'NUEVO',
  notas TEXT NULL,
  score INT UNSIGNED NOT NULL DEFAULT 0,
  prioridad ENUM('BAJA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'BAJA',
  score_detalle_json JSON NULL,
  score_actualizado_at DATETIME NULL,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY leads_empresa_id_index (empresa_id),
  KEY leads_empresa_id_id_index (empresa_id, id),
  KEY leads_email_index (email),
  KEY leads_telefono_index (telefono),
  KEY leads_whatsapp_id_index (whatsapp_id),
  KEY leads_estado_index (estado),
  KEY leads_prioridad_index (prioridad),
  KEY leads_score_index (score),
  CONSTRAINT leads_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  telefono_cliente VARCHAR(40) NOT NULL,
  whatsapp_id VARCHAR(80) NULL,
  contact_name VARCHAR(150) NULL,
  mensaje TEXT NOT NULL,
  respuesta TEXT NULL,
  estado ENUM('open','bot_active','requires_human','human_active','closed') NOT NULL DEFAULT 'open',
  tipo_mensaje ENUM('customer','bot','human','system') NOT NULL DEFAULT 'customer',
  agente_usuario_id BIGINT UNSIGNED NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY conversaciones_empresa_id_index (empresa_id),
  KEY conversaciones_telefono_cliente_index (telefono_cliente),
  KEY conversaciones_whatsapp_id_index (whatsapp_id),
  KEY conversaciones_estado_index (estado),
  KEY conversaciones_empresa_cliente_estado_index (empresa_id, telefono_cliente, estado),
  KEY conversaciones_empresa_cliente_fecha_index (empresa_id, telefono_cliente, fecha),
  KEY conversaciones_agente_usuario_index (agente_usuario_id),
  KEY conversaciones_fecha_index (fecha),
  CONSTRAINT conversaciones_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT conversaciones_agente_usuario_foreign
    FOREIGN KEY (agente_usuario_id) REFERENCES usuarios (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS configuracion_empresas (
  empresa_id BIGINT UNSIGNED NOT NULL,
  nombre_bot VARCHAR(120) NULL,
  tono_respuesta VARCHAR(80) NULL,
  mensaje_bienvenida TEXT NULL,
  mensaje_fuera_horario TEXT NULL,
  instrucciones_negocio TEXT NULL,
  temas_bloqueados TEXT NULL,
  faq_personalizada TEXT NULL,
  auto_pedidos TINYINT(1) NOT NULL DEFAULT 1,
  envio_imagenes TINYINT(1) NOT NULL DEFAULT 1,
  fallback_message TEXT NULL,
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

CREATE TABLE IF NOT EXISTS whatsapp_session_status (
  empresa_id BIGINT UNSIGNED NOT NULL,
  session_id VARCHAR(80) NULL,
  owner_instance VARCHAR(120) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DISCONNECTED',
  qr MEDIUMTEXT NULL,
  qr_image MEDIUMTEXT NULL,
  phone VARCHAR(80) NULL,
  connected_at DATETIME NULL,
  last_error TEXT NULL,
  reconnect_attempt INT UNSIGNED NOT NULL DEFAULT 0,
  next_reconnect_at DATETIME NULL,
  lease_until DATETIME NULL,
  heartbeat_at DATETIME NULL,
  last_qr_at DATETIME NULL,
  qr_expires_at DATETIME NULL,
  events_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (empresa_id),
  KEY whatsapp_session_status_owner_index (owner_instance),
  KEY whatsapp_session_status_status_index (status),
  KEY whatsapp_session_status_lease_until_index (lease_until),
  KEY whatsapp_session_status_updated_at_index (updated_at),
  CONSTRAINT whatsapp_session_status_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_session_commands (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  command VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  requested_by BIGINT UNSIGNED NULL,
  requested_by_role VARCHAR(40) NULL,
  owner_instance VARCHAR(120) NULL,
  error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at DATETIME NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY whatsapp_session_commands_pending_index (status, created_at),
  KEY whatsapp_session_commands_empresa_index (empresa_id, created_at),
  CONSTRAINT whatsapp_session_commands_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_outbound_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  phone VARCHAR(80) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  owner_instance VARCHAR(120) NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at DATETIME NULL,
  sent_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY whatsapp_outbound_pending_index (status, created_at),
  KEY whatsapp_outbound_empresa_index (empresa_id, created_at),
  CONSTRAINT whatsapp_outbound_messages_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS bot_prompt_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(150) NOT NULL,
  tipo_negocio VARCHAR(120) NOT NULL,
  intencion VARCHAR(80) NULL,
  prompt_sistema TEXT NULL,
  formato_respuesta TEXT NULL,
  ejemplos_json JSON NULL,
  emojis_activos TINYINT(1) NOT NULL DEFAULT 1,
  tono ENUM('PROFESIONAL','AMABLE','CERCANO','FORMAL','COMERCIAL') NOT NULL DEFAULT 'PROFESIONAL',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY bot_prompt_templates_tipo_index (tipo_negocio),
  KEY bot_prompt_templates_activo_index (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bot_response_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  template_id BIGINT UNSIGNED NULL,
  nombre_asistente VARCHAR(120) NULL,
  tono_respuesta VARCHAR(180) NULL,
  usar_emojis TINYINT(1) NOT NULL DEFAULT 1,
  emoji_principal VARCHAR(16) NULL,
  emoji_producto VARCHAR(16) NULL,
  emoji_precio VARCHAR(16) NULL,
  emoji_stock VARCHAR(16) NULL,
  emoji_asesor VARCHAR(16) NULL,
  emoji_pago VARCHAR(16) NULL,
  saludo_personalizado TEXT NULL,
  despedida_personalizada TEXT NULL,
  mensaje_sin_resultados TEXT NULL,
  mensaje_asesor TEXT NULL,
  mensaje_fuera_horario TEXT NULL,
  reglas_adicionales TEXT NULL,
  sinonimos_json JSON NULL,
  handoff_timeout_minutos INT UNSIGNED NULL,
  handoff_mensaje_tomar TEXT NULL,
  handoff_mensaje_declinar TEXT NULL,
  handoff_mensaje_expirado TEXT NULL,
  handoff_mensaje_reactivar TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY bot_response_settings_empresa_unique (empresa_id),
  KEY bot_response_settings_template_index (template_id),
  CONSTRAINT bot_response_settings_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT bot_response_settings_template_foreign
    FOREIGN KEY (template_id) REFERENCES bot_prompt_templates (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS human_handoffs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NULL,
  telefono_cliente VARCHAR(40) NOT NULL,
  telefono_dueno VARCHAR(40) NULL,
  estado ENUM('PENDING_OWNER', 'HUMAN_TAKEOVER', 'BOT_ACTIVE', 'EXPIRED', 'DECLINED') NOT NULL DEFAULT 'PENDING_OWNER',
  motivo VARCHAR(120) NULL,
  mensaje_cliente TEXT NULL,
  whatsapp_chat_id VARCHAR(80) NULL,
  producto_id BIGINT UNSIGNED NULL,
  servicio_id BIGINT UNSIGNED NULL,
  owner_notified_at DATETIME NULL,
  owner_responded_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  last_activity_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY human_handoffs_empresa_cliente_estado_index (empresa_id, telefono_cliente, estado),
  KEY human_handoffs_empresa_dueno_estado_index (empresa_id, telefono_dueno, estado),
  KEY human_handoffs_expires_at_index (expires_at),
  KEY human_handoffs_last_activity_at_index (last_activity_at),
  CONSTRAINT human_handoffs_empresa_id_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT human_handoffs_conversation_id_foreign
    FOREIGN KEY (conversation_id) REFERENCES conversaciones (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

COMMIT;
