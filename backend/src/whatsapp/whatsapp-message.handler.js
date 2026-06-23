import { logger } from '../utils/logger.js';
import { processIncomingCustomerMessage } from '../modules/ai/ai.service.js';
import {
  handleOwnerResponse,
  isBotPausedForCustomer,
  isOwnerPhone,
  markCustomerActivity,
  notifyOwnerOfCustomerMessage
} from '../bot/humanHandoffManager.js';
import { normalizeCompanyId, normalizePhoneForWhatsapp } from './whatsapp.types.js';
import {
  extractPhoneFromWhatsappId,
  getRealCustomerPhone,
  normalizeWhatsappId
} from './whatsapp-number.helper.js';

async function getContactName(message) {
  try {
    const contact = await Promise.race([
      message.getContact(),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500))
    ]);

    return contact?.pushname || contact?.name || contact?.shortName || contact?.verifiedName || null;
  } catch {
    return null;
  }
}

export async function handleIncomingWhatsappMessage({ companyId, client, message }) {
  const empresaId = normalizeCompanyId(companyId);
  const whatsappId = normalizeWhatsappId(message?.from);
  const hasBody = Boolean(message?.body?.trim());
  const ignoreGroups = process.env.WHATSAPP_IGNORE_GROUPS !== 'false';
  const isGroup = whatsappId.includes('@g.us');

  logger.info('whatsapp_message_received', {
    empresaId,
    whatsappId,
    fromMe: Boolean(message?.fromMe),
    isGroup,
    hasBody
  });

  if (message?.fromMe || !hasBody || (ignoreGroups && isGroup)) {
    logger.info('whatsapp_message_ignored', {
      empresaId,
      whatsappId,
      reason: message?.fromMe ? 'from_me' : isGroup ? 'group' : 'empty_body'
    });
    return;
  }

  const customerPhone = await getRealCustomerPhone({ client, msg: message });
  const fallbackPhone = extractPhoneFromWhatsappId(whatsappId);
  const incomingPhoneCandidates = Array.from(new Set([customerPhone, fallbackPhone].filter(Boolean)));
  const contactName = await getContactName(message);

  if (!customerPhone) {
    logger.info('whatsapp_message_ignored', {
      empresaId,
      whatsappId,
      reason: 'missing_phone'
    });
    return;
  }

  let ownerResponse = { handled: false };

  for (const phoneCandidate of incomingPhoneCandidates) {
    ownerResponse = await handleOwnerResponse({
      empresa_id: empresaId,
      telefono_dueno: phoneCandidate,
      mensaje: message.body
    });

    if (ownerResponse.handled) {
      break;
    }
  }

  if (ownerResponse.handled) {
    if (ownerResponse.mensaje_cliente && ownerResponse.telefono_cliente) {
      const to = ownerResponse.whatsapp_chat_id || normalizePhoneForWhatsapp(ownerResponse.telefono_cliente);
      logger.info('whatsapp_owner_response_send_attempt', {
        empresaId,
        telefonoCliente: ownerResponse.telefono_cliente,
        to
      });

      await client.sendMessage(to, ownerResponse.mensaje_cliente);

      logger.info('whatsapp_owner_response_sent', {
        empresaId,
        telefonoCliente: ownerResponse.telefono_cliente,
        to
      });
    }
    return;
  }

  for (const phoneCandidate of incomingPhoneCandidates) {
    if (await isOwnerPhone({ empresaId, phone: phoneCandidate })) {
      logger.info('whatsapp_message_ignored', {
        empresaId,
        from: phoneCandidate,
        reason: 'owner_phone'
      });
      return;
    }
  }

  await markCustomerActivity({
    empresa_id: empresaId,
    telefono_cliente: customerPhone
  });

  if (await isBotPausedForCustomer({ empresa_id: empresaId, telefono_cliente: customerPhone })) {
    logger.info('whatsapp_bot_paused_for_customer', {
      empresaId,
      telefonoCliente: customerPhone
    });

    await notifyOwnerOfCustomerMessage({
      empresa_id: empresaId,
      telefono_cliente: customerPhone,
      mensaje: message.body
    });
    return;
  }

  const result = await processIncomingCustomerMessage({
    empresaId,
    phone: customerPhone,
    message: message.body,
    whatsappChatId: whatsappId,
    contactName
  });

  if (result.respuesta) {
    const chat = await message.getChat();
    logger.info('whatsapp_bot_response_send_attempt', {
      empresaId,
      telefonoCliente: customerPhone,
      whatsappId,
      conversacionId: result.conversacion_id ?? null
    });

    await chat.sendMessage(result.respuesta);

    logger.info('whatsapp_bot_response_sent', {
      empresaId,
      telefonoCliente: customerPhone,
      whatsappId,
      conversacionId: result.conversacion_id ?? null
    });
  }

  logger.info('whatsapp_bot_response_processed', {
    empresaId,
    telefonoCliente: customerPhone,
    whatsappId,
    contactName,
    hasResponse: Boolean(result.respuesta),
    conversacionId: result.conversacion_id ?? null,
    intencion: result.intencion ?? null
  });
}
