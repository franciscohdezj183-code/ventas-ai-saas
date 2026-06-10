import { query } from '../config/database.js';

function normalizePhone(value) {
  return String(value ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

function parseJson(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeNullableId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeText(value, maxLength = 255) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

export async function findConversationContext({ empresaId, phone }) {
  const telefonoCliente = normalizePhone(phone);

  if (!empresaId || !telefonoCliente) {
    return null;
  }

  const [rows] = await query(
    `SELECT
       empresa_id,
       telefono_cliente,
       ultima_intencion,
       ultimo_producto_id,
       ultimo_servicio_id,
       ultimo_texto_busqueda,
       datos_json,
       fecha_actualizacion
     FROM conversacion_contexto
     WHERE empresa_id = ? AND telefono_cliente = ?
     LIMIT 1`,
    [empresaId, telefonoCliente]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    ...rows[0],
    datos_json: parseJson(rows[0].datos_json)
  };
}

export async function saveConversationContext({
  empresaId,
  phone,
  ultimaIntencion,
  ultimoProductoId,
  ultimoServicioId,
  ultimoTextoBusqueda,
  datos = {}
}) {
  const telefonoCliente = normalizePhone(phone);

  if (!empresaId || !telefonoCliente) {
    return null;
  }

  const nextContext = {
    ultimaIntencion: normalizeText(ultimaIntencion, 80),
    ultimoProductoId: normalizeNullableId(ultimoProductoId),
    ultimoServicioId: normalizeNullableId(ultimoServicioId),
    ultimoTextoBusqueda: normalizeText(ultimoTextoBusqueda),
    datosJson: JSON.stringify(datos ?? {})
  };

  await query(
    `INSERT INTO conversacion_contexto
      (
        empresa_id,
        telefono_cliente,
        ultima_intencion,
        ultimo_producto_id,
        ultimo_servicio_id,
        ultimo_texto_busqueda,
        datos_json
      )
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
        ultima_intencion = VALUES(ultima_intencion),
        ultimo_producto_id = CASE
          WHEN VALUES(ultimo_producto_id) IS NOT NULL THEN VALUES(ultimo_producto_id)
          WHEN VALUES(ultimo_servicio_id) IS NOT NULL THEN NULL
          ELSE ultimo_producto_id
        END,
        ultimo_servicio_id = CASE
          WHEN VALUES(ultimo_servicio_id) IS NOT NULL THEN VALUES(ultimo_servicio_id)
          WHEN VALUES(ultimo_producto_id) IS NOT NULL THEN NULL
          ELSE ultimo_servicio_id
        END,
        ultimo_texto_busqueda = COALESCE(VALUES(ultimo_texto_busqueda), ultimo_texto_busqueda),
        datos_json = VALUES(datos_json)`,
    [
      empresaId,
      telefonoCliente,
      nextContext.ultimaIntencion,
      nextContext.ultimoProductoId,
      nextContext.ultimoServicioId,
      nextContext.ultimoTextoBusqueda,
      nextContext.datosJson
    ]
  );

  return findConversationContext({ empresaId, phone: telefonoCliente });
}
