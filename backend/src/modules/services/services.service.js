import { query } from '../../config/database.js';
import { createHttpError } from '../../utils/http-error.js';

const SERVICE_COLUMNS = `
  s.id,
  s.empresa_id,
  s.nombre,
  s.descripcion,
  s.precio,
  s.duracion_minutos AS duracion,
  s.estado,
  s.fecha_creacion,
  s.fecha_actualizacion,
  e.nombre AS empresa_nombre
`;

function isSuperAdmin(auth) {
  return auth?.user?.rol === 'SUPER_ADMIN';
}

function getScopedEmpresaId(auth, payloadEmpresaId) {
  if (isSuperAdmin(auth)) {
    const empresaId = Number(payloadEmpresaId);

    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      throw createHttpError(400, 'La empresa es requerida');
    }

    return empresaId;
  }

  return auth.user.empresaId;
}

function normalizeServicePayload(payload, auth) {
  const nombre = String(payload.nombre ?? '').trim();
  const precio = Number(payload.precio);
  const duracion = Number(payload.duracion);

  if (!nombre) {
    throw createHttpError(400, 'El nombre del servicio es requerido');
  }

  if (!Number.isFinite(precio) || precio < 0) {
    throw createHttpError(400, 'El precio debe ser mayor o igual a 0');
  }

  if (!Number.isInteger(duracion) || duracion <= 0) {
    throw createHttpError(400, 'La duracion debe ser un entero mayor a 0');
  }

  return {
    empresaId: getScopedEmpresaId(auth, payload.empresa_id),
    nombre,
    descripcion: String(payload.descripcion ?? '').trim() || null,
    precio,
    duracion
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
  const params = [];
  const scopeCondition = isSuperAdmin(auth) ? '' : 'WHERE s.empresa_id = ?';

  if (!isSuperAdmin(auth)) {
    params.push(auth.user.empresaId);
  }

  const [rows] = await query(
    `SELECT ${SERVICE_COLUMNS}
     FROM servicios s
     INNER JOIN empresas e ON e.id = s.empresa_id
     ${scopeCondition}
     ORDER BY s.fecha_creacion DESC`,
    params
  );

  return rows;
}

export async function findServiceById(serviceId, auth) {
  const params = [serviceId];
  const scopeCondition = isSuperAdmin(auth) ? '' : 'AND s.empresa_id = ?';

  if (!isSuperAdmin(auth)) {
    params.push(auth.user.empresaId);
  }

  const [rows] = await query(
    `SELECT ${SERVICE_COLUMNS}
     FROM servicios s
     INNER JOIN empresas e ON e.id = s.empresa_id
     WHERE s.id = ?
     ${scopeCondition}
     LIMIT 1`,
    params
  );

  return rows[0] ?? null;
}

export async function createService(payload, auth) {
  const service = normalizeServicePayload(payload, auth);

  try {
    const [result] = await query(
      `INSERT INTO servicios
        (empresa_id, nombre, descripcion, precio, duracion_minutos, estado)
       VALUES (?, ?, ?, ?, ?, 'ACTIVO')`,
      [
        service.empresaId,
        service.nombre,
        service.descripcion,
        service.precio,
        service.duracion
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

  try {
    await query(
      `UPDATE servicios
       SET empresa_id = ?,
           nombre = ?,
           descripcion = ?,
           precio = ?,
           duracion_minutos = ?
       WHERE id = ?`,
      [
        service.empresaId,
        service.nombre,
        service.descripcion,
        service.precio,
        service.duracion,
        serviceId
      ]
    );

    return findServiceById(serviceId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteService(serviceId, auth) {
  const currentService = await findServiceById(serviceId, auth);

  if (!currentService) {
    throw createHttpError(404, 'Servicio no encontrado');
  }

  await query('DELETE FROM servicios WHERE id = ?', [serviceId]);
  return true;
}
