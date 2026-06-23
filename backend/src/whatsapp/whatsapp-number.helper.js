import { logger } from '../utils/logger.js';

export function normalizeWhatsappId(value) {
  return String(value ?? '').trim();
}

export function normalizeMexicanPhoneNumber(value) {
  const rawValue = String(value ?? '').trim();
  const hasPlus = rawValue.startsWith('+');
  const digits = rawValue.replace(/[^\d]/g, '');

  if (!digits) {
    return '';
  }

  if (hasPlus) {
    return digits.startsWith('521') ? `+52${digits.slice(3)}` : `+${digits}`;
  }

  return digits.startsWith('521') ? `52${digits.slice(3)}` : digits;
}

export function extractPhoneFromWhatsappId(whatsappId) {
  const id = normalizeWhatsappId(whatsappId);
  const phone = id.split('@')[0];
  return normalizeMexicanPhoneNumber(phone);
}

async function attempt(label, fn) {
  try {
    return await fn();
  } catch (error) {
    logger.debug?.('whatsapp_real_phone_attempt_failed', {
      attempt: label,
      error: error instanceof Error ? error.message : String(error ?? 'unknown')
    });
    return null;
  }
}

export async function getRealCustomerPhone({ client, msg }) {
  const whatsappId = normalizeWhatsappId(msg?.from);

  const chatPhone = await attempt('chat_name', async () => {
    const chat = await msg.getChat();
    const chatName = String(chat?.name ?? '').trim();
    return chatName.startsWith('+') ? normalizeMexicanPhoneNumber(chatName) : null;
  });

  if (chatPhone) {
    return chatPhone;
  }

  const messageContactPhone = await attempt('message_contact', async () => {
    const contact = await msg.getContact();
    return contact?.number ? normalizeMexicanPhoneNumber(contact.number) : null;
  });

  if (messageContactPhone) {
    return messageContactPhone;
  }

  const clientContactPhone = await attempt('client_contact', async () => {
    if (!client?.getContactById || !whatsappId) {
      return null;
    }

    const contact = await client.getContactById(whatsappId);
    return contact?.number ? normalizeMexicanPhoneNumber(contact.number) : null;
  });

  if (clientContactPhone) {
    return clientContactPhone;
  }

  return extractPhoneFromWhatsappId(whatsappId);
}
