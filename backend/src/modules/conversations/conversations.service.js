import { query } from '../../config/database.js';
import { appendCompanyScope, companyScopeCondition, getAuthenticatedEmpresaId, isSuperAdmin, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { resumeBotForCustomer, isBotPausedForCustomer } from '../../bot/humanHandoffManager.js';
import { sendWhatsappMessage } from '../whatsapp/whatsapp.service.js';
import { CONVERSATION_STATES, markThreadState, normalizeConversationState } from './conversation-status.service.js';
import { createHttpError } from '../../utils/http-error.js';
import { normalizeMexicanPhoneNumber } from '../../whatsapp/whatsapp-number.helper.js';

const CONVERSATION_COLUMNS = `
  c.id,
  c.empresa_id,
  c.telefono_cliente,
  c.whatsapp_id,
  c.whatsapp_message_id,
  c.contact_name,
  c.mensaje,
  c.respuesta,
  c.estado,
  c.tipo_mensaje,
  c.agente_usuario_id,
  c.fecha,
  c.fecha_creacion,
  c.fecha_actualizacion,
  e.nombre AS empresa_nombre
`;

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
    empresaId: resolveScopedEmpresaId(auth, payload.empresa_id),
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

function normalizePhone(value) {
  return normalizeMexicanPhoneNumber(value);
}

function normalizeInboxStateFilter(value) {
  const state = String(value ?? '').trim().toLowerCase();
  const legacyMap = {
    abierta: CONVERSATION_STATES.OPEN,
    abiertas: CONVERSATION_STATES.OPEN,
    bot: CONVERSATION_STATES.BOT_ACTIVE,
    humano: CONVERSATION_STATES.HUMAN_ACTIVE,
    requiere_humano: CONVERSATION_STATES.REQUIRES_HUMAN
  };

  return legacyMap[state] ?? normalizeConversationState(state, '');
}

function resolveThreadState(thread) {
  if (thread.handoff_estado === 'PENDING_OWNER') {
    return CONVERSATION_STATES.REQUIRES_HUMAN;
  }

  if (thread.handoff_estado === 'HUMAN_TAKEOVER') {
    return CONVERSATION_STATES.HUMAN_ACTIVE;
  }

  return normalizeConversationState(
    thread.ultimo_estado,
    Number(thread.mensajes_sin_respuesta) > 0 ? CONVERSATION_STATES.OPEN : CONVERSATION_STATES.BOT_ACTIVE
  );
}

function normalizeInboxFilters(auth, filters = {}) {
  const empresaId = isSuperAdmin(auth)
    ? resolveScopedEmpresaId(auth, filters.empresa_id, { requiredForSuperAdmin: false })
    : getAuthenticatedEmpresaId(auth);

  return {
    empresaId,
    telefono: normalizePhone(filters.telefono_cliente ?? filters.telefono ?? filters.query),
    search: String(filters.search ?? filters.query ?? '').trim(),
    estado: normalizeInboxStateFilter(filters.estado),
    limit: Math.min(Math.max(Number(filters.limit) || 40, 1), 100),
    offset: Math.max(Number(filters.offset) || 0, 0)
  };
}

function buildInboxWhere(auth, filters = {}, alias = 'c') {
  const input = normalizeInboxFilters(auth, filters);
  const conditions = [];
  const params = [];

  if (input.empresaId) {
    conditions.push(`${alias}.empresa_id = ?`);
    params.push(input.empresaId);
  }

  if (input.telefono) {
    conditions.push(`${alias}.telefono_cliente LIKE ?`);
    params.push(`%${input.telefono}%`);
  } else if (input.search) {
    conditions.push(`(${alias}.telefono_cliente LIKE ? OR ${alias}.contact_name LIKE ? OR ${alias}.whatsapp_id LIKE ? OR ${alias}.mensaje LIKE ? OR ${alias}.respuesta LIKE ?)`);
    params.push(`%${input.search}%`, `%${input.search}%`, `%${input.search}%`, `%${input.search}%`, `%${input.search}%`);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    input
  };
}

export async function findConversations(auth, filters = {}) {
  const params = [];
  const conditions = [];
  const scope = companyScopeCondition(auth, 'c');

  if (scope.clause) {
    conditions.push(scope.clause);
    params.push(...scope.params);
  } else if (filters.empresa_id) {
    conditions.push('c.empresa_id = ?');
    params.push(resolveScopedEmpresaId(auth, filters.empresa_id, { requiredForSuperAdmin: false }));
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

export async function findInboxThreads(auth, filters = {}) {
  const where = buildInboxWhere(auth, filters, 'c');
  const [rows] = await query(
    `SELECT
       latest.empresa_id,
       latest.telefono_cliente,
       latest.whatsapp_id,
       latest.contact_name,
       latest.empresa_nombre,
       latest.ultimo_mensaje,
       latest.ultima_respuesta,
       latest.ultimo_estado,
       latest.ultima_fecha,
       latest.total_mensajes,
       latest.mensajes_sin_respuesta,
       hh.estado AS handoff_estado
     FROM (
       SELECT
         c.empresa_id,
         c.telefono_cliente,
         SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(c.whatsapp_id, '') ORDER BY c.fecha DESC, c.id DESC SEPARATOR '\n---\n'), '\n---\n', 1) AS whatsapp_id,
         SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(c.contact_name, '') ORDER BY c.fecha DESC, c.id DESC SEPARATOR '\n---\n'), '\n---\n', 1) AS contact_name,
         e.nombre AS empresa_nombre,
         SUBSTRING_INDEX(GROUP_CONCAT(c.mensaje ORDER BY c.fecha DESC, c.id DESC SEPARATOR '\n---\n'), '\n---\n', 1) AS ultimo_mensaje,
         SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(c.respuesta, '') ORDER BY c.fecha DESC, c.id DESC SEPARATOR '\n---\n'), '\n---\n', 1) AS ultima_respuesta,
         SUBSTRING_INDEX(GROUP_CONCAT(c.estado ORDER BY c.fecha DESC, c.id DESC SEPARATOR '\n---\n'), '\n---\n', 1) AS ultimo_estado,
         MAX(c.fecha) AS ultima_fecha,
         COUNT(*) AS total_mensajes,
         SUM(CASE WHEN c.respuesta IS NULL OR c.respuesta = '' THEN 1 ELSE 0 END) AS mensajes_sin_respuesta
       FROM conversaciones c
       INNER JOIN empresas e ON e.id = c.empresa_id
       ${where.clause}
       GROUP BY c.empresa_id, c.telefono_cliente, e.nombre
     ) latest
     LEFT JOIN human_handoffs hh
       ON hh.empresa_id = latest.empresa_id
      AND hh.telefono_cliente = latest.telefono_cliente
      AND hh.estado IN ('PENDING_OWNER', 'HUMAN_TAKEOVER')
     ORDER BY latest.ultima_fecha DESC
     LIMIT ?
     OFFSET ?`,
    [...where.params, where.input.limit, where.input.offset]
  );

  return rows
    .filter((thread) => {
      if (!where.input.estado) return true;
      return resolveThreadState(thread) === where.input.estado;
    })
    .map((thread) => ({
      ...thread,
      total_mensajes: Number(thread.total_mensajes ?? 0),
      mensajes_sin_respuesta: Number(thread.mensajes_sin_respuesta ?? 0),
      estado_inbox: resolveThreadState(thread)
    }));
}

export async function findInboxThread(auth, { empresaId, telefono }) {
  const scopedEmpresaId = resolveScopedEmpresaId(auth, empresaId);
  const cleanPhone = normalizePhone(telefono);

  if (!cleanPhone) {
    throw createHttpError(400, 'El telefono del cliente es requerido');
  }

  const [messages] = await query(
    `SELECT ${CONVERSATION_COLUMNS}
     FROM conversaciones c
     INNER JOIN empresas e ON e.id = c.empresa_id
     WHERE c.empresa_id = ?
       AND c.telefono_cliente = ?
     ORDER BY c.fecha ASC, c.id ASC`,
    [scopedEmpresaId, cleanPhone]
  );

  const [handoffs] = await query(
    `SELECT id, estado, motivo, owner_notified_at, owner_responded_at, expires_at, last_activity_at
     FROM human_handoffs
     WHERE empresa_id = ?
       AND telefono_cliente = ?
     ORDER BY updated_at DESC
     LIMIT 5`,
    [scopedEmpresaId, cleanPhone]
  );

  return {
    empresa_id: scopedEmpresaId,
    telefono_cliente: cleanPhone,
    whatsapp_id: messages[messages.length - 1]?.whatsapp_id ?? null,
    contact_name: messages.find((message) => message.contact_name)?.contact_name ?? null,
    estado_inbox: handoffs.find((handoff) => handoff.estado === 'PENDING_OWNER')
      ? CONVERSATION_STATES.REQUIRES_HUMAN
      : handoffs.find((handoff) => handoff.estado === 'HUMAN_TAKEOVER')
        ? CONVERSATION_STATES.HUMAN_ACTIVE
        : (messages[messages.length - 1]?.estado ?? CONVERSATION_STATES.OPEN),
    bot_pausado: await isBotPausedForCustomer({ empresa_id: scopedEmpresaId, telefono_cliente: cleanPhone }).catch(() => false),
    handoff_activo: handoffs.find((handoff) => ['PENDING_OWNER', 'HUMAN_TAKEOVER'].includes(handoff.estado)) ?? null,
    handoffs,
    mensajes: messages
  };
}

export async function pauseBotForThread(auth, { empresaId, telefono }) {
  const scopedEmpresaId = resolveScopedEmpresaId(auth, empresaId);
  const cleanPhone = normalizePhone(telefono);

  if (!cleanPhone) {
    throw createHttpError(400, 'El telefono del cliente es requerido');
  }

  await query(
    `INSERT INTO human_handoffs
      (empresa_id, telefono_cliente, estado, motivo, expires_at, last_activity_at)
     VALUES (?, ?, 'HUMAN_TAKEOVER', 'PAUSA_MANUAL', DATE_ADD(NOW(), INTERVAL 4 MINUTE), NOW())`,
    [scopedEmpresaId, cleanPhone]
  );
  await markThreadState({
    empresaId: scopedEmpresaId,
    telefonoCliente: cleanPhone,
    estado: CONVERSATION_STATES.HUMAN_ACTIVE,
    agenteUsuarioId: auth.user?.id
  });

  return findInboxThread(auth, { empresaId: scopedEmpresaId, telefono: cleanPhone });
}

export async function resumeBotForThread(auth, { empresaId, telefono }) {
  const scopedEmpresaId = resolveScopedEmpresaId(auth, empresaId);
  const cleanPhone = normalizePhone(telefono);

  await resumeBotForCustomer({ empresa_id: scopedEmpresaId, telefono_cliente: cleanPhone });
  return findInboxThread(auth, { empresaId: scopedEmpresaId, telefono: cleanPhone });
}

export async function sendThreadReply(auth, { empresaId, telefono, mensaje }) {
  const scopedEmpresaId = resolveScopedEmpresaId(auth, empresaId);
  const cleanPhone = normalizePhone(telefono);
  const cleanMessage = String(mensaje ?? '').trim();

  if (!cleanPhone || !cleanMessage) {
    throw createHttpError(400, 'Telefono y mensaje son requeridos');
  }

  const thread = await findInboxThread(auth, { empresaId: scopedEmpresaId, telefono: cleanPhone });
  const whatsappId = thread.whatsapp_id || thread.mensajes?.find((message) => message.whatsapp_id)?.whatsapp_id || null;

  await sendWhatsappMessage(scopedEmpresaId, whatsappId || cleanPhone, cleanMessage);
  await query(
    `INSERT INTO conversaciones
      (empresa_id, telefono_cliente, whatsapp_id, contact_name, mensaje, respuesta, estado, tipo_mensaje, agente_usuario_id, fecha)
     VALUES (?, ?, ?, ?, ?, ?, 'human_active', 'human', ?, NOW())`,
    [
      scopedEmpresaId,
      thread.telefono_cliente,
      whatsappId,
      thread.contact_name || null,
      '[Respuesta manual desde inbox]',
      cleanMessage,
      auth.user?.id ?? null
    ]
  );
  await markThreadState({
    empresaId: scopedEmpresaId,
    telefonoCliente: cleanPhone,
    estado: CONVERSATION_STATES.HUMAN_ACTIVE,
    agenteUsuarioId: auth.user?.id
  });

  return findInboxThread(auth, { empresaId: scopedEmpresaId, telefono: thread.telefono_cliente });
}

export async function closeThread(auth, { empresaId, telefono }) {
  const scopedEmpresaId = resolveScopedEmpresaId(auth, empresaId);
  const cleanPhone = normalizePhone(telefono);

  if (!cleanPhone) {
    throw createHttpError(400, 'El telefono del cliente es requerido');
  }

  await resumeBotForCustomer({ empresa_id: scopedEmpresaId, telefono_cliente: cleanPhone });
  await markThreadState({
    empresaId: scopedEmpresaId,
    telefonoCliente: cleanPhone,
    estado: CONVERSATION_STATES.CLOSED,
    agenteUsuarioId: auth.user?.id
  });

  return findInboxThread(auth, { empresaId: scopedEmpresaId, telefono: cleanPhone });
}

export async function findConversationById(conversationId, auth) {
  const scope = appendCompanyScope(auth, [conversationId], 'c');

  const [rows] = await query(
    `SELECT ${CONVERSATION_COLUMNS}
     FROM conversaciones c
     INNER JOIN empresas e ON e.id = c.empresa_id
     WHERE c.id = ?
     ${scope.clause}
     LIMIT 1`,
    scope.params
  );

  return rows[0] ?? null;
}

export async function createConversation(payload, auth) {
  const conversation = normalizeConversationPayload(payload, auth);

  try {
    const [result] = await query(
    `INSERT INTO conversaciones
        (empresa_id, telefono_cliente, whatsapp_id, contact_name, mensaje, respuesta, estado, tipo_mensaje, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation.empresaId,
        conversation.telefonoCliente,
        null,
        null,
        conversation.mensaje,
        conversation.respuesta,
        conversation.respuesta ? CONVERSATION_STATES.BOT_ACTIVE : CONVERSATION_STATES.OPEN,
        conversation.respuesta ? 'bot' : 'customer',
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
  const scope = appendCompanyScope(auth, [conversationId], 'conversaciones');

  try {
    await query(
      `UPDATE conversaciones
       SET empresa_id = ?,
           telefono_cliente = ?,
           mensaje = ?,
           respuesta = ?,
           estado = ?,
           fecha = ?
       WHERE id = ?
       ${scope.clause}`,
      [
        conversation.empresaId,
        conversation.telefonoCliente,
        conversation.mensaje,
        conversation.respuesta,
        conversation.respuesta ? CONVERSATION_STATES.BOT_ACTIVE : CONVERSATION_STATES.OPEN,
        conversation.fecha,
        ...scope.params
      ]
    );

    return findConversationById(conversationId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteConversation(conversationId, auth) {
  const scope = appendCompanyScope(auth, [conversationId], 'conversaciones');
  const [result] = await query(`DELETE FROM conversaciones WHERE id = ? ${scope.clause}`, scope.params);

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Conversacion no encontrada');
  }

  return true;
}
