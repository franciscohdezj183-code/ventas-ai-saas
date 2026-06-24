import { query } from '../../config/database.js';
import { appendCompanyScope, companyScopeCondition, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { createHttpError } from '../../utils/http-error.js';

const ORDER_COLUMNS = `
  o.id,
  o.empresa_id,
  o.cliente_nombre,
  o.telefono_cliente,
  o.conversation_id,
  o.estado,
  o.total,
  o.notas,
  o.fecha,
  o.fecha_creacion,
  o.fecha_actualizacion,
  e.nombre AS empresa_nombre
`;

const VALID_STATES = ['NUEVO', 'CONFIRMADO', 'EN_PROCESO', 'ENTREGADO', 'CANCELADO'];

function mapOrderRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    total: Number(row.total ?? 0)
  };
}

function nullableText(value) {
  const cleanValue = String(value ?? '').trim();
  return cleanValue || null;
}

function resolveOrderEmpresaId(payload, auth) {
  if (auth) {
    return resolveScopedEmpresaId(auth, payload.empresa_id);
  }

  const empresaId = Number(payload.empresa_id);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return empresaId;
}

function normalizeOrderPayload(payload, auth) {
  const clienteNombre = String(payload.cliente_nombre ?? payload.nombre_cliente ?? '').trim();
  const telefonoCliente = nullableText(payload.telefono_cliente ?? payload.telefono);
  const conversationId = payload.conversation_id ? Number(payload.conversation_id) : null;
  const estado = String(payload.estado ?? 'NUEVO').trim().toUpperCase();
  const total = Number(payload.total ?? 0);
  const notas = nullableText(payload.notas);

  if (!clienteNombre) {
    throw createHttpError(400, 'El nombre del cliente es requerido');
  }

  if (conversationId !== null && (!Number.isInteger(conversationId) || conversationId <= 0)) {
    throw createHttpError(400, 'La conversacion no es valida');
  }

  if (!VALID_STATES.includes(estado)) {
    throw createHttpError(400, 'El estado del pedido no es valido');
  }

  if (!Number.isFinite(total) || total < 0) {
    throw createHttpError(400, 'El total debe ser mayor o igual a 0');
  }

  return {
    empresaId: resolveOrderEmpresaId(payload, auth),
    clienteNombre,
    telefonoCliente,
    conversationId,
    estado,
    total,
    notas
  };
}

function mapDatabaseError(error) {
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    throw createHttpError(400, 'La empresa o conversacion seleccionada no existe');
  }

  throw error;
}

export async function assertConversationBelongsToCompany(conversationId, empresaId, runQuery = query) {
  if (!conversationId) {
    return;
  }

  const [rows] = await runQuery(
    `SELECT id
     FROM conversaciones
     WHERE id = ?
       AND empresa_id = ?
     LIMIT 1`,
    [conversationId, empresaId]
  );

  if (!rows[0]) {
    throw createHttpError(400, 'La conversacion seleccionada no pertenece a la empresa del pedido');
  }
}

export async function findOrders(auth) {
  const scope = companyScopeCondition(auth, 'o');
  const whereClause = scope.clause ? `WHERE ${scope.clause}` : '';

  const [rows] = await query(
    `SELECT ${ORDER_COLUMNS}
     FROM pedidos o
     INNER JOIN empresas e ON e.id = o.empresa_id
     ${whereClause}
     ORDER BY o.fecha DESC, o.id DESC`,
    scope.params
  );

  return rows.map(mapOrderRow);
}

export async function findOrderById(orderId, auth, empresaId = null) {
  const scopedEmpresaId = empresaId ? Number(empresaId) : null;

  if (!auth && (!Number.isInteger(scopedEmpresaId) || scopedEmpresaId <= 0)) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  const scope = auth
    ? appendCompanyScope(auth, [orderId], 'o')
    : {
        clause: scopedEmpresaId ? 'AND o.empresa_id = ?' : '',
        params: scopedEmpresaId ? [orderId, scopedEmpresaId] : [orderId]
      };

  const [rows] = await query(
    `SELECT ${ORDER_COLUMNS}
     FROM pedidos o
     INNER JOIN empresas e ON e.id = o.empresa_id
     WHERE o.id = ?
     ${scope.clause}
     LIMIT 1`,
    scope.params
  );

  return mapOrderRow(rows[0] ?? null);
}

export async function createOrder(payload, auth) {
  const order = normalizeOrderPayload(payload, auth);

  try {
    await assertConversationBelongsToCompany(order.conversationId, order.empresaId);

    const [result] = await query(
      `INSERT INTO pedidos
        (empresa_id, cliente_nombre, telefono_cliente, conversation_id, estado, total, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        order.empresaId,
        order.clienteNombre,
        order.telefonoCliente,
        order.conversationId,
        order.estado,
        order.total,
        order.notas
      ]
    );

    return findOrderById(result.insertId, auth, order.empresaId);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateOrder(orderId, payload, auth) {
  const currentOrder = await findOrderById(orderId, auth);

  if (!currentOrder) {
    throw createHttpError(404, 'Pedido no encontrado');
  }

  const order = normalizeOrderPayload(payload, auth);
  const scope = appendCompanyScope(auth, [orderId], 'pedidos');

  try {
    await assertConversationBelongsToCompany(order.conversationId, order.empresaId);

    await query(
      `UPDATE pedidos
       SET empresa_id = ?,
           cliente_nombre = ?,
           telefono_cliente = ?,
           conversation_id = ?,
           estado = ?,
           total = ?,
           notas = ?
       WHERE id = ?
       ${scope.clause}`,
      [
        order.empresaId,
        order.clienteNombre,
        order.telefonoCliente,
        order.conversationId,
        order.estado,
        order.total,
        order.notas,
        ...scope.params
      ]
    );

    return findOrderById(orderId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteOrder(orderId, auth) {
  const scope = appendCompanyScope(auth, [orderId], 'pedidos');
  const [result] = await query(`DELETE FROM pedidos WHERE id = ? ${scope.clause}`, scope.params);

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Pedido no encontrado');
  }

  return true;
}
