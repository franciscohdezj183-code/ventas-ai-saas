-- Nexus destructive cleanup before importing a full phpMyAdmin dump.
-- WARNING: This deletes all data from the current database.
-- Run this only after taking a backup and only in the target database.
-- It does not drop business tables. It clears rows and resets AUTO_INCREMENT counters.
-- It is tolerant of optional tables that may not exist yet.

DELIMITER $$

DROP PROCEDURE IF EXISTS nexus_delete_table_if_exists $$
CREATE PROCEDURE nexus_delete_table_if_exists(IN table_name_value VARCHAR(128))
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = table_name_value
  ) THEN
    SET @delete_sql = CONCAT('DELETE FROM `', REPLACE(table_name_value, '`', '``'), '`');
    PREPARE delete_stmt FROM @delete_sql;
    EXECUTE delete_stmt;
    DEALLOCATE PREPARE delete_stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS nexus_reset_auto_increment_if_exists $$
CREATE PROCEDURE nexus_reset_auto_increment_if_exists(IN table_name_value VARCHAR(128))
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = table_name_value
  ) THEN
    SET @reset_sql = CONCAT('ALTER TABLE `', REPLACE(table_name_value, '`', '``'), '` AUTO_INCREMENT = 1');
    PREPARE reset_stmt FROM @reset_sql;
    EXECUTE reset_stmt;
    DEALLOCATE PREPARE reset_stmt;
  END IF;
END $$

DELIMITER ;

SET FOREIGN_KEY_CHECKS = 0;
START TRANSACTION;

CALL nexus_delete_table_if_exists('ncie_engine_events');
CALL nexus_delete_table_if_exists('ncie_shadow_evaluations');
CALL nexus_delete_table_if_exists('whatsapp_outbound_messages');
CALL nexus_delete_table_if_exists('whatsapp_session_commands');
CALL nexus_delete_table_if_exists('whatsapp_session_status');
CALL nexus_delete_table_if_exists('subscription_invoices');
CALL nexus_delete_table_if_exists('subscriptions');
CALL nexus_delete_table_if_exists('notificaciones');
CALL nexus_delete_table_if_exists('pedidos');
CALL nexus_delete_table_if_exists('human_handoffs');
CALL nexus_delete_table_if_exists('ai_usage_logs');
CALL nexus_delete_table_if_exists('conversacion_contexto');
CALL nexus_delete_table_if_exists('conversaciones');
CALL nexus_delete_table_if_exists('leads');
CALL nexus_delete_table_if_exists('productos');
CALL nexus_delete_table_if_exists('servicios');
CALL nexus_delete_table_if_exists('categorias');
CALL nexus_delete_table_if_exists('bot_response_settings');
CALL nexus_delete_table_if_exists('bot_prompt_templates');
CALL nexus_delete_table_if_exists('audit_logs');
CALL nexus_delete_table_if_exists('usuarios');
CALL nexus_delete_table_if_exists('configuracion_empresas');
CALL nexus_delete_table_if_exists('empresas');
CALL nexus_delete_table_if_exists('schema_migrations');

CALL nexus_reset_auto_increment_if_exists('ncie_engine_events');
CALL nexus_reset_auto_increment_if_exists('ncie_shadow_evaluations');
CALL nexus_reset_auto_increment_if_exists('whatsapp_outbound_messages');
CALL nexus_reset_auto_increment_if_exists('whatsapp_session_commands');
CALL nexus_reset_auto_increment_if_exists('subscription_invoices');
CALL nexus_reset_auto_increment_if_exists('subscriptions');
CALL nexus_reset_auto_increment_if_exists('notificaciones');
CALL nexus_reset_auto_increment_if_exists('pedidos');
CALL nexus_reset_auto_increment_if_exists('human_handoffs');
CALL nexus_reset_auto_increment_if_exists('ai_usage_logs');
CALL nexus_reset_auto_increment_if_exists('conversaciones');
CALL nexus_reset_auto_increment_if_exists('leads');
CALL nexus_reset_auto_increment_if_exists('productos');
CALL nexus_reset_auto_increment_if_exists('servicios');
CALL nexus_reset_auto_increment_if_exists('categorias');
CALL nexus_reset_auto_increment_if_exists('bot_response_settings');
CALL nexus_reset_auto_increment_if_exists('bot_prompt_templates');
CALL nexus_reset_auto_increment_if_exists('audit_logs');
CALL nexus_reset_auto_increment_if_exists('usuarios');
CALL nexus_reset_auto_increment_if_exists('empresas');
CALL nexus_reset_auto_increment_if_exists('schema_migrations');

COMMIT;
SET FOREIGN_KEY_CHECKS = 1;

DROP PROCEDURE IF EXISTS nexus_delete_table_if_exists;
DROP PROCEDURE IF EXISTS nexus_reset_auto_increment_if_exists;
