function cleanDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function isBaileysGroupJid(jid) {
  return String(jid ?? '').endsWith('@g.us');
}

export function isBaileysStatusJid(jid) {
  return String(jid ?? '') === 'status@broadcast';
}

export function isBaileysLidJid(jid) {
  return String(jid ?? '').endsWith('@lid');
}

export function isBaileysPhoneJid(jid) {
  return String(jid ?? '').endsWith('@s.whatsapp.net');
}

export function phoneFromBaileysJid(jid) {
  return isBaileysPhoneJid(jid) ? cleanDigits(String(jid).split('@')[0]) : null;
}

function normalizePhoneJid(jid) {
  return phoneFromBaileysJid(jid) ? String(jid).trim() : null;
}

export function provisionalLidIdentity(jid) {
  const lid = cleanDigits(String(jid ?? '').split('@')[0]);
  return lid ? `lid:${lid}` : 'lid:unresolved';
}

export function extractBaileysText(message) {
  const content = message?.message;

  if (!content) {
    return null;
  }

  return content.conversation
    ?? content.extendedTextMessage?.text
    ?? content.imageMessage?.caption
    ?? content.videoMessage?.caption
    ?? null;
}

export function normalizeBaileysDestination(destination) {
  const raw = String(destination ?? '').trim();

  if (!raw) {
    throw new Error('El destino de WhatsApp es requerido');
  }

  if (raw.endsWith('@s.whatsapp.net') || raw.endsWith('@lid')) {
    return raw;
  }

  const digits = cleanDigits(raw);

  if (!digits) {
    throw new Error('Destino de WhatsApp invalido');
  }

  return `${digits}@s.whatsapp.net`;
}

function directParticipantMatchesRemote(message, remoteJid) {
  const participant = message?.key?.participant ?? message?.participant ?? null;
  const participantAlt = message?.key?.participantAlt ?? message?.participantAlt ?? null;
  const participantLid = message?.key?.participantLid ?? message?.participantLid ?? null;

  return !participant || [participant, participantAlt, participantLid].filter(Boolean).includes(remoteJid);
}

async function getPhoneJidForLid({ remoteJid, message, sock }) {
  if (!isBaileysLidJid(remoteJid)) {
    return normalizePhoneJid(remoteJid);
  }

  const remoteJidAlt = normalizePhoneJid(message?.key?.remoteJidAlt ?? message?.remoteJidAlt);

  if (remoteJidAlt) {
    return remoteJidAlt;
  }

  if (directParticipantMatchesRemote(message, remoteJid)) {
    const participantPhoneJid = normalizePhoneJid(
      message?.key?.participantPn
        ?? message?.participantPn
        ?? message?.key?.participantAlt
        ?? message?.participantAlt
    );

    if (participantPhoneJid) {
      return participantPhoneJid;
    }
  }

  const mappedPhoneJid = await sock?.signalRepository?.lidMapping?.getPNForLID?.(remoteJid);
  return normalizePhoneJid(mappedPhoneJid);
}

export async function normalizeBaileysInboundMessage({ empresaId, message, sock = null }) {
  const remoteJid = message?.key?.remoteJid;
  const messageId = message?.key?.id;

  if (!remoteJid || !messageId || message?.key?.fromMe || isBaileysStatusJid(remoteJid) || isBaileysGroupJid(remoteJid)) {
    return null;
  }

  const body = extractBaileysText(message);

  if (!String(body ?? '').trim()) {
    return null;
  }

  const resolvedPhoneId = await getPhoneJidForLid({ remoteJid, message, sock });
  const phone = phoneFromBaileysJid(resolvedPhoneId) ?? (isBaileysLidJid(remoteJid) ? provisionalLidIdentity(remoteJid) : null);
  const source = isBaileysLidJid(remoteJid)
    ? (resolvedPhoneId ? 'baileys_lid_resolved' : 'baileys_lid_provisional')
    : 'baileys';

  return {
    eventId: `${Number(empresaId)}-${messageId}`,
    empresaId: Number(empresaId),
    provider: 'baileys',
    messageId,
    whatsappChatId: remoteJid,
    resolvedPhoneId,
    phone,
    messageType: 'text',
    body: String(body),
    receivedAt: new Date(Number(message.messageTimestamp ? Number(message.messageTimestamp) * 1000 : Date.now())).toISOString(),
    metadata: {
      fromMe: false,
      source,
      identityResolution: source,
      originalLidJid: isBaileysLidJid(remoteJid) ? remoteJid : null
    }
  };
}
