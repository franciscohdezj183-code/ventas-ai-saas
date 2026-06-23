ALTER TABLE conversaciones
  ADD COLUMN whatsapp_id VARCHAR(80) NULL AFTER telefono_cliente,
  ADD COLUMN contact_name VARCHAR(150) NULL AFTER whatsapp_id,
  ADD KEY conversaciones_whatsapp_id_index (whatsapp_id);

ALTER TABLE leads
  ADD COLUMN whatsapp_id VARCHAR(80) NULL AFTER telefono,
  ADD COLUMN contact_name VARCHAR(150) NULL AFTER whatsapp_id,
  ADD KEY leads_whatsapp_id_index (whatsapp_id);
