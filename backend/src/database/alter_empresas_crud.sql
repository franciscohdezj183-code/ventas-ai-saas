ALTER TABLE empresas
  ADD COLUMN telefono VARCHAR(40) NULL AFTER slug,
  ADD COLUMN direccion VARCHAR(255) NULL AFTER telefono,
  ADD COLUMN tipo_negocio VARCHAR(120) NULL AFTER direccion,
  ADD COLUMN plan ENUM('BASICO', 'PRO', 'ENTERPRISE') NOT NULL DEFAULT 'BASICO' AFTER tipo_negocio,
  ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1 AFTER plan;

ALTER TABLE empresas
  ADD INDEX empresas_activo_index (activo),
  ADD INDEX empresas_plan_index (plan);
