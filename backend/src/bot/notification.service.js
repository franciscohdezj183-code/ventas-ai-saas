import { query } from '../config/database.js';
import { mcpClient } from '../mcp/mcpClient.js';
import { normalizeMexicanPhoneNumber } from '../whatsapp/whatsapp-number.helper.js';

const NOTIFIABLE_INTENTS = new Set(['INTENCION_COMPRA', 'HABLAR_ASESOR', 'AGENDAR_CITA']);

function normalizePhone(value) {
  return normalizeMexicanPhoneNumber(value);
}

function buildOwnerNotificationMessage({
  telefono,
  solicitud,
  mensajeOriginal,
  empresa,
  fecha,
  estadoBot = null
}) {
  return [
    '🛎️ Nuevo cliente interesado',
    '',
    `Cliente: ${telefono || '-'}`,
    `Empresa: ${empresa || '-'}`,
    `Solicitud: ${solicitud || '-'}`,
    `Mensaje: ${mensajeOriginal || '-'}`,
    estadoBot ? `Atencion del bot: ${estadoBot}` : null,
    `Fecha: ${fecha}`,
    '',
    'Dale seguimiento lo antes posible.'
  ].filter((line) => line !== null).join('\n');
}

async function resolveProductName({ empresaId, productoId, fallback, mcpClientInstance }) {
  if (!productoId) {
    return fallback;
  }

  try {
    const result = await mcpClientInstance.callTool('obtener_producto', {
      empresa_id: empresaId,
      producto_id: productoId
    });

    return result?.producto?.nombre ?? fallback;
  } catch {
    return fallback;
  }
}

async function createNotification({
  empresaId,
  leadId,
  tipo,
  telefonoDestino,
  mensaje
}) {
  const [result] = await query(
    `INSERT INTO notificaciones
      (empresa_id, lead_id, tipo, telefono_destino, mensaje, estado)
     VALUES (?, ?, ?, ?, ?, 'PENDIENTE')`,
    [empresaId, leadId ?? null, tipo, telefonoDestino || null, mensaje]
  );

  return result.insertId;
}

async function markNotificationSent(notificationId) {
  await query(
    `UPDATE notificaciones
     SET estado = 'ENVIADA',
         error = NULL,
         fecha_envio = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [notificationId]
  );
}

async function markNotificationError(notificationId, error) {
  await query(
    `UPDATE notificaciones
     SET estado = 'ERROR',
         error = ?
     WHERE id = ?`,
    [String(error?.message ?? error ?? 'Error enviando notificacion'), notificationId]
  );
}

export function shouldNotifyOwner(intentName) {
  return NOTIFIABLE_INTENTS.has(intentName);
}

export async function notifyOwnerForLead({
  empresaId,
  intent,
  toolResult,
  phone,
  message,
  mcpClientInstance = mcpClient
}) {
  if (!shouldNotifyOwner(intent?.intencion)) {
    return null;
  }

  const configResult = await mcpClientInstance.callTool('obtener_configuracion_empresa', {
    empresa_id: empresaId
  });
  const empresa = configResult.empresa;
  const telefonoDestino = normalizePhone(empresa?.telefono_dueno ?? empresa?.telefono);

  if (!telefonoDestino) {
    return { notification_id: null, estado: 'OMITIDA', motivo: 'telefono_dueno no configurado' };
  }

  const producto = await resolveProductName({
    empresaId,
    productoId: toolResult?.producto_id ?? intent?.parametros?.producto_id,
    fallback: toolResult?.interes ?? intent?.parametros?.interes ?? intent?.parametros?.texto,
    mcpClientInstance
  });
  const notificationMessage = buildOwnerNotificationMessage({
    telefono: normalizePhone(toolResult?.telefono ?? phone),
    solicitud: producto,
    mensajeOriginal: message,
    empresa: empresa?.nombre,
    fecha: new Date().toISOString(),
    estadoBot: toolResult?.handoff_duplicate ? 'Ya habia solicitud activa' : 'Requiere seguimiento'
  });
  const notificationId = await createNotification({
    empresaId,
    leadId: toolResult?.lead_id,
    tipo: intent.intencion,
    telefonoDestino,
    mensaje: notificationMessage
  });

  try {
    const { sendWhatsappMessage } = await import('../modules/whatsapp/whatsapp.service.js');
    await sendWhatsappMessage(empresaId, telefonoDestino, notificationMessage);
    await markNotificationSent(notificationId);
    return { notification_id: notificationId, estado: 'ENVIADA' };
  } catch (error) {
    await markNotificationError(notificationId, error);
    return { notification_id: notificationId, estado: 'ERROR' };
  }
}
