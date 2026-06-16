import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode';
import pkg from 'whatsapp-web.js';
import { env } from '../../config/env.js';
import { query } from '../../config/database.js';
import { createHttpError } from '../../utils/http-error.js';
import { decryptField, encryptField } from '../../utils/crypto-field.js';
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
const operationLocks = new Map();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.resolve(__dirname, '../../../uploads');
const CHROMIUM_LOCK_FILES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile'];
const DEFAULT_RECONNECT_BASE_DELAY_MS = 5000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 60000;
const DEFAULT_RECONNECT_MAX_ATTEMPTS = 8;
let statusTableReadyPromise = null;

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
    reconnect_attempt: 0,
    next_reconnect_at: null,
    events: [],
    updated_at: new Date().toISOString()
  };
}

function reconnectBaseDelayMs() {
  return Number(process.env.WHATSAPP_RECONNECT_BASE_DELAY_MS ?? DEFAULT_RECONNECT_BASE_DELAY_MS);
}

function reconnectMaxDelayMs() {
  return Number(process.env.WHATSAPP_RECONNECT_MAX_DELAY_MS ?? DEFAULT_RECONNECT_MAX_DELAY_MS);
}

function reconnectMaxAttempts() {
  return Number(process.env.WHATSAPP_RECONNECT_MAX_ATTEMPTS ?? DEFAULT_RECONNECT_MAX_ATTEMPTS);
}

function sessionRootPath() {
  return path.resolve(process.cwd(), env.whatsapp.sessionPath);
}

function sessionPathForCompany(companyId) {
  return path.join(sessionRootPath(), `session-${clientIdForCompany(companyId)}`);
}

function isBrowserAlreadyRunningError(error) {
  return /browser is already running|userDataDir/i.test(String(error?.message ?? ''));
}

async function cleanupChromiumLockFiles(companyId) {
  const companySessionPath = sessionPathForCompany(companyId);

  await Promise.all(
    CHROMIUM_LOCK_FILES.map(async (fileName) => {
      const filePath = path.join(companySessionPath, fileName);

      try {
        await fsPromises.unlink(filePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    })
  );
}

async function withCompanyOperationLock(companyId, operation) {
  const id = normalizeCompanyId(companyId);
  const currentLock = operationLocks.get(id) ?? Promise.resolve();
  let release;
  const nextLock = new Promise((resolve) => {
    release = resolve;
  });
  const queuedLock = currentLock.then(() => nextLock, () => nextLock);

  operationLocks.set(id, queuedLock);

  await currentLock.catch(() => {});

  try {
    return await operation();
  } finally {
    release();

    if (operationLocks.get(id) === queuedLock) {
      operationLocks.delete(id);
    }
  }
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
  persistWhatsappStatus(session.state).catch(() => {});
}

async function ensureWhatsappStatusTable() {
  if (!statusTableReadyPromise) {
    statusTableReadyPromise = query(
      `CREATE TABLE IF NOT EXISTS whatsapp_session_status (
        empresa_id BIGINT UNSIGNED NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'DISCONNECTED',
        qr MEDIUMTEXT NULL,
        qr_image MEDIUMTEXT NULL,
        phone VARCHAR(80) NULL,
        connected_at DATETIME NULL,
        last_error TEXT NULL,
        reconnect_attempt INT UNSIGNED NOT NULL DEFAULT 0,
        next_reconnect_at DATETIME NULL,
        events_json JSON NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (empresa_id),
        KEY whatsapp_session_status_status_index (status),
        KEY whatsapp_session_status_updated_at_index (updated_at),
        CONSTRAINT whatsapp_session_status_empresa_foreign
          FOREIGN KEY (empresa_id) REFERENCES empresas (id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
  }

  return statusTableReadyPromise;
}

function mysqlDateTime(value) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function mapPersistedStatus(row) {
  if (!row) {
    return null;
  }

  let events = [];

  try {
    events = Array.isArray(row.events_json) ? row.events_json : JSON.parse(row.events_json ?? '[]');
  } catch {
    events = [];
  }

  return {
    empresa_id: row.empresa_id,
    status: row.status,
    qr: decryptField(row.qr),
    qr_image: decryptField(row.qr_image),
    phone: row.phone,
    connected_at: row.connected_at ? new Date(row.connected_at).toISOString() : null,
    last_error: row.last_error,
    reconnect_attempt: Number(row.reconnect_attempt ?? 0),
    next_reconnect_at: row.next_reconnect_at ? new Date(row.next_reconnect_at).toISOString() : null,
    events,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  };
}

async function persistWhatsappStatus(state) {
  await ensureWhatsappStatusTable();
  await query(
    `INSERT INTO whatsapp_session_status
      (empresa_id, status, qr, qr_image, phone, connected_at, last_error,
       reconnect_attempt, next_reconnect_at, events_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       qr = VALUES(qr),
       qr_image = VALUES(qr_image),
       phone = VALUES(phone),
       connected_at = VALUES(connected_at),
       last_error = VALUES(last_error),
       reconnect_attempt = VALUES(reconnect_attempt),
       next_reconnect_at = VALUES(next_reconnect_at),
       events_json = VALUES(events_json),
       updated_at = VALUES(updated_at)`,
    [
      state.empresa_id,
      state.status,
      encryptField(state.qr),
      encryptField(state.qr_image),
      state.phone,
      mysqlDateTime(state.connected_at),
      state.last_error,
      Number(state.reconnect_attempt ?? 0),
      mysqlDateTime(state.next_reconnect_at),
      JSON.stringify(state.events ?? []),
      mysqlDateTime(state.updated_at)
    ]
  );
}

async function getPersistedWhatsappStatus(companyId) {
  await ensureWhatsappStatusTable();
  const [rows] = await query('SELECT * FROM whatsapp_session_status WHERE empresa_id = ? LIMIT 1', [companyId]);
  return mapPersistedStatus(rows[0] ?? null);
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
    session.reconnectAttempts = 0;
    session.state.status = 'CONNECTED';
    session.state.qr = null;
    session.state.qr_image = null;
    session.state.phone = session.client.info?.wid?.user ?? session.client.info?.me?.user ?? null;
    session.state.connected_at = new Date().toISOString();
    session.state.last_error = null;
    session.state.reconnect_attempt = 0;
    session.state.next_reconnect_at = null;
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

  session.reconnectAttempts += 1;
  session.state.reconnect_attempt = session.reconnectAttempts;

  if (session.reconnectAttempts > reconnectMaxAttempts()) {
    session.state.status = 'ERROR';
    session.state.last_error = 'Se alcanzo el limite de reconexion automatica de WhatsApp.';
    session.state.next_reconnect_at = null;
    session.state.updated_at = new Date().toISOString();
    pushSessionEvent(session, 'RECONNECT_STOPPED', session.state.last_error);
    lastStatuses.set(session.companyId, session.state);
    return;
  }

  const delay = Math.min(
    reconnectBaseDelayMs() * 2 ** Math.max(session.reconnectAttempts - 1, 0),
    reconnectMaxDelayMs()
  );
  const nextReconnectAt = new Date(Date.now() + delay).toISOString();

  session.state.status = 'RECONNECTING';
  session.state.next_reconnect_at = nextReconnectAt;
  session.state.updated_at = new Date().toISOString();
  pushSessionEvent(session, 'RECONNECT_SCHEDULED', `Reconexion programada en ${Math.round(delay / 1000)}s`);

  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    withCompanyOperationLock(session.companyId, () => startWhatsappSessionUnlocked(session.companyId, { fromReconnect: true })).catch((error) => {
      session.state.last_error = error.message;
      session.state.updated_at = new Date().toISOString();
    });
  }, delay);
}

function createSession(companyId) {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: clientIdForCompany(companyId),
      dataPath: sessionRootPath()
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
    reconnectAttempts: 0,
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
    if (isBrowserAlreadyRunningError(error)) {
      await cleanupChromiumLockFiles(session.companyId).catch((cleanupError) => {
        session.state.last_error = `${error.message}. No se pudieron limpiar locks locales: ${cleanupError.message}`;
      });
    }
    lastStatuses.set(session.companyId, session.state);
  }
}

export async function startWhatsappSession(companyId) {
  const id = normalizeCompanyId(companyId);
  return withCompanyOperationLock(id, async () => startWhatsappSessionUnlocked(id));
}

async function startWhatsappSessionUnlocked(id, { fromReconnect = false } = {}) {
  let session = getSession(id);

  if (
    session &&
    ['INITIALIZING', 'QR_READY', 'AUTHENTICATED', 'CONNECTED'].includes(session.state.status)
  ) {
    return session.state;
  }

  if (session?.state.status === 'RECONNECTING' && !fromReconnect) {
    return session.state;
  }

  if (session?.clientDestroyed) {
    sessions.delete(id);
    session = null;
  }

  if (!session) {
    await cleanupChromiumLockFiles(id).catch(() => {});
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

    if (isBrowserAlreadyRunningError(error)) {
      await cleanupChromiumLockFiles(id).catch(() => {});
    }

    throw createHttpError(409, `No se pudo iniciar WhatsApp: ${error.message}`);
  }

  return session.state;
}

export function getWhatsappStatus(companyId) {
  const id = normalizeCompanyId(companyId);
  return getSession(id)?.state ?? lastStatuses.get(id) ?? baseStatus(id);
}

export async function getWhatsappStatusSnapshot(companyId) {
  const id = normalizeCompanyId(companyId);
  const localStatus = getSession(id)?.state ?? lastStatuses.get(id);

  if (localStatus) {
    return localStatus;
  }

  return (await getPersistedWhatsappStatus(id)) ?? baseStatus(id);
}

export function listWhatsappStatuses() {
  const activeStatuses = Array.from(sessions.values()).map((session) => session.state);
  const inactiveStatuses = Array.from(lastStatuses.entries())
    .filter(([companyId]) => !sessions.has(companyId))
    .map(([, status]) => status);

  return [...activeStatuses, ...inactiveStatuses];
}

export async function listWhatsappStatusSnapshots() {
  await ensureWhatsappStatusTable();
  const localStatuses = listWhatsappStatuses();
  const localCompanyIds = new Set(localStatuses.map((status) => Number(status.empresa_id)));
  const [rows] = await query('SELECT * FROM whatsapp_session_status ORDER BY updated_at DESC');
  const persistedStatuses = rows
    .filter((row) => !localCompanyIds.has(Number(row.empresa_id)))
    .map(mapPersistedStatus);

  return [...localStatuses, ...persistedStatuses];
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
  return withCompanyOperationLock(id, async () => disconnectWhatsappSessionUnlocked(id));
}

async function disconnectWhatsappSessionUnlocked(id) {
  const session = getSession(id);
  lastStatuses.delete(id);

  if (!session) {
    const disconnectedAt = new Date().toISOString();
    const disconnectedState = {
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

    await persistWhatsappStatus(disconnectedState).catch(() => {});

    return disconnectedState;
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
    await cleanupChromiumLockFiles(id).catch(() => {});
  }

  const disconnectedAt = new Date().toISOString();

  const disconnectedState = {
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

  await persistWhatsappStatus(disconnectedState).catch(() => {});

  return disconnectedState;
}

export async function shutdownWhatsappSessions() {
  const companyIds = Array.from(sessions.keys());

  await Promise.allSettled(companyIds.map((companyId) => disconnectWhatsappSession(companyId)));
}
