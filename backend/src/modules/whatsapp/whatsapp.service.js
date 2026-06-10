import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode';
import pkg from 'whatsapp-web.js';
import { env } from '../../config/env.js';
import { createHttpError } from '../../utils/http-error.js';
import { processIncomingCustomerMessage } from '../ai/ai.service.js';
import {
  handleOwnerResponse,
  isBotPausedForCustomer,
  isOwnerPhone,
  markCustomerActivity,
  notifyOwnerOfCustomerMessage
} from '../../bot/humanHandoffManager.js';

const { Client, LocalAuth, MessageMedia } = pkg;

const sessions = new Map();
const lastStatuses = new Map();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.resolve(__dirname, '../../../uploads');

function clientIdForCompany(companyId) {
  return `empresa-${companyId}`;
}

function baseStatus(companyId) {
  return {
    empresa_id: companyId,
    status: 'DISCONNECTED',
    qr: null,
    qr_image: null,
    phone: null,
    connected_at: null,
    last_error: null,
    events: [],
    updated_at: new Date().toISOString()
  };
}

function pushSessionEvent(session, type, message) {
  session.state.events = [
    {
      type,
      message,
      at: new Date().toISOString()
    },
    ...(session.state.events ?? [])
  ].slice(0, 12);
}

function clearAuthReadyTimer(session) {
  if (session.authReadyTimer) {
    clearTimeout(session.authReadyTimer);
    session.authReadyTimer = null;
  }
}

async function destroyClientQuietly(client) {
  try {
    await Promise.race([
      client.destroy(),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ]);
  } catch {
    // Puppeteer may already be half-closed after an initialize failure.
  }
}

function normalizeCompanyId(companyId) {
  const id = Number(companyId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return id;
}

function normalizePhoneForWhatsapp(phone) {
  const cleanPhone = String(phone ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');

  if (!cleanPhone) {
    throw createHttpError(400, 'El telefono destino es requerido');
  }

  return `${cleanPhone}@c.us`;
}

function cleanWhatsappPhone(phone) {
  return String(phone ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

async function getIncomingPhoneCandidates(message) {
  const candidates = new Set([
    cleanWhatsappPhone(message.from),
    cleanWhatsappPhone(message.author)
  ]);

  try {
    const contact = await Promise.race([
      message.getContact(),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500))
    ]);
    candidates.add(cleanWhatsappPhone(contact?.number));
    candidates.add(cleanWhatsappPhone(contact?.id?._serialized));
    candidates.add(cleanWhatsappPhone(contact?.id?.user));
  } catch {
    // Keep the raw WhatsApp id if contact metadata is not available.
  }

  return Array.from(candidates).filter(Boolean);
}

function getSession(companyId) {
  return sessions.get(companyId) ?? null;
}

function localUploadPathFromUrl(value) {
  const rawValue = String(value ?? '').trim();

  if (!rawValue) {
    return null;
  }

  try {
    const parsedUrl = new URL(rawValue, env.apiUrl);

    if (!parsedUrl.pathname.startsWith('/uploads/')) {
      return null;
    }

    const relativePath = decodeURIComponent(parsedUrl.pathname.replace(/^\/uploads\//, ''));
    const filePath = path.resolve(uploadsPath, relativePath);

    if (!filePath.startsWith(uploadsPath)) {
      return null;
    }

    return fs.existsSync(filePath) ? filePath : null;
  } catch {
    return null;
  }
}

function localFilePathFromValue(value) {
  const rawValue = String(value ?? '').trim();

  if (!rawValue) {
    return null;
  }

  const filePath = path.isAbsolute(rawValue) ? rawValue : path.resolve(process.cwd(), rawValue);
  return fs.existsSync(filePath) ? filePath : null;
}

async function mediaFromImageSource(source) {
  const localUploadPath = localUploadPathFromUrl(source);

  if (localUploadPath) {
    return MessageMedia.fromFilePath(localUploadPath);
  }

  const localFilePath = localFilePathFromValue(source);

  if (localFilePath) {
    return MessageMedia.fromFilePath(localFilePath);
  }

  return MessageMedia.fromUrl(source, { unsafeMime: true });
}

async function replyWithMedia(message, mediaItems = []) {
  const chat = await message.getChat();
  let sentCount = 0;

  for (const item of mediaItems) {
    if (item?.type !== 'image' || !item.url) {
      continue;
    }

    try {
      const media = await mediaFromImageSource(item.url);
      await chat.sendMessage(media, {
        caption: item.caption ?? ''
      });
      sentCount += 1;
    } catch {
      // If media fails, keep the normal text response path alive.
    }
  }

  return sentCount;
}

async function updateQr(session, qr) {
  session.state.qr = qr;
  session.state.qr_image = await qrcode.toDataURL(qr);
  session.state.status = 'QR_READY';
  session.state.updated_at = new Date().toISOString();
  pushSessionEvent(session, 'QR_READY', 'QR listo para escanear');
}

function attachClientEvents(session) {
  session.client.on('qr', (qr) => {
    updateQr(session, qr).catch((error) => {
      session.state.last_error = error.message;
      session.state.updated_at = new Date().toISOString();
    });
  });

  session.client.on('ready', () => {
    clearAuthReadyTimer(session);
    session.state.status = 'CONNECTED';
    session.state.qr = null;
    session.state.qr_image = null;
    session.state.phone = session.client.info?.wid?.user ?? session.client.info?.me?.user ?? null;
    session.state.connected_at = new Date().toISOString();
    session.state.last_error = null;
    session.state.updated_at = new Date().toISOString();
    pushSessionEvent(session, 'CONNECTED', 'WhatsApp conectado correctamente');
  });

  session.client.on('authenticated', () => {
    session.state.status = 'AUTHENTICATED';
    session.state.qr = null;
    session.state.qr_image = null;
    session.state.last_error = null;
    session.state.updated_at = new Date().toISOString();
    pushSessionEvent(session, 'AUTHENTICATED', 'Sesion autenticada');

    clearAuthReadyTimer(session);
    session.authReadyTimer = setTimeout(() => {
      cleanupFailedSession(
        session,
        new Error('WhatsApp valido la sesion, pero no termino de conectar. Reinicia la sesion e intenta escanear nuevamente.')
      ).catch((error) => {
        session.state.last_error = error.message;
        session.state.updated_at = new Date().toISOString();
      });
    }, 90000);
  });

  session.client.on('auth_failure', (message) => {
    clearAuthReadyTimer(session);
    session.state.status = 'AUTH_FAILED';
    session.state.last_error = message;
    session.state.updated_at = new Date().toISOString();
    pushSessionEvent(session, 'AUTH_FAILED', message || 'Fallo de autenticacion');
  });

  session.client.on('disconnected', (reason) => {
    clearAuthReadyTimer(session);
    session.state.status = 'DISCONNECTED';
    session.state.last_error = reason;
    session.state.phone = null;
    session.state.connected_at = null;
    session.state.updated_at = new Date().toISOString();
    pushSessionEvent(session, 'DISCONNECTED', reason || 'Sesion desconectada');
    scheduleReconnect(session);
  });

  session.client.on('loading_screen', (percent, message) => {
    session.state.updated_at = new Date().toISOString();
    pushSessionEvent(session, 'LOADING_SCREEN', `Cargando WhatsApp ${percent ?? 0}%${message ? ` - ${message}` : ''}`);
  });

  session.client.on('change_state', (state) => {
    session.state.updated_at = new Date().toISOString();
    pushSessionEvent(session, 'STATE_CHANGED', `Estado interno WhatsApp: ${state}`);
  });

  session.client.on('remote_session_saved', () => {
    session.state.updated_at = new Date().toISOString();
    pushSessionEvent(session, 'REMOTE_SESSION_SAVED', 'Sesion remota guardada');
  });

  session.client.on('message', async (message) => {
    try {
      if (message.fromMe || message.from.includes('@g.us') || !message.body?.trim()) {
        return;
      }

      const incomingPhoneCandidates = await getIncomingPhoneCandidates(message);
      const incomingPhone = incomingPhoneCandidates[0];
      let ownerResponse = { handled: false };

      for (const phoneCandidate of incomingPhoneCandidates) {
        ownerResponse = await handleOwnerResponse({
          empresa_id: session.companyId,
          telefono_dueno: phoneCandidate,
          mensaje: message.body
        });

        if (ownerResponse.handled) {
          break;
        }
      }

      if (ownerResponse.handled) {
        if (ownerResponse.mensaje_cliente && ownerResponse.telefono_cliente) {
          await session.client.sendMessage(
            ownerResponse.whatsapp_chat_id || normalizePhoneForWhatsapp(ownerResponse.telefono_cliente),
            ownerResponse.mensaje_cliente
          );
        }

        return;
      }

      for (const phoneCandidate of incomingPhoneCandidates) {
        if (await isOwnerPhone({ empresaId: session.companyId, phone: phoneCandidate })) {
          return;
        }
      }

      await markCustomerActivity({
        empresa_id: session.companyId,
        telefono_cliente: incomingPhone
      });

      if (await isBotPausedForCustomer({ empresa_id: session.companyId, telefono_cliente: incomingPhone })) {
        await notifyOwnerOfCustomerMessage({
          empresa_id: session.companyId,
          telefono_cliente: incomingPhone,
          mensaje: message.body
        });
        return;
      }

      const result = await processIncomingCustomerMessage({
        empresaId: session.companyId,
        phone: incomingPhone,
        message: message.body,
        whatsappChatId: message.from
      });
      const chat = await message.getChat();

      const sentMediaCount = result.medios?.length ? await replyWithMedia(message, result.medios) : 0;

      if (sentMediaCount === 0 && result.respuesta) {
        await chat.sendMessage(result.respuesta);
      }
    } catch (error) {
      session.state.last_error = error.message;
      session.state.updated_at = new Date().toISOString();
      pushSessionEvent(session, 'ERROR', error.message);
    }
  });
}

function scheduleReconnect(session) {
  if (session.reconnectTimer || session.destroying) {
    return;
  }

  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    startWhatsappSession(session.companyId).catch((error) => {
      session.state.last_error = error.message;
      session.state.updated_at = new Date().toISOString();
    });
  }, 5000);
}

function createSession(companyId) {
  const sessionPath = path.resolve(process.cwd(), env.whatsapp.sessionPath);
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: clientIdForCompany(companyId),
      dataPath: sessionPath
    }),
    puppeteer: {
      headless: env.whatsapp.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  const session = {
    client,
    companyId,
    destroying: false,
    reconnectTimer: null,
    authReadyTimer: null,
    clientDestroyed: false,
    state: {
      ...baseStatus(companyId),
      status: 'INITIALIZING'
    }
  };

  pushSessionEvent(session, 'INITIALIZING', 'Preparando sesion de WhatsApp');
  attachClientEvents(session);
  sessions.set(companyId, session);
  lastStatuses.delete(companyId);
  return session;
}

async function cleanupFailedSession(session, error) {
  session.destroying = true;
  clearAuthReadyTimer(session);

  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }

  session.state.status = 'ERROR';
  session.state.last_error = error.message;
  session.state.updated_at = new Date().toISOString();
  pushSessionEvent(session, 'ERROR', error.message);

  try {
    await destroyClientQuietly(session.client);
  } finally {
    session.clientDestroyed = true;
    sessions.delete(session.companyId);
    lastStatuses.set(session.companyId, session.state);
  }
}

export async function startWhatsappSession(companyId) {
  const id = normalizeCompanyId(companyId);
  let session = getSession(id);

  if (session && ['INITIALIZING', 'QR_READY', 'AUTHENTICATED', 'CONNECTED'].includes(session.state.status)) {
    return session.state;
  }

  if (session?.clientDestroyed) {
    sessions.delete(id);
    session = null;
  }

  if (!session) {
    session = createSession(id);
  }

  lastStatuses.delete(id);

  session.destroying = false;
  session.state.status = 'INITIALIZING';
  session.state.updated_at = new Date().toISOString();
  pushSessionEvent(session, 'INITIALIZING', 'Iniciando sesion de WhatsApp');

  try {
    await session.client.initialize();
  } catch (error) {
    await cleanupFailedSession(session, error);
    throw createHttpError(409, `No se pudo iniciar WhatsApp: ${error.message}`);
  }

  return session.state;
}

export function getWhatsappStatus(companyId) {
  const id = normalizeCompanyId(companyId);
  return getSession(id)?.state ?? lastStatuses.get(id) ?? baseStatus(id);
}

export function listWhatsappStatuses() {
  const activeStatuses = Array.from(sessions.values()).map((session) => session.state);
  const inactiveStatuses = Array.from(lastStatuses.entries())
    .filter(([companyId]) => !sessions.has(companyId))
    .map(([, status]) => status);

  return [...activeStatuses, ...inactiveStatuses];
}

export async function sendWhatsappMessage(companyId, phone, message) {
  const id = normalizeCompanyId(companyId);
  const session = getSession(id);

  if (!session || session.state.status !== 'CONNECTED') {
    throw createHttpError(409, 'La sesion de WhatsApp de la empresa no esta conectada');
  }

  const cleanMessage = String(message ?? '').trim();

  if (!cleanMessage) {
    throw createHttpError(400, 'El mensaje es requerido');
  }

  await session.client.sendMessage(normalizePhoneForWhatsapp(phone), cleanMessage);

  return {
    empresa_id: id,
    telefono_destino: phone,
    status: 'SENT',
    sent_at: new Date().toISOString()
  };
}

export async function disconnectWhatsappSession(companyId) {
  const id = normalizeCompanyId(companyId);
  const session = getSession(id);
  lastStatuses.delete(id);

  if (!session) {
    const disconnectedAt = new Date().toISOString();

    return {
      ...baseStatus(id),
      updated_at: disconnectedAt,
      events: [
        {
          type: 'DISCONNECTED',
          message: 'Sesion cerrada manualmente',
          at: disconnectedAt
        }
      ]
    };
  }

  session.destroying = true;
  clearAuthReadyTimer(session);

  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }

  try {
    if (!session.clientDestroyed) {
      await destroyClientQuietly(session.client);
    }
  } finally {
    sessions.delete(id);
  }

  const disconnectedAt = new Date().toISOString();

  return {
    ...baseStatus(id),
    updated_at: disconnectedAt,
    events: [
      {
        type: 'DISCONNECTED',
        message: 'Sesion cerrada manualmente',
        at: disconnectedAt
      },
      ...(session.state.events ?? [])
    ].slice(0, 12)
  };
}

export async function shutdownWhatsappSessions() {
  const companyIds = Array.from(sessions.keys());

  await Promise.allSettled(companyIds.map((companyId) => disconnectWhatsappSession(companyId)));
}
