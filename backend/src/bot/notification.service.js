import { query } from '../config/database.js';
import { mcpClient } from '../mcp/mcpClient.js';

const NOTIFIABLE_INTENTS = new Set(['INTENCION_COMPRA', 'HABLAR_ASESOR', 'AGENDAR_CITA']);

function normalizePhone(value) {
  return String(value ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

function buildOwnerNotificationMessage({
  cliente,
  telefono,
  interes,
  mensajeOriginal,
  empresa,
  fecha
}) {
  return [
    'Nuevo lead:',
    `Cliente: ${cliente || 'Cliente WhatsApp'}`,
    `Telefono: ${telefono || '-'}`,
    `Interes: ${interes || '-'}`,
    `Mensaje original: ${mensajeOriginal || '-'}`,
    `Empresa: ${empresa || '-'}`,
    `Fecha: ${fecha}`
  ].join('\n');
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
  const telefonoDestino = normalizePhone(empresa?.telefono_dueno);
  const notificationMessage = buildOwnerNotificationMessage({
    cliente: toolResult?.nombre_cliente,
    telefono: normalizePhone(toolResult?.telefono ?? phone),
    interes: toolResult?.interes ?? intent?.parametros?.interes ?? intent?.parametros?.texto,
    mensajeOriginal: message,
    empresa: empresa?.nombre,
    fecha: new Date().toISOString()
  });
  const notificationId = await createNotification({
    empresaId,
    leadId: toolResult?.lead_id,
    tipo: intent.intencion,
    telefonoDestino,
    mensaje: notificationMessage
  });

  if (!telefonoDestino) {
    await markNotificationError(notificationId, 'telefono_dueno no configurado');
    return { notification_id: notificationId, estado: 'ERROR' };
  }

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
