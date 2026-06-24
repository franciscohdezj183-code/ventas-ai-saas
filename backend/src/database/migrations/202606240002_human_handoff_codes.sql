SET @schema_name = DATABASE();

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'human_handoffs'
    AND column_name = 'codigo'
);
SET @stmt := IF(
  @column_exists = 0,
  'ALTER TABLE human_handoffs ADD COLUMN codigo VARCHAR(20) NULL AFTER telefono_dueno',
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
    AND index_name = 'human_handoffs_empresa_codigo_estado_index'
);
SET @stmt := IF(
  @index_exists = 0,
  'ALTER TABLE human_handoffs ADD INDEX human_handoffs_empresa_codigo_estado_index (empresa_id, codigo, estado)',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
