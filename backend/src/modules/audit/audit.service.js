import { query } from '../../config/database.js';

function nullableNumber(value) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function truncateText(value, maxLength = 1000) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function requestIp(req) {
  return truncateText(req?.headers?.['x-forwarded-for']?.split(',')[0] ?? req?.ip ?? req?.socket?.remoteAddress, 80);
}

function requestUserAgent(req) {
  return truncateText(req?.headers?.['user-agent'], 1000);
}

export async function createAuditLog({
  usuarioId = null,
  empresaId = null,
  accion,
  modulo,
  descripcion = null,
  ip = null,
  userAgent = null
}) {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    await query(
      `INSERT INTO audit_logs
        (usuario_id, empresa_id, accion, modulo, descripcion, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nullableNumber(usuarioId),
        nullableNumber(empresaId),
        truncateText(accion, 80),
        truncateText(modulo, 80),
        truncateText(descripcion, 1000),
        truncateText(ip, 80),
        truncateText(userAgent, 1000)
      ]
    );
  } catch (error) {
    console.error('Audit log failed:', error);
  }
}

export function auditFromRequest(req, { accion, modulo, descripcion, empresaId = null, usuarioId = null }) {
  return createAuditLog({
    usuarioId: usuarioId ?? req?.auth?.user?.id,
    empresaId: empresaId ?? req?.auth?.user?.empresaId,
    accion,
    modulo,
    descripcion,
    ip: requestIp(req),
    userAgent: requestUserAgent(req)
  });
}
