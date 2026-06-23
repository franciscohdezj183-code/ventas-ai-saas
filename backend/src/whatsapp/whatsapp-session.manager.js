import { promises as fs } from 'node:fs';
import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { createWhatsappClient, getCompanyLocalAuthPath } from './whatsapp-client.factory.js';
import { registerWhatsappClientEvents } from './whatsapp-events.handler.js';
import {
  emitWhatsappError,
  emitWhatsappStatus
} from './whatsapp-socket.gateway.js';
import {
  clearQr,
  getPublicSession,
  getSession,
  listPublicSessions,
  markStarted,
  removeSession,
  resetStoreForTests,
  setClient,
  setError,
  setStatus,
  upsertSession
} from './whatsapp-session.store.js';
import {
  ACTIVE_SESSION_STATUSES,
  WHATSAPP_SESSION_STATUSES,
  normalizeCompanyId,
  normalizePhoneForWhatsapp
} from './whatsapp.types.js';

let clientFactory = createWhatsappClient;

function buildWhatsappNumberCandidates(phone) {
  const value = String(phone ?? '').trim();

  if (value.includes('@')) {
    return [value];
  }

  const digits = value.replace(/\D/g, '');
  const candidates = [digits];

  if (digits.startsWith('521') && digits.length === 13) {
    candidates.push(`52${digits.slice(3)}`);
  }

  if (digits.startsWith('52') && !digits.startsWith('521') && digits.length === 12) {
    candidates.push(`521${digits.slice(2)}`);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function getSerializedWhatsappId(numberId) {
  if (!numberId) {
    return null;
  }

  if (typeof numberId === 'string') {
    return numberId;
  }

  return numberId._serialized ?? numberId.id?._serialized ?? (
    numberId.user ? `${numberId.user}@${numberId.server ?? 'c.us'}` : null
  );
}

async function resolveWhatsappRecipientId(client, phone) {
  const fallback = normalizePhoneForWhatsapp(phone);

  if (fallback.includes('@g.us') || !client?.getNumberId) {
    return fallback;
  }

  for (const candidate of buildWhatsappNumberCandidates(phone)) {
    let serialized = null;

    try {
      serialized = getSerializedWhatsappId(await client.getNumberId(candidate));
    } catch (error) {
      logger.warn('whatsapp_number_id_resolution_failed', {
        candidate,
        error: error instanceof Error ? error.message : String(error ?? 'unknown')
      });
    }

    if (serialized) {
      return serialized;
    }
  }

  return fallback;
}

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayRange() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    start: `${today} 00:00:00`,
    endExclusive: `${addDays(today, 1)} 00:00:00`
  };
}

async function destroyClientQuietly(client) {
  if (!client) {
    return;
  }

  try {
    client.removeAllListeners?.();
  } catch {
    // Listener cleanup is best-effort.
  }

  try {
    await client.destroy();
  } catch (error) {
    logger.error('whatsapp_client_destroy_error', { error });
  }
}

async function removeCompanyLocalAuthQuietly(companyId) {
  try {
    await fs.rm(getCompanyLocalAuthPath(companyId), {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 300
    });
  } catch (error) {
    logger.error('whatsapp_company_localauth_remove_error', { empresaId: companyId, error });
  }
}

async function getWhatsappSessionMetrics(companyId, status) {
  const fallbackMetrics = {
    chats_count: 0,
    total_chats: 0,
    conversations_count: 0,
    messages_today: 0,
    today_messages: 0,
    bot_status: status === WHATSAPP_SESSION_STATUSES.READY ? 'Activo' : 'En espera',
    ai_status: env.openai.apiKey ? (env.openai.autoReply ? 'Activa' : 'Manual') : 'No configurada'
  };

  if (env.nodeEnv === 'test') {
    return fallbackMetrics;
  }

  const range = todayRange();

  try {
    const [[chatRows], [messageRows]] = await Promise.all([
      query(
        `SELECT COUNT(DISTINCT telefono_cliente) AS total
         FROM conversaciones
         WHERE empresa_id = ?`,
        [companyId]
      ),
      query(
        `SELECT COUNT(*) AS total
         FROM conversaciones
         WHERE empresa_id = ?
           AND fecha >= ?
           AND fecha < ?`,
        [companyId, range.start, range.endExclusive]
      )
    ]);

    const chatsCount = Number(chatRows[0]?.total ?? 0);
    const messagesToday = Number(messageRows[0]?.total ?? 0);

    return {
      chats_count: chatsCount,
      total_chats: chatsCount,
      conversations_count: chatsCount,
      messages_today: messagesToday,
      today_messages: messagesToday,
      bot_status: status === WHATSAPP_SESSION_STATUSES.READY ? 'Activo' : 'En espera',
      ai_status: env.openai.apiKey ? (env.openai.autoReply ? 'Activa' : 'Manual') : 'No configurada'
    };
  } catch (error) {
    logger.error('whatsapp_session_metrics_error', { empresaId: companyId, error });
    return fallbackMetrics;
  }
}

async function enrichPublicSession(session) {
  return {
    ...session,
    ...(await getWhatsappSessionMetrics(session.companyId, session.status))
  };
}

export function setWhatsappClientFactoryForTests(factory) {
  clientFactory = factory ?? createWhatsappClient;
}

export function resetWhatsappSessionsForTests() {
  resetStoreForTests();
  clientFactory = createWhatsappClient;
}

export async function getSessionStatus(companyId) {
  return enrichPublicSession(getPublicSession(normalizeCompanyId(companyId)));
}

export async function startSession(companyId) {
  const id = normalizeCompanyId(companyId);
  const existing = getSession(id);

  if (existing && ACTIVE_SESSION_STATUSES.has(existing.status)) {
    return getPublicSession(id);
  }

  if (existing?.client) {
    await destroyClientQuietly(existing.client);
  }

  const client = clientFactory(id);
  markStarted(id, client);
  setClient(id, client);
  registerWhatsappClientEvents({ companyId: id, client });
  logger.info('whatsapp_session_initialize_requested', { empresaId: id });

  try {
    const initializePromise = client.initialize();
    if (initializePromise?.catch) {
      initializePromise.catch((error) => {
        setError(id, error);
        emitWhatsappError(id, error);
        emitWhatsappStatus(id);
        logger.error('whatsapp_initialize_async_error', { empresaId: id, error });
      });
    }
  } catch (error) {
    setError(id, error);
    emitWhatsappError(id, error);
    emitWhatsappStatus(id);
    throw error;
  }

  const session = getPublicSession(id);
  emitWhatsappStatus(id, session);
  return session;
}

export async function restartSession(companyId) {
  const id = normalizeCompanyId(companyId);
  const existing = getSession(id);

  if (existing?.client) {
    await destroyClientQuietly(existing.client);
  }

  const session = upsertSession(id, {
    status: WHATSAPP_SESSION_STATUSES.DISCONNECTED,
    client: null,
    qr: null,
    qrText: null,
    qrImage: null,
    disconnectedAt: new Date().toISOString(),
    isInitializing: false
  });
  emitWhatsappStatus(id, session);

  return startSession(id);
}

export async function disconnectSession(companyId) {
  return destroySession(companyId);
}

export async function destroySession(companyId) {
  const id = normalizeCompanyId(companyId);
  const existing = getSession(id);

  if (existing?.client) {
    await destroyClientQuietly(existing.client);
  }

  removeSession(id);
  await removeCompanyLocalAuthQuietly(id);

  const session = upsertSession(id, {
    status: WHATSAPP_SESSION_STATUSES.DESTROYED,
    client: null,
    qr: null,
    qrText: null,
    qrImage: null,
    lastError: null,
    isInitializing: false,
    disconnectedAt: new Date().toISOString()
  });
  emitWhatsappStatus(id, session);

  return getPublicSession(id);
}

export async function getQr(companyId) {
  const session = getPublicSession(normalizeCompanyId(companyId));
  return {
    companyId: session.companyId,
    status: session.status,
    qr: session.qr,
    qrText: session.qrText,
    qrImage: session.qrImage
  };
}

export async function listSessions() {
  return listPublicSessions();
}

export async function sendWhatsappMessage(companyId, phone, message) {
  const id = normalizeCompanyId(companyId);
  const session = getSession(id);
  const cleanMessage = String(message ?? '').trim();

  if (!cleanMessage) {
    throw new Error('El mensaje es requerido');
  }

  if (!session?.client || session.status !== WHATSAPP_SESSION_STATUSES.READY) {
    throw new Error('La sesion de WhatsApp de la empresa no esta conectada');
  }

  const to = await resolveWhatsappRecipientId(session.client, phone);
  await session.client.sendMessage(to, cleanMessage);
  upsertSession(id, { lastOutboundAt: new Date().toISOString() });
  logger.info('whatsapp_message_sent', {
    empresaId: id,
    phone,
    to
  });

  return {
    companyId: id,
    phone,
    to,
    status: 'sent'
  };
}

export async function restoreSessionsOnBoot() {
  if (process.env.WHATSAPP_RESTORE_SESSIONS !== 'true') {
    logger.info('whatsapp_restore_sessions_skipped', { enabled: false });
    return [];
  }

  const [companies] = await query(
    `SELECT e.id
     FROM empresas e
     LEFT JOIN configuracion_empresas ce ON ce.empresa_id = e.id
     WHERE e.activo = 1
       AND e.estado = 'ACTIVA'
       AND COALESCE(ce.activo_whatsapp, 1) = 1
     ORDER BY e.id ASC`
  );

  const restored = [];

  for (const company of companies) {
    try {
      logger.info('whatsapp_restore_session_start', { empresaId: company.id });
      restored.push(await startSession(company.id));
    } catch (error) {
      logger.error('whatsapp_restore_session_error', {
        empresaId: company.id,
        error
      });
    }
  }

  return restored;
}

export async function shutdownWhatsappSessions() {
  const sessions = listPublicSessions();
  await Promise.allSettled(sessions.map(async (session) => {
    const current = getSession(session.companyId);

    if (current?.client) {
      await destroyClientQuietly(current.client);
    }

    clearQr(session.companyId);
    setStatus(session.companyId, WHATSAPP_SESSION_STATUSES.DISCONNECTED, {
      client: null,
      disconnectedAt: new Date().toISOString(),
      phoneNumber: null,
      isInitializing: false
    });
  }));
}

export async function getWhatsappHealthSummary() {
  const sessions = listPublicSessions();

  return {
    active_sessions: sessions.filter((session) => session.status !== WHATSAPP_SESSION_STATUSES.IDLE).length,
    total_sessions: sessions.length,
    connected_sessions: sessions.filter((session) => session.status === WHATSAPP_SESSION_STATUSES.READY).length,
    error_sessions: sessions.filter((session) => session.status === WHATSAPP_SESSION_STATUSES.FAILED).length,
    sessions
  };
}
