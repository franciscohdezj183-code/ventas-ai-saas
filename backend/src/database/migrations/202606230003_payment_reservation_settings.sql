ALTER TABLE configuracion_empresas
  ADD COLUMN pago_efectivo_activo TINYINT(1) NOT NULL DEFAULT 1 AFTER politica_pagos,
  ADD COLUMN pago_transferencia_activo TINYINT(1) NOT NULL DEFAULT 0 AFTER pago_efectivo_activo,
  ADD COLUMN transferencia_banco VARCHAR(120) NULL AFTER pago_transferencia_activo,
  ADD COLUMN transferencia_titular VARCHAR(150) NULL AFTER transferencia_banco,
  ADD COLUMN transferencia_cuenta VARCHAR(80) NULL AFTER transferencia_titular,
  ADD COLUMN transferencia_clabe VARCHAR(80) NULL AFTER transferencia_cuenta,
  ADD COLUMN transferencia_tarjeta VARCHAR(80) NULL AFTER transferencia_clabe,
  ADD COLUMN apartado_activo TINYINT(1) NOT NULL DEFAULT 0 AFTER transferencia_tarjeta,
  ADD COLUMN apartado_porcentaje DECIMAL(5,2) NULL AFTER apartado_activo,
  ADD COLUMN apartado_instrucciones TEXT NULL AFTER apartado_porcentaje;
