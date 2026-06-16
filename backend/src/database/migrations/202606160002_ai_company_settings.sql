ALTER TABLE configuracion_empresas
  ADD COLUMN instrucciones_negocio TEXT NULL AFTER mensaje_fuera_horario,
  ADD COLUMN temas_bloqueados TEXT NULL AFTER instrucciones_negocio,
  ADD COLUMN faq_personalizada TEXT NULL AFTER temas_bloqueados,
  ADD COLUMN auto_pedidos TINYINT(1) NOT NULL DEFAULT 1 AFTER faq_personalizada,
  ADD COLUMN envio_imagenes TINYINT(1) NOT NULL DEFAULT 1 AFTER auto_pedidos,
  ADD COLUMN fallback_message TEXT NULL AFTER envio_imagenes;
