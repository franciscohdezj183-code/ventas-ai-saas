import whatsappWeb from 'whatsapp-web.js';
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
  normalizeMexicanPhoneNumber,
  normalizeWhatsappId
} from './whatsapp-number.helper.js';

const { MessageMedia } = whatsappWeb;
const customerMessageOperations = new Map();

function customerOperationKey(empresaId, phone) {
  return `${empresaId}:${normalizeMexicanPhoneNumber(phone).replace(/\D/g, '')}`;
}

export async function runCustomerMessageOperation({ empresaId, phone, operation }) {
  const key = customerOperationKey(empresaId, phone);
  const previous = customerMessageOperations.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => null)
    .then(operation)
    .finally(() => {
      if (customerMessageOperations.get(key) === next) {
        customerMessageOperations.delete(key);
      }
    });

  customerMessageOperations.set(key, next);
  return next;
}

export function resetWhatsappMessageOperationsForTests() {
  customerMessageOperations.clear();
}

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

function getWhatsappMessageId(message) {
  const rawId = message?.id?._serialized ?? message?.id?.id ?? message?.id;
  const id = String(rawId ?? '').trim();
  return id || null;
}

function mediaCaption(media, fallback) {
  const caption = String(media?.caption ?? '').trim();
  return caption || fallback;
}

async function sendMediaResult({ chat, result, mediaFactory = MessageMedia }) {
  const response = String(result?.respuesta ?? '').trim();
  const mediaItems = Array.isArray(result?.medios) ? result.medios : [];
  const imageItems = mediaItems.filter((media) => media?.type === 'image' && media?.url);

  if (imageItems.length === 0) {
    if (response) {
      await chat.sendMessage(response);
    }

    return { mediaSent: 0, textSent: Boolean(response) };
  }

  let mediaSent = 0;

  for (const [index, media] of imageItems.entries()) {
    try {
      const messageMedia = await mediaFactory.fromUrl(media.url, { unsafeMime: true });
      const caption = index === 0 ? mediaCaption(media, response) : mediaCaption(media, '');
      const options = caption ? { caption } : undefined;

      await chat.sendMessage(messageMedia, options);
      mediaSent += 1;
    } catch (error) {
      logger.error('whatsapp_bot_media_send_error', {
        mediaUrl: media.url,
        error
      });
    }
  }

  if (mediaSent === 0 && response) {
    await chat.sendMessage(response);
    return { mediaSent, textSent: true };
  }

  return { mediaSent, textSent: false };
}

export async function sendBotResultToChat({ chat, result, mediaFactory = MessageMedia }) {
  return sendMediaResult({ chat, result, mediaFactory });
}

export async function resolveOutgoingChat({ message, client, whatsappId }) {
  try {
    const chat = await message?.getChat?.();

    if (chat?.sendMessage) {
      return chat;
    }
  } catch (error) {
    logger.error('whatsapp_get_chat_for_reply_error', {
      whatsappId,
      error
    });
  }

  if (!client?.sendMessage || !whatsappId) {
    throw new Error('No fue posible resolver el chat de WhatsApp para responder');
  }

  return {
    sendMessage(content, options) {
      return client.sendMessage(whatsappId, content, options);
    }
  };
}

function buildIncomingMediaMetadata(message) {
  return {
    hasMedia: Boolean(message?.hasMedia),
    type: message?.type ?? null,
    mimetype: message?._data?.mimetype ?? message?.mimetype ?? null,
    filename: message?._data?.filename ?? message?.filename ?? null
  };
}

async function forwardIncomingMediaToOwner({ client, empresaId, message, notification }) {
  const ownerPhone = normalizePhoneForWhatsapp(notification?.telefono_dueno);
  const caption = String(notification?.caption ?? '').trim();

  if (!ownerPhone || !message?.hasMedia) {
    return { sent: false, reason: ownerPhone ? 'missing_media' : 'missing_owner_phone' };
  }

  try {
    const media = await message.downloadMedia();

    if (!media) {
      return { sent: false, reason: 'media_download_empty' };
    }

    await client.sendMessage(ownerPhone, media, caption ? { caption } : undefined);
    logger.info('whatsapp_payment_proof_forwarded_to_owner', {
      empresaId,
      ownerPhone
    });
    return { sent: true };
  } catch (error) {
    logger.error('whatsapp_payment_proof_forward_error', {
      empresaId,
      ownerPhone,
      error
    });
    return {
      sent: false,
      reason: error instanceof Error ? error.message : String(error ?? 'forward_error')
    };
  }
}

export async function handleIncomingWhatsappMessage({ companyId, client, message }) {
  const empresaId = normalizeCompanyId(companyId);
  const whatsappId = normalizeWhatsappId(message?.from);
  const hasBody = Boolean(message?.body?.trim());
  const incomingMedia = buildIncomingMediaMetadata(message);
  const ignoreGroups = process.env.WHATSAPP_IGNORE_GROUPS !== 'false';
  const isGroup = whatsappId.includes('@g.us');

  logger.info('[WA][FILTER_START]', {
    empresaId,
    whatsappId,
    fromMe: Boolean(message?.fromMe),
    type: message?.type ?? null,
    hasBody,
    isGroup
  });
  logger.info('whatsapp_message_received', {
    empresaId,
    whatsappId,
    fromMe: Boolean(message?.fromMe),
    isGroup,
    hasBody
  });

  if (message?.fromMe || (!hasBody && !incomingMedia.hasMedia) || (ignoreGroups && isGroup)) {
    logger.info('[WA][IGNORED] razon exacta', {
      empresaId,
      whatsappId,
      reason: message?.fromMe ? 'fromMe true' : isGroup ? 'chat no permitido: grupo' : 'mensaje vacio',
      fromMe: Boolean(message?.fromMe),
      type: message?.type ?? null
    });
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
  const whatsappMessageId = getWhatsappMessageId(message);

  logger.info('[WA][NORMALIZE] from original / numero normalizado', {
    empresaId,
    from: message?.from ?? null,
    whatsappId,
    customerPhone,
    fallbackPhone,
    incomingPhoneCandidates
  });

  if (!customerPhone) {
    logger.info('[WA][IGNORED] razon exacta', {
      empresaId,
      whatsappId,
      reason: 'numero normalizado vacio'
    });
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
    logger.info('[WA][IGNORED] razon exacta', {
      empresaId,
      whatsappId,
      reason: 'mensaje manejado como respuesta de dueno',
      action: ownerResponse.action ?? null
    });

    if (ownerResponse.mensaje_dueno) {
      await client.sendMessage(whatsappId, ownerResponse.mensaje_dueno);
    }

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
      logger.info('[WA][IGNORED] razon exacta', {
        empresaId,
        from: phoneCandidate,
        reason: 'telefono de dueno'
      });
      logger.info('whatsapp_message_ignored', {
        empresaId,
        from: phoneCandidate,
        reason: 'owner_phone'
      });
      return;
    }
  }

  await runCustomerMessageOperation({
    empresaId,
    phone: customerPhone,
    operation: async () => {
      await markCustomerActivity({
        empresa_id: empresaId,
        telefono_cliente: customerPhone
      });

      if (await isBotPausedForCustomer({ empresa_id: empresaId, telefono_cliente: customerPhone })) {
        logger.info('[WA][CONVERSATION] bot pausado; se notificara al dueno', {
          empresaId,
          telefonoCliente: customerPhone
        });
        logger.info('whatsapp_bot_paused_for_customer', {
          empresaId,
          telefonoCliente: customerPhone
        });

        await notifyOwnerOfCustomerMessage({
          empresa_id: empresaId,
          telefono_cliente: customerPhone,
          mensaje: message.body
        });
        logger.info('[WA][MESSAGE_SAVED] mensaje registrado en modo humano', {
          empresaId,
          telefonoCliente: customerPhone
        });
        return;
      }

      logger.info('[WA][BOT_START]', {
        empresaId,
        telefonoCliente: customerPhone,
        whatsappId
      });
      const result = await processIncomingCustomerMessage({
        empresaId,
        phone: customerPhone,
        message: message.body,
        whatsappChatId: whatsappId,
        whatsappMessageId,
        contactName,
        incomingMedia
      });
      logger.info('[WA][CONVERSATION] creada/encontrada', {
        empresaId,
        telefonoCliente: customerPhone,
        id: result.conversacion_id ?? null
      });
      logger.info('[WA][MESSAGE_SAVED] messageId', {
        empresaId,
        messageId: result.conversacion_id ?? null,
        telefonoCliente: customerPhone
      });

      if (result.owner_media_notification) {
        await forwardIncomingMediaToOwner({
          client,
          empresaId,
          message,
          notification: result.owner_media_notification
        });
      }

      if (result.respuesta) {
        const chat = await resolveOutgoingChat({ message, client, whatsappId });
        logger.info('whatsapp_bot_response_send_attempt', {
          empresaId,
          telefonoCliente: customerPhone,
          whatsappId,
          conversacionId: result.conversacion_id ?? null,
          mediaCount: Array.isArray(result.medios) ? result.medios.length : 0
        });

        const sentAt = new Date().toISOString();
        const sendResult = await sendBotResultToChat({ chat, result });

        logger.info('[WA][BOT_REPLY_SENT]', {
          empresaId,
          telefonoCliente: customerPhone,
          whatsappId,
          conversacionId: result.conversacion_id ?? null
        });
        logger.info('whatsapp_bot_response_sent', {
          empresaId,
          telefonoCliente: customerPhone,
          whatsappId,
          conversacionId: result.conversacion_id ?? null,
          lastOutboundAt: sentAt,
          mediaSent: sendResult.mediaSent,
          textSent: sendResult.textSent
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
  });
}
