ALTER TABLE conversaciones
  ADD COLUMN estado ENUM('open','bot_active','requires_human','human_active','closed') NOT NULL DEFAULT 'open' AFTER respuesta,
  ADD COLUMN tipo_mensaje ENUM('customer','bot','human','system') NOT NULL DEFAULT 'customer' AFTER estado,
  ADD COLUMN agente_usuario_id BIGINT UNSIGNED NULL AFTER tipo_mensaje,
  ADD KEY conversaciones_estado_index (estado),
  ADD KEY conversaciones_empresa_cliente_estado_index (empresa_id, telefono_cliente, estado),
  ADD KEY conversaciones_agente_usuario_index (agente_usuario_id),
  ADD CONSTRAINT conversaciones_agente_usuario_foreign
    FOREIGN KEY (agente_usuario_id) REFERENCES usuarios (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;

UPDATE conversaciones
SET estado = CASE
      WHEN respuesta IS NOT NULL AND respuesta <> '' THEN 'bot_active'
      ELSE 'open'
    END,
    tipo_mensaje = CASE
      WHEN respuesta IS NOT NULL AND respuesta <> '' THEN 'bot'
      ELSE 'customer'
    END
WHERE estado = 'open';
