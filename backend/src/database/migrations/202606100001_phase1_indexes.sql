CREATE INDEX conversaciones_empresa_cliente_fecha_index
  ON conversaciones (empresa_id, telefono_cliente, fecha);

CREATE INDEX productos_empresa_estado_nombre_index
  ON productos (empresa_id, estado, nombre);

CREATE INDEX servicios_empresa_estado_nombre_index
  ON servicios (empresa_id, estado, nombre);
