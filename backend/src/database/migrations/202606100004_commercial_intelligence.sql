ALTER TABLE leads
  ADD COLUMN score INT UNSIGNED NOT NULL DEFAULT 0 AFTER notas,
  ADD COLUMN prioridad ENUM('BAJA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'BAJA' AFTER score,
  ADD COLUMN score_detalle_json JSON NULL AFTER prioridad,
  ADD COLUMN score_actualizado_at DATETIME NULL AFTER score_detalle_json;

ALTER TABLE productos
  ADD FULLTEXT KEY productos_fulltext_search (nombre, descripcion, sku);

ALTER TABLE servicios
  ADD FULLTEXT KEY servicios_fulltext_search (nombre, descripcion);

ALTER TABLE categorias
  ADD FULLTEXT KEY categorias_fulltext_search (nombre, descripcion);
