import { query } from '../../config/database.js';
import { createHttpError } from '../../utils/http-error.js';

const LEAD_COLUMNS = `
  l.id,
  l.empresa_id,
  l.nombre_cliente,
  l.telefono,
  l.interes,
  l.estado,
  l.fecha_creacion,
  l.fecha_actualizacion,
  e.nombre AS empresa_nombre
`;

const VALID_STATES = ['NUEVO', 'EN_PROCESO', 'GANADO', 'PERDIDO'];

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

function normalizeLeadPayload(payload, auth) {
  const nombreCliente = String(payload.nombre_cliente ?? '').trim();
  const telefono = String(payload.telefono ?? '').trim();
  const interes = String(payload.interes ?? '').trim();
  const estado = String(payload.estado ?? 'NUEVO').trim().toUpperCase();

  if (!nombreCliente) {
    throw createHttpError(400, 'El nombre del cliente es requerido');
  }

  if (!telefono) {
    throw createHttpError(400, 'El telefono es requerido');
  }

  if (!interes) {
    throw createHttpError(400, 'El interes es requerido');
  }

  if (!VALID_STATES.includes(estado)) {
    throw createHttpError(400, 'El estado no es valido');
  }

  return {
    empresaId: getScopedEmpresaId(auth, payload.empresa_id),
    nombreCliente,
    telefono,
    interes,
    estado
  };
}

function mapDatabaseError(error) {
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    throw createHttpError(400, 'La empresa seleccionada no existe');
  }

  if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
    throw createHttpError(409, 'No se puede eliminar este lead porque tiene datos relacionados');
  }

  throw error;
}

export async function findLeads(auth) {
  const params = [];
  const scopeCondition = isSuperAdmin(auth) ? '' : 'WHERE l.empresa_id = ?';

  if (!isSuperAdmin(auth)) {
    params.push(auth.user.empresaId);
  }

  const [rows] = await query(
    `SELECT ${LEAD_COLUMNS}
     FROM leads l
     INNER JOIN empresas e ON e.id = l.empresa_id
     ${scopeCondition}
     ORDER BY l.fecha_creacion DESC`,
    params
  );

  return rows;
}

export async function findLeadById(leadId, auth) {
  const params = [leadId];
  const scopeCondition = isSuperAdmin(auth) ? '' : 'AND l.empresa_id = ?';

  if (!isSuperAdmin(auth)) {
    params.push(auth.user.empresaId);
  }

  const [rows] = await query(
    `SELECT ${LEAD_COLUMNS}
     FROM leads l
     INNER JOIN empresas e ON e.id = l.empresa_id
     WHERE l.id = ?
     ${scopeCondition}
     LIMIT 1`,
    params
  );

  return rows[0] ?? null;
}

export async function getLeadStats(auth) {
  const params = [];
  const scopeCondition = isSuperAdmin(auth) ? '' : 'WHERE empresa_id = ?';

  if (!isSuperAdmin(auth)) {
    params.push(auth.user.empresaId);
  }

  const [rows] = await query(
    `SELECT estado, COUNT(*) AS total
     FROM leads
     ${scopeCondition}
     GROUP BY estado`,
    params
  );

  const stats = {
    total: 0,
    nuevo: 0,
    en_proceso: 0,
    ganado: 0,
    perdido: 0
  };

  rows.forEach((row) => {
    const total = Number(row.total);
    stats.total += total;
    stats[String(row.estado).toLowerCase()] = total;
  });

  return stats;
}

export async function createLead(payload, auth) {
  const lead = normalizeLeadPayload(payload, auth);

  try {
    const [result] = await query(
      `INSERT INTO leads (empresa_id, nombre_cliente, telefono, interes, estado)
       VALUES (?, ?, ?, ?, ?)`,
      [lead.empresaId, lead.nombreCliente, lead.telefono, lead.interes, lead.estado]
    );

    return findLeadById(result.insertId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateLead(leadId, payload, auth) {
  const currentLead = await findLeadById(leadId, auth);

  if (!currentLead) {
    throw createHttpError(404, 'Lead no encontrado');
  }

  const lead = normalizeLeadPayload(payload, auth);

  try {
    await query(
      `UPDATE leads
       SET empresa_id = ?,
           nombre_cliente = ?,
           telefono = ?,
           interes = ?,
           estado = ?
       WHERE id = ?`,
      [lead.empresaId, lead.nombreCliente, lead.telefono, lead.interes, lead.estado, leadId]
    );

    return findLeadById(leadId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteLead(leadId, auth) {
  const currentLead = await findLeadById(leadId, auth);

  if (!currentLead) {
    throw createHttpError(404, 'Lead no encontrado');
  }

  await query('DELETE FROM leads WHERE id = ?', [leadId]);
  return true;
}
