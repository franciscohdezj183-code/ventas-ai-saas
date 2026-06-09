import { query } from '../../config/database.js';
import { createHttpError } from '../../utils/http-error.js';

const CONVERSATION_COLUMNS = `
  c.id,
  c.empresa_id,
  c.telefono_cliente,
  c.mensaje,
  c.respuesta,
  c.fecha,
  c.fecha_creacion,
  c.fecha_actualizacion,
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

function normalizeConversationPayload(payload, auth) {
  const telefonoCliente = String(payload.telefono_cliente ?? '').trim();
  const mensaje = String(payload.mensaje ?? '').trim();
  const respuesta = String(payload.respuesta ?? '').trim() || null;
  const fecha = payload.fecha ? new Date(payload.fecha) : new Date();

  if (!telefonoCliente) {
    throw createHttpError(400, 'El telefono del cliente es requerido');
  }

  if (!mensaje) {
    throw createHttpError(400, 'El mensaje es requerido');
  }

  if (Number.isNaN(fecha.getTime())) {
    throw createHttpError(400, 'La fecha no es valida');
  }

  return {
    empresaId: getScopedEmpresaId(auth, payload.empresa_id),
    telefonoCliente,
    mensaje,
    respuesta,
    fecha
  };
}

function mapDatabaseError(error) {
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    throw createHttpError(400, 'La empresa seleccionada no existe');
  }

  throw error;
}

export async function findConversations(auth, filters = {}) {
  const params = [];
  const conditions = [];

  if (!isSuperAdmin(auth)) {
    conditions.push('c.empresa_id = ?');
    params.push(auth.user.empresaId);
  } else if (filters.empresa_id) {
    conditions.push('c.empresa_id = ?');
    params.push(Number(filters.empresa_id));
  }

  if (filters.telefono_cliente) {
    conditions.push('c.telefono_cliente LIKE ?');
    params.push(`%${String(filters.telefono_cliente).trim()}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await query(
    `SELECT ${CONVERSATION_COLUMNS}
     FROM conversaciones c
     INNER JOIN empresas e ON e.id = c.empresa_id
     ${whereClause}
     ORDER BY c.fecha DESC, c.id DESC`,
    params
  );

  return rows;
}

export async function findConversationById(conversationId, auth) {
  const params = [conversationId];
  const scopeCondition = isSuperAdmin(auth) ? '' : 'AND c.empresa_id = ?';

  if (!isSuperAdmin(auth)) {
    params.push(auth.user.empresaId);
  }

  const [rows] = await query(
    `SELECT ${CONVERSATION_COLUMNS}
     FROM conversaciones c
     INNER JOIN empresas e ON e.id = c.empresa_id
     WHERE c.id = ?
     ${scopeCondition}
     LIMIT 1`,
    params
  );

  return rows[0] ?? null;
}

export async function createConversation(payload, auth) {
  const conversation = normalizeConversationPayload(payload, auth);

  try {
    const [result] = await query(
      `INSERT INTO conversaciones
        (empresa_id, telefono_cliente, mensaje, respuesta, fecha)
       VALUES (?, ?, ?, ?, ?)`,
      [
        conversation.empresaId,
        conversation.telefonoCliente,
        conversation.mensaje,
        conversation.respuesta,
        conversation.fecha
      ]
    );

    return findConversationById(result.insertId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateConversation(conversationId, payload, auth) {
  const currentConversation = await findConversationById(conversationId, auth);

  if (!currentConversation) {
    throw createHttpError(404, 'Conversacion no encontrada');
  }

  const conversation = normalizeConversationPayload(payload, auth);

  try {
    await query(
      `UPDATE conversaciones
       SET empresa_id = ?,
           telefono_cliente = ?,
           mensaje = ?,
           respuesta = ?,
           fecha = ?
       WHERE id = ?`,
      [
        conversation.empresaId,
        conversation.telefonoCliente,
        conversation.mensaje,
        conversation.respuesta,
        conversation.fecha,
        conversationId
      ]
    );

    return findConversationById(conversationId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteConversation(conversationId, auth) {
  const currentConversation = await findConversationById(conversationId, auth);

  if (!currentConversation) {
    throw createHttpError(404, 'Conversacion no encontrada');
  }

  await query('DELETE FROM conversaciones WHERE id = ?', [conversationId]);
  return true;
}
