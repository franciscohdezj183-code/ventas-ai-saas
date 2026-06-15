ALTER TABLE bot_response_settings
  ADD COLUMN sinonimos_json JSON NULL AFTER reglas_adicionales,
  ADD COLUMN handoff_timeout_minutos INT UNSIGNED NULL AFTER sinonimos_json,
  ADD COLUMN handoff_mensaje_tomar TEXT NULL AFTER handoff_timeout_minutos,
  ADD COLUMN handoff_mensaje_declinar TEXT NULL AFTER handoff_mensaje_tomar,
  ADD COLUMN handoff_mensaje_expirado TEXT NULL AFTER handoff_mensaje_declinar,
  ADD COLUMN handoff_mensaje_reactivar TEXT NULL AFTER handoff_mensaje_expirado;
