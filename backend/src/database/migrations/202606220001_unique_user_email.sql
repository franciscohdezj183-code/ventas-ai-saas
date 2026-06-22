SET @usuarios_email_unique_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'usuarios'
    AND index_name = 'usuarios_email_unique'
);

SET @usuarios_email_unique_sql = IF(
  @usuarios_email_unique_exists = 0,
  'ALTER TABLE usuarios ADD UNIQUE KEY usuarios_email_unique (email)',
  'SELECT 1'
);

PREPARE usuarios_email_unique_stmt FROM @usuarios_email_unique_sql;
EXECUTE usuarios_email_unique_stmt;
DEALLOCATE PREPARE usuarios_email_unique_stmt;
