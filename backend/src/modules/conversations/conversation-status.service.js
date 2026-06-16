import { query } from '../../config/database.js';

export const CONVERSATION_STATES = Object.freeze({
  OPEN: 'open',
  BOT_ACTIVE: 'bot_active',
  REQUIRES_HUMAN: 'requires_human',
  HUMAN_ACTIVE: 'human_active',
  CLOSED: 'closed'
});

export function normalizeConversationState(value, fallback = CONVERSATION_STATES.OPEN) {
  const state = String(value ?? '').trim().toLowerCase();
  return Object.values(CONVERSATION_STATES).includes(state) ? state : fallback;
}

export async function markThreadState({ empresaId, telefonoCliente, estado, agenteUsuarioId = null }) {
  const normalizedState = normalizeConversationState(estado);

  await query(
    `UPDATE conversaciones
     SET estado = ?,
         agente_usuario_id = COALESCE(?, agente_usuario_id)
     WHERE empresa_id = ?
       AND telefono_cliente = ?
       AND estado <> 'closed'`,
    [normalizedState, agenteUsuarioId ? Number(agenteUsuarioId) : null, empresaId, telefonoCliente]
  );

  return normalizedState;
}

export async function getThreadState({ empresaId, telefonoCliente }) {
  const [rows] = await query(
    `SELECT estado
     FROM conversaciones
     WHERE empresa_id = ?
       AND telefono_cliente = ?
     ORDER BY fecha DESC, id DESC
     LIMIT 1`,
    [empresaId, telefonoCliente]
  );

  return rows[0]?.estado ?? CONVERSATION_STATES.OPEN;
}
