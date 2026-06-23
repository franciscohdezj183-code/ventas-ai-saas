import { query } from '../config/database.js';
import { mcpClient } from '../mcp/mcpClient.js';
import { getBotResponseProfile } from '../modules/bot-prompts/bot-prompts.service.js';
import { CONVERSATION_STATES, markThreadState } from '../modules/conversations/conversation-status.service.js';
import { logger } from '../utils/logger.js';
import { normalizeMexicanPhoneNumber } from '../whatsapp/whatsapp-number.helper.js';

const HANDOFF_TIMEOUT_MS = 4 * 60 * 1000;
const EXPIRATION_JOB_INTERVAL_MS = 30 * 1000;
const ACTIVE_STATES = ['PENDING_OWNER', 'HUMAN_TAKEOVER'];
let expirationJob = null;
let tableReadyPromise = null;

async function getHandoffConfig(empresaId) {
  const profile = await getBotResponseProfile(empresaId).catch(() => null);
  const timeoutMinutes = Number(profile?.handoff?.timeout_minutos ?? 4);

  return {
    timeoutMinutes: Number.isInteger(timeoutMinutes) && timeoutMinutes > 0 ? Math.min(timeoutMinutes, 120) : 4,
    mensajeTomar: profile?.handoff?.mensaje_tomar || 'Listo, un asesor continuara contigo por aqui',
    mensajeDeclinar: profile?.handoff?.mensaje_declinar || 'Por ahora el asesor no esta disponible, pero yo puedo seguir ayudandote',
    mensajeExpirado: profile?.handoff?.mensaje_expirado || 'Por ahora el asesor no esta disponible, pero puedo seguir ayudandote por aqui',
    mensajeReactivar: profile?.handoff?.mensaje_reactivar || 'Voy a continuar apoyandote por aqui. Que otra duda tienes?'
  };
}

function normalizePhone(value) {
  return normalizeMexicanPhoneNumber(value);
}

function phoneKey(value) {
  const phone = normalizePhone(value);
  return phone.length > 10 ? phone.slice(-10) : phone;
}

function phonesMatch(left, right) {
  const leftPhone = normalizePhone(left);
  const rightPhone = normalizePhone(right);

  if (!leftPhone || !rightPhone) {
    return false;
  }

  return leftPhone === rightPhone || phoneKey(leftPhone) === phoneKey(rightPhone);
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ownerResponseKind(message) {
  const text = normalizeText(message);

  if (['1', 'si', 'sí', 'yo lo atiendo', 'yo atiendo', 'lo atiendo'].includes(text)) {
    return 'ACCEPT';
  }

  if (['2', 'no', 'no puedo', 'que siga el bot', 'siga el bot'].includes(text)) {
    return 'DECLINE';
  }

  return null;
}

async function ensureHumanHandoffTable() {
  if (!tableReadyPromise) {
    tableReadyPromise = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS human_handoffs (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          empresa_id BIGINT UNSIGNED NOT NULL,
          conversation_id BIGINT UNSIGNED NULL,
          telefono_cliente VARCHAR(40) NOT NULL,
          telefono_dueno VARCHAR(40) NULL,
          estado ENUM('PENDING_OWNER', 'HUMAN_TAKEOVER', 'BOT_ACTIVE', 'EXPIRED', 'DECLINED') NOT NULL DEFAULT 'PENDING_OWNER',
          motivo VARCHAR(120) NULL,
          mensaje_cliente TEXT NULL,
          whatsapp_chat_id VARCHAR(80) NULL,
          producto_id BIGINT UNSIGNED NULL,
          servicio_id BIGINT UNSIGNED NULL,
          owner_notified_at DATETIME NULL,
          owner_responded_at DATETIME NULL,
          expires_at DATETIME NOT NULL,
          last_activity_at DATETIME NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY human_handoffs_empresa_cliente_estado_index (empresa_id, telefono_cliente, estado),
          KEY human_handoffs_empresa_dueno_estado_index (empresa_id, telefono_dueno, estado),
          KEY human_handoffs_expires_at_index (expires_at),
          KEY human_handoffs_last_activity_at_index (last_activity_at),
          CONSTRAINT human_handoffs_empresa_id_foreign
            FOREIGN KEY (empresa_id) REFERENCES empresas (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT human_handoffs_conversation_id_foreign
            FOREIGN KEY (conversation_id) REFERENCES conversaciones (id)
            ON DELETE SET NULL
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );

      const [columns] = await query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'human_handoffs'
           AND COLUMN_NAME = 'whatsapp_chat_id'`
      );

      if (columns.length === 0) {
        await query('ALTER TABLE human_handoffs ADD COLUMN whatsapp_chat_id VARCHAR(80) NULL AFTER mensaje_cliente');
      }
    })();
  }

  return tableReadyPromise;
}

async function sendWhatsappText(empresaId, phone, message) {
  if (!phone || !message) {
    return;
  }

  const { sendWhatsappMessage } = await import('../modules/whatsapp/whatsapp.service.js');
  await sendWhatsappMessage(empresaId, phone, message);
}

async function notifyOwnerForHandoff({
  empresaId,
  handoffId,
  ownerPhone,
  customerPhone,
  companyName,
  productOrService,
  customerMessage
}) {
  if (!ownerPhone) {
    logger.info('human_handoff_owner_notification_omitted', {
      empresaId,
      telefonoCliente: customerPhone,
      handoffId,
      reason: 'missing_owner_phone'
    });
    return { estado: 'OMITIDA', motivo: 'telefono_dueno no configurado' };
  }

  const message = buildOwnerNotification({
    customerPhone,
    companyName,
    productOrService,
    customerMessage
  });

  try {
    await sendWhatsappText(empresaId, ownerPhone, message);
    await query(
      `UPDATE human_handoffs
       SET owner_notified_at = NOW(),
           telefono_dueno = COALESCE(telefono_dueno, ?)
       WHERE id = ?`,
      [ownerPhone, handoffId]
    );
    logger.info('human_handoff_owner_notified', {
      empresaId,
      telefonoCliente: customerPhone,
      telefonoDueno: ownerPhone,
      handoffId
    });
    return { estado: 'ENVIADA', telefono_dueno: ownerPhone };
  } catch (error) {
    logger.error('human_handoff_owner_notification_error', {
      empresaId,
      telefonoCliente: customerPhone,
      telefonoDueno: ownerPhone,
      handoffId,
      error
    });
    return {
      estado: 'ERROR',
      telefono_dueno: ownerPhone,
      error: error instanceof Error ? error.message : String(error ?? 'Error enviando notificacion')
    };
  }
}

async function getCompanyConfig(empresaId, mcpClientInstance = mcpClient) {
  const result = await mcpClientInstance.callTool('obtener_configuracion_empresa', {
    empresa_id: empresaId
  });

  return result.empresa ?? {};
}

function buildOwnerNotification({
  customerPhone,
  companyName,
  productOrService,
  customerMessage
}) {
  return [
    'Nuevo cliente interesado',
    '',
    `Cliente: ${customerPhone}`,
    `Empresa: ${companyName || '-'}`,
    `Producto/servicio: ${productOrService || '-'}`,
    `Mensaje: ${customerMessage || '-'}`,
    '',
    'Puedes atenderlo ahora?',
    '',
    'Responde:',
    '1 = Si, yo lo atiendo',
    '2 = No puedo, que siga el bot'
  ].join('\n');
}

async function findActiveHandoff({ empresaId, phone }) {
  await ensureHumanHandoffTable();
  const cleanPhone = normalizePhone(phone);
  const [rows] = await query(
    `SELECT *
     FROM human_handoffs
     WHERE empresa_id = ?
       AND telefono_cliente = ?
       AND estado IN ('PENDING_OWNER', 'HUMAN_TAKEOVER')
     ORDER BY updated_at DESC
     LIMIT 1`,
    [empresaId, cleanPhone]
  );

  return rows[0] ?? null;
}

export async function hasActiveHandoff({ empresaId, phone }) {
  return Boolean(await findActiveHandoff({ empresaId, phone }));
}

export async function requestHandoff({
  empresa_id: empresaId,
  conversation_id: conversationId,
  telefono_cliente: telefonoCliente,
  whatsapp_chat_id: whatsappChatId = null,
  mensaje_cliente: mensajeCliente,
  producto_id: productoId = null,
  servicio_id: servicioId = null,
  motivo = 'INTENCION_COMPRA',
  mcpClientInstance = mcpClient
}) {
  await ensureHumanHandoffTable();
  const handoffConfig = await getHandoffConfig(empresaId);
  const customerPhone = normalizePhone(telefonoCliente);
  const activeHandoff = await findActiveHandoff({ empresaId, phone: customerPhone });

  if (activeHandoff) {
    const company = await getCompanyConfig(empresaId, mcpClientInstance);
    const ownerPhone = normalizePhone(activeHandoff.telefono_dueno ?? company.telefono_dueno ?? company.telefono);

    await query(
      `UPDATE human_handoffs
       SET last_activity_at = NOW(),
           expires_at = DATE_ADD(NOW(), INTERVAL ${handoffConfig.timeoutMinutes} MINUTE),
           mensaje_cliente = COALESCE(?, mensaje_cliente),
           whatsapp_chat_id = COALESCE(?, whatsapp_chat_id),
           telefono_dueno = COALESCE(telefono_dueno, ?)
       WHERE id = ?`,
      [mensajeCliente ?? null, whatsappChatId ?? null, ownerPhone || null, activeHandoff.id]
    );
    const ownerNotification = await notifyOwnerForHandoff({
      empresaId,
      handoffId: activeHandoff.id,
      ownerPhone,
      customerPhone,
      companyName: company.nombre,
      productOrService: mensajeCliente,
      customerMessage: mensajeCliente
    });

    if (ownerNotification.estado !== 'ENVIADA') {
      logger.error('human_handoff_duplicate_owner_notification_not_sent', {
        empresaId,
        telefonoCliente: customerPhone,
        handoffId: activeHandoff.id,
        ownerNotification
      });
    }

    const nextStatus = ownerNotification.estado === 'ENVIADA' ? activeHandoff.estado : 'ERROR';

    logger.info('human_handoff_duplicate_processed', {
      empresaId,
      telefonoCliente: customerPhone,
      handoffId: activeHandoff.id,
      estado: activeHandoff.estado,
      ownerNotification
    });

    return {
      handoff_id: activeHandoff.id,
      estado: nextStatus,
      duplicate: true,
      owner_notification: ownerNotification
    };
  }

  const company = await getCompanyConfig(empresaId, mcpClientInstance);
  const ownerPhone = normalizePhone(company.telefono_dueno ?? company.telefono);
  const productOrService = mensajeCliente;
  const [result] = await query(
    `INSERT INTO human_handoffs
      (empresa_id, conversation_id, telefono_cliente, telefono_dueno, estado, motivo,
       mensaje_cliente, whatsapp_chat_id, producto_id, servicio_id, owner_notified_at, expires_at, last_activity_at)
     VALUES (?, ?, ?, ?, 'PENDING_OWNER', ?, ?, ?, ?, ?, NULL, DATE_ADD(NOW(), INTERVAL ${handoffConfig.timeoutMinutes} MINUTE), NOW())`,
    [
      empresaId,
      conversationId ?? null,
      customerPhone,
      ownerPhone || null,
      motivo,
      mensajeCliente ?? null,
      whatsappChatId ?? null,
      productoId ?? null,
      servicioId ?? null
    ]
  );

  await markThreadState({
    empresaId,
    telefonoCliente: customerPhone,
    estado: CONVERSATION_STATES.REQUIRES_HUMAN
  });

  const ownerNotification = await notifyOwnerForHandoff({
    empresaId,
    handoffId: result.insertId,
    ownerPhone,
    customerPhone,
    companyName: company.nombre,
    productOrService,
    customerMessage: mensajeCliente
  });

  if (ownerNotification.estado !== 'ENVIADA') {
    logger.error('human_handoff_owner_notification_not_sent', {
      empresaId,
      telefonoCliente: customerPhone,
      handoffId: result.insertId,
      ownerNotification
    });
  }

  logger.info('human_handoff_requested', {
    empresaId,
    telefonoCliente: customerPhone,
    telefonoDueno: ownerPhone || null,
    handoffId: result.insertId,
    ownerNotification
  });

  return {
    handoff_id: result.insertId,
    estado: ownerNotification.estado === 'ENVIADA' ? 'PENDING_OWNER' : 'ERROR',
    duplicate: false,
    owner_notification: ownerNotification
  };
}

export async function handleOwnerResponse({ empresa_id: empresaId, telefono_dueno: telefonoDueno, mensaje }) {
  await ensureHumanHandoffTable();
  const handoffConfig = await getHandoffConfig(empresaId);
  const ownerPhone = normalizePhone(telefonoDueno);
  const responseKind = ownerResponseKind(mensaje);
  const [rows] = await query(
    `SELECT *
     FROM human_handoffs
     WHERE empresa_id = ?
       AND estado = 'PENDING_OWNER'
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 10`,
    [empresaId]
  );
  const handoff =
    rows.find((row) => phonesMatch(row.telefono_dueno, ownerPhone)) ??
    (
      responseKind && rows.length === 1 && !phonesMatch(rows[0].telefono_cliente, ownerPhone)
        ? rows[0]
        : null
    );

  if (!handoff) {
    return { handled: false };
  }

  if (responseKind === 'ACCEPT') {
    await query(
      `UPDATE human_handoffs
       SET estado = 'HUMAN_TAKEOVER',
           owner_responded_at = NOW(),
           last_activity_at = NOW(),
           expires_at = DATE_ADD(NOW(), INTERVAL ${handoffConfig.timeoutMinutes} MINUTE)
       WHERE id = ?`,
      [handoff.id]
    );

    await markThreadState({
      empresaId,
      telefonoCliente: handoff.telefono_cliente,
      estado: CONVERSATION_STATES.HUMAN_ACTIVE
    });

    logger.info('human_handoff_accepted', {
      empresaId,
      handoffId: handoff.id,
      telefonoCliente: handoff.telefono_cliente
    });

    return {
      handled: true,
      action: 'ACCEPTED',
      telefono_cliente: handoff.telefono_cliente,
      whatsapp_chat_id: handoff.whatsapp_chat_id,
      mensaje_cliente: handoffConfig.mensajeTomar
    };
  }

  if (responseKind === 'DECLINE') {
    await query(
      `UPDATE human_handoffs
       SET estado = 'BOT_ACTIVE',
           owner_responded_at = NOW(),
           last_activity_at = NOW()
       WHERE id = ?`,
      [handoff.id]
    );

    await markThreadState({
      empresaId,
      telefonoCliente: handoff.telefono_cliente,
      estado: CONVERSATION_STATES.BOT_ACTIVE
    });

    logger.info('human_handoff_declined', {
      empresaId,
      handoffId: handoff.id,
      telefonoCliente: handoff.telefono_cliente
    });

    return {
      handled: true,
      action: 'DECLINED',
      telefono_cliente: handoff.telefono_cliente,
      whatsapp_chat_id: handoff.whatsapp_chat_id,
      mensaje_cliente: handoffConfig.mensajeDeclinar
    };
  }

  return { handled: true, action: 'IGNORED' };
}

export async function isOwnerPhone({ empresaId, phone, mcpClientInstance = mcpClient }) {
  const company = await getCompanyConfig(empresaId, mcpClientInstance);
  return phonesMatch(company.telefono_dueno ?? company.telefono, phone);
}

export async function isBotPausedForCustomer({ empresa_id: empresaId, telefono_cliente: telefonoCliente }) {
  await ensureHumanHandoffTable();
  const cleanPhone = normalizePhone(telefonoCliente);
  const [rows] = await query(
    `SELECT id
     FROM human_handoffs
     WHERE empresa_id = ?
       AND telefono_cliente = ?
       AND estado = 'HUMAN_TAKEOVER'
     LIMIT 1`,
    [empresaId, cleanPhone]
  );

  return Boolean(rows[0]);
}

export async function markCustomerActivity({ empresa_id: empresaId, telefono_cliente: telefonoCliente }) {
  await ensureHumanHandoffTable();
  const handoffConfig = await getHandoffConfig(empresaId);
  await query(
    `UPDATE human_handoffs
     SET last_activity_at = NOW(),
         expires_at = CASE
           WHEN estado = 'HUMAN_TAKEOVER' THEN DATE_ADD(NOW(), INTERVAL ${handoffConfig.timeoutMinutes} MINUTE)
           ELSE expires_at
         END
     WHERE empresa_id = ?
       AND telefono_cliente = ?
       AND estado IN ('PENDING_OWNER', 'HUMAN_TAKEOVER')`,
    [empresaId, normalizePhone(telefonoCliente)]
  );
}

export async function notifyOwnerOfCustomerMessage({ empresa_id: empresaId, telefono_cliente: telefonoCliente, mensaje }) {
  await ensureHumanHandoffTable();
  const cleanPhone = normalizePhone(telefonoCliente);
  const [rows] = await query(
    `SELECT *
     FROM human_handoffs
     WHERE empresa_id = ?
       AND telefono_cliente = ?
       AND estado = 'HUMAN_TAKEOVER'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [empresaId, cleanPhone]
  );
  const handoff = rows[0];

  if (!handoff?.telefono_dueno) {
    return false;
  }

  await markCustomerActivity({ empresa_id: empresaId, telefono_cliente: cleanPhone });
  await query(
    `INSERT INTO conversaciones
      (empresa_id, telefono_cliente, mensaje, respuesta, estado, tipo_mensaje, fecha)
     VALUES (?, ?, ?, NULL, 'human_active', 'customer', NOW())`,
    [empresaId, cleanPhone, String(mensaje ?? '').trim()]
  );

  await sendWhatsappText(
    empresaId,
    handoff.telefono_dueno,
    [`Mensaje del cliente ${cleanPhone}:`, '', mensaje].join('\n')
  );

  return true;
}

export async function resumeBotForCustomer({ empresa_id: empresaId, telefono_cliente: telefonoCliente }) {
  await ensureHumanHandoffTable();
  const cleanPhone = normalizePhone(telefonoCliente);
  await query(
    `UPDATE human_handoffs
     SET estado = 'BOT_ACTIVE',
         last_activity_at = NOW()
     WHERE empresa_id = ?
       AND telefono_cliente = ?
       AND estado IN ('PENDING_OWNER', 'HUMAN_TAKEOVER')`,
    [empresaId, cleanPhone]
  );

  await markThreadState({
    empresaId,
    telefonoCliente: cleanPhone,
    estado: CONVERSATION_STATES.BOT_ACTIVE
  });
}

export async function expirePendingHandoffs() {
  await ensureHumanHandoffTable();
  const [rows] = await query(
    `SELECT *
     FROM human_handoffs
     WHERE estado = 'PENDING_OWNER'
       AND expires_at <= NOW()`
  );

  for (const handoff of rows) {
    await query(
      `UPDATE human_handoffs
       SET estado = 'EXPIRED',
           last_activity_at = NOW()
       WHERE id = ? AND estado = 'PENDING_OWNER'`,
      [handoff.id]
    );

    await markThreadState({
      empresaId: handoff.empresa_id,
      telefonoCliente: handoff.telefono_cliente,
      estado: CONVERSATION_STATES.BOT_ACTIVE
    });

    await sendWhatsappText(
      handoff.empresa_id,
      handoff.telefono_cliente,
      (await getHandoffConfig(handoff.empresa_id)).mensajeExpirado
    ).catch((error) => logger.error('human_handoff_pending_expire_message_error', { error, handoffId: handoff.id }));

    logger.info('human_handoff_pending_expired', {
      empresaId: handoff.empresa_id,
      handoffId: handoff.id,
      telefonoCliente: handoff.telefono_cliente
    });
  }

  return rows.length;
}

export async function expireInactiveTakeovers() {
  await ensureHumanHandoffTable();
  const [rows] = await query(
    `SELECT *
     FROM human_handoffs
     WHERE estado = 'HUMAN_TAKEOVER'
       AND (motivo IS NULL OR motivo <> 'PAUSA_MANUAL')
       AND last_activity_at <= DATE_SUB(NOW(), INTERVAL 4 MINUTE)`
  );

  for (const handoff of rows) {
    await query(
      `UPDATE human_handoffs
       SET estado = 'BOT_ACTIVE',
           last_activity_at = NOW()
       WHERE id = ? AND estado = 'HUMAN_TAKEOVER'`,
      [handoff.id]
    );

    await markThreadState({
      empresaId: handoff.empresa_id,
      telefonoCliente: handoff.telefono_cliente,
      estado: CONVERSATION_STATES.BOT_ACTIVE
    });

    await sendWhatsappText(
      handoff.empresa_id,
      handoff.telefono_cliente,
      (await getHandoffConfig(handoff.empresa_id)).mensajeReactivar
    ).catch((error) => logger.error('human_handoff_takeover_expire_message_error', { error, handoffId: handoff.id }));

    logger.info('human_handoff_takeover_expired', {
      empresaId: handoff.empresa_id,
      handoffId: handoff.id,
      telefonoCliente: handoff.telefono_cliente
    });
  }

  return rows.length;
}

export function startHumanHandoffExpirationJob() {
  if (expirationJob) {
    return;
  }

  expirationJob = setInterval(() => {
    Promise.allSettled([expirePendingHandoffs(), expireInactiveTakeovers()]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') {
          logger.error('human_handoff_expiration_job_error', { error: result.reason });
        }
      }
    });
  }, EXPIRATION_JOB_INTERVAL_MS);
  expirationJob.unref?.();
}

export function stopHumanHandoffExpirationJob() {
  if (expirationJob) {
    clearInterval(expirationJob);
    expirationJob = null;
  }
}

export const humanHandoffActiveStates = ACTIVE_STATES;
