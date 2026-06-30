SET @sql = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE whatsapp_session_status ADD COLUMN auto_restore TINYINT(1) NOT NULL DEFAULT 0 AFTER phone', 'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_session_status' AND COLUMN_NAME = 'auto_restore'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0, 'ALTER TABLE whatsapp_session_status ADD INDEX whatsapp_session_status_auto_restore_index (auto_restore)', 'SELECT 1')
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'whatsapp_session_status' AND INDEX_NAME = 'whatsapp_session_status_auto_restore_index'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
