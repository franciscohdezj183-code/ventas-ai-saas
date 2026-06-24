SET @schema_name = DATABASE();

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'conversaciones'
    AND column_name = 'whatsapp_message_id'
);
SET @stmt := IF(
  @column_exists = 0,
  'ALTER TABLE conversaciones ADD COLUMN whatsapp_message_id VARCHAR(120) NULL AFTER whatsapp_id',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'empresas'
    AND index_name = 'empresas_activo_estado_id_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE empresas ADD INDEX empresas_activo_estado_id_index (activo, estado, id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'conversaciones'
    AND index_name = 'conversaciones_empresa_whatsapp_message_unique'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE conversaciones ADD UNIQUE KEY conversaciones_empresa_whatsapp_message_unique (empresa_id, whatsapp_message_id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'conversaciones'
    AND index_name = 'conversaciones_empresa_id_id_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE conversaciones ADD INDEX conversaciones_empresa_id_id_index (empresa_id, id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'conversaciones'
    AND index_name = 'conversaciones_empresa_fecha_id_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE conversaciones ADD INDEX conversaciones_empresa_fecha_id_index (empresa_id, fecha, id)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'leads'
    AND index_name = 'leads_empresa_fecha_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE leads ADD INDEX leads_empresa_fecha_index (empresa_id, fecha_creacion)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'leads'
    AND index_name = 'leads_empresa_estado_fecha_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE leads ADD INDEX leads_empresa_estado_fecha_index (empresa_id, estado, fecha_creacion)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'leads'
    AND index_name = 'leads_empresa_score_fecha_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE leads ADD INDEX leads_empresa_score_fecha_index (empresa_id, score, fecha_creacion)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'pedidos'
    AND index_name = 'pedidos_empresa_fecha_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE pedidos ADD INDEX pedidos_empresa_fecha_index (empresa_id, fecha)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'pedidos'
    AND index_name = 'pedidos_empresa_estado_fecha_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE pedidos ADD INDEX pedidos_empresa_estado_fecha_index (empresa_id, estado, fecha)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'ai_usage_logs'
    AND index_name = 'ai_usage_logs_fecha_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE ai_usage_logs ADD INDEX ai_usage_logs_fecha_index (fecha)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'bot_prompt_templates'
    AND index_name = 'bot_prompt_templates_activo_tipo_nombre_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE bot_prompt_templates ADD INDEX bot_prompt_templates_activo_tipo_nombre_index (activo, tipo_negocio, nombre)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'notificaciones'
    AND index_name = 'notificaciones_empresa_estado_fecha_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE notificaciones ADD INDEX notificaciones_empresa_estado_fecha_index (empresa_id, estado, fecha_creacion)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'human_handoffs'
    AND index_name = 'human_handoffs_estado_expires_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE human_handoffs ADD INDEX human_handoffs_estado_expires_index (estado, expires_at)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'human_handoffs'
    AND index_name = 'human_handoffs_estado_activity_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE human_handoffs ADD INDEX human_handoffs_estado_activity_index (estado, last_activity_at)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'human_handoffs'
    AND index_name = 'human_handoffs_empresa_cliente_estado_updated_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE human_handoffs ADD INDEX human_handoffs_empresa_cliente_estado_updated_index (empresa_id, telefono_cliente, estado, updated_at)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'human_handoffs'
    AND index_name = 'human_handoffs_empresa_dueno_estado_created_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE human_handoffs ADD INDEX human_handoffs_empresa_dueno_estado_created_index (empresa_id, telefono_dueno, estado, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @schema_name
    AND table_name = 'audit_logs'
    AND index_name = 'audit_logs_empresa_fecha_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE audit_logs ADD INDEX audit_logs_empresa_fecha_index (empresa_id, fecha)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
