import { query } from '../../config/database.js';
import { appendCompanyScope, companyScopeCondition, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { createHttpError } from '../../utils/http-error.js';

const SERVICE_COLUMNS = `
  s.id,
  s.empresa_id,
  s.nombre,
  s.descripcion,
  s.categoria_id,
  s.precio,
  s.tipo_precio,
  s.unidad_medida,
  s.duracion_minutos AS duracion,
  s.duracion_minutos,
  s.requiere_medidas,
  s.requiere_cantidad,
  s.incluye,
  s.no_incluye,
  s.notas_cotizacion,
  s.precio_minimo,
  s.estado,
  s.fecha_creacion,
  s.fecha_actualizacion,
  e.nombre AS empresa_nombre,
  c.nombre AS categoria_nombre
`;

const PRICE_TYPES = new Set(['FIJO', 'DESDE', 'POR_UNIDAD', 'POR_M2', 'POR_HORA', 'COTIZACION']);
const MEASUREMENT_UNITS = new Set(['servicio', 'pieza', 'paquete', 'm2', 'hora', 'asesor']);

function nullableText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function nullablePositiveInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw createHttpError(400, `${fieldName} debe ser un entero mayor a 0`);
  }

  return number;
}

function nullableMoney(value, fieldName, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw createHttpError(400, `${fieldName} es requerido`);
    }

    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw createHttpError(400, `${fieldName} debe ser mayor o igual a 0`);
  }

  return number;
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function normalizeServicePayload(payload, auth) {
  const nombre = String(payload.nombre ?? '').trim();
  const categoriaId = payload.categoria_id ? Number(payload.categoria_id) : null;
  const estado = String(payload.estado ?? 'ACTIVO').trim().toUpperCase();
  const tipoPrecio = String(payload.tipo_precio ?? 'FIJO').trim().toUpperCase();
  const durationValue = payload.duracion_minutos ?? payload.duracion;
  const duracion = nullablePositiveInteger(durationValue, 'La duracion');

  if (!nombre) {
    throw createHttpError(400, 'El nombre del servicio es requerido');
  }

  if (!PRICE_TYPES.has(tipoPrecio)) {
    throw createHttpError(400, 'El tipo de precio no es valido');
  }

  const precio = nullableMoney(payload.precio, 'El precio', { required: tipoPrecio !== 'COTIZACION' });

  if (categoriaId !== null && (!Number.isInteger(categoriaId) || categoriaId <= 0)) {
    throw createHttpError(400, 'La categoria no es valida');
  }

  if (!['ACTIVO', 'INACTIVO'].includes(estado)) {
    throw createHttpError(400, 'El estado debe ser ACTIVO o INACTIVO');
  }

  const requestedUnit = nullableText(payload.unidad_medida);
  const unidadMedida = requestedUnit ?? (tipoPrecio === 'POR_M2' ? 'm2' : null);

  if (unidadMedida !== null && !MEASUREMENT_UNITS.has(unidadMedida)) {
    throw createHttpError(400, 'La unidad de medida no es valida');
  }

  return {
    empresaId: resolveScopedEmpresaId(auth, payload.empresa_id),
    categoriaId,
    nombre,
    descripcion: nullableText(payload.descripcion),
    precio,
    tipoPrecio,
    unidadMedida,
    duracion,
    requiereMedidas: tipoPrecio === 'POR_M2' || normalizeBoolean(payload.requiere_medidas),
    requiereCantidad: normalizeBoolean(payload.requiere_cantidad),
    incluye: nullableText(payload.incluye),
    noIncluye: nullableText(payload.no_incluye),
    notasCotizacion: nullableText(payload.notas_cotizacion),
    precioMinimo: nullableMoney(payload.precio_minimo, 'El precio minimo'),
    estado
  };
}

function mapDatabaseError(error) {
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    throw createHttpError(400, 'La empresa seleccionada no existe');
  }

  if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
    throw createHttpError(409, 'No se puede eliminar este servicio porque tiene datos relacionados');
  }

  throw error;
}

export async function findServices(auth) {
  const scope = companyScopeCondition(auth, 's');
  const whereClause = scope.clause ? `WHERE ${scope.clause}` : '';

  const [rows] = await query(
    `SELECT ${SERVICE_COLUMNS}
     FROM servicios s
     INNER JOIN empresas e ON e.id = s.empresa_id
     LEFT JOIN categorias c ON c.empresa_id = s.empresa_id AND c.id = s.categoria_id
     ${whereClause}
     ORDER BY s.fecha_creacion DESC`,
    scope.params
  );

  return rows;
}

export async function findServiceById(serviceId, auth) {
  const scope = appendCompanyScope(auth, [serviceId], 's');

  const [rows] = await query(
    `SELECT ${SERVICE_COLUMNS}
     FROM servicios s
     INNER JOIN empresas e ON e.id = s.empresa_id
     LEFT JOIN categorias c ON c.empresa_id = s.empresa_id AND c.id = s.categoria_id
     WHERE s.id = ?
     ${scope.clause}
     LIMIT 1`,
    scope.params
  );

  return rows[0] ?? null;
}

export async function createService(payload, auth) {
  const service = normalizeServicePayload(payload, auth);

  try {
    const [result] = await query(
      `INSERT INTO servicios
        (empresa_id, categoria_id, nombre, descripcion, precio, tipo_precio, unidad_medida, duracion_minutos,
         requiere_medidas, requiere_cantidad, incluye, no_incluye, notas_cotizacion, precio_minimo, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        service.empresaId,
        service.categoriaId,
        service.nombre,
        service.descripcion,
        service.precio,
        service.tipoPrecio,
        service.unidadMedida,
        service.duracion,
        service.requiereMedidas ? 1 : 0,
        service.requiereCantidad ? 1 : 0,
        service.incluye,
        service.noIncluye,
        service.notasCotizacion,
        service.precioMinimo,
        service.estado
      ]
    );

    return findServiceById(result.insertId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateService(serviceId, payload, auth) {
  const currentService = await findServiceById(serviceId, auth);

  if (!currentService) {
    throw createHttpError(404, 'Servicio no encontrado');
  }

  const service = normalizeServicePayload(payload, auth);
  const scope = appendCompanyScope(auth, [serviceId], 'servicios');

  try {
    await query(
      `UPDATE servicios
       SET empresa_id = ?,
           categoria_id = ?,
           nombre = ?,
           descripcion = ?,
           precio = ?,
           tipo_precio = ?,
           unidad_medida = ?,
           duracion_minutos = ?,
           requiere_medidas = ?,
           requiere_cantidad = ?,
           incluye = ?,
           no_incluye = ?,
           notas_cotizacion = ?,
           precio_minimo = ?,
           estado = ?
       WHERE id = ?
       ${scope.clause}`,
      [
        service.empresaId,
        service.categoriaId,
        service.nombre,
        service.descripcion,
        service.precio,
        service.tipoPrecio,
        service.unidadMedida,
        service.duracion,
        service.requiereMedidas ? 1 : 0,
        service.requiereCantidad ? 1 : 0,
        service.incluye,
        service.noIncluye,
        service.notasCotizacion,
        service.precioMinimo,
        service.estado,
        ...scope.params
      ]
    );

    return findServiceById(serviceId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteService(serviceId, auth) {
  const scope = appendCompanyScope(auth, [serviceId], 'servicios');

  try {
    const [result] = await query(`DELETE FROM servicios WHERE id = ? ${scope.clause}`, scope.params);

    if (result.affectedRows === 0) {
      throw createHttpError(404, 'Servicio no encontrado');
    }

    return true;
  } catch (error) {
    mapDatabaseError(error);
  }
}
