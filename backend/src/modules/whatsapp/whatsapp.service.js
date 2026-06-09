import path from 'node:path';
import qrcode from 'qrcode';
import pkg from 'whatsapp-web.js';
import { env } from '../../config/env.js';
import { createHttpError } from '../../utils/http-error.js';
import { processIncomingCustomerMessage } from '../ai/ai.service.js';

const { Client, LocalAuth } = pkg;

const sessions = new Map();

function clientIdForCompany(companyId) {
  return `empresa-${companyId}`;
}

function baseStatus(companyId) {
  return {
    empresa_id: companyId,
    status: 'DISCONNECTED',
    qr: null,
    qr_image: null,
    connected_at: null,
    last_error: null,
    updated_at: new Date().toISOString()
  };
}

function normalizeCompanyId(companyId) {
  const id = Number(companyId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return id;
}

function getSession(companyId) {
  return sessions.get(companyId) ?? null;
}

async function updateQr(session, qr) {
  session.state.qr = qr;
  session.state.qr_image = await qrcode.toDataURL(qr);
  session.state.status = 'QR_READY';
  session.state.updated_at = new Date().toISOString();
}

function attachClientEvents(session) {
  session.client.on('qr', (qr) => {
    updateQr(session, qr).catch((error) => {
      session.state.last_error = error.message;
      session.state.updated_at = new Date().toISOString();
    });
  });

  session.client.on('ready', () => {
    session.state.status = 'CONNECTED';
    session.state.qr = null;
    session.state.qr_image = null;
    session.state.connected_at = new Date().toISOString();
    session.state.last_error = null;
    session.state.updated_at = new Date().toISOString();
  });

  session.client.on('authenticated', () => {
    session.state.status = 'AUTHENTICATED';
    session.state.last_error = null;
    session.state.updated_at = new Date().toISOString();
  });

  session.client.on('auth_failure', (message) => {
    session.state.status = 'AUTH_FAILED';
    session.state.last_error = message;
    session.state.updated_at = new Date().toISOString();
  });

  session.client.on('disconnected', (reason) => {
    session.state.status = 'DISCONNECTED';
    session.state.last_error = reason;
    session.state.connected_at = null;
    session.state.updated_at = new Date().toISOString();
    scheduleReconnect(session);
  });

  session.client.on('message', async (message) => {
    try {
      if (message.fromMe || message.from.includes('@g.us') || !message.body?.trim()) {
        return;
      }

      const result = await processIncomingCustomerMessage({
        empresaId: session.companyId,
        phone: message.from,
        message: message.body
      });

      if (result.respuesta) {
        await message.reply(result.respuesta);
      }
    } catch (error) {
      session.state.last_error = error.message;
      session.state.updated_at = new Date().toISOString();
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
    state: {
      ...baseStatus(companyId),
      status: 'INITIALIZING'
    }
  };

  attachClientEvents(session);
  sessions.set(companyId, session);
  return session;
}

export async function startWhatsappSession(companyId) {
  const id = normalizeCompanyId(companyId);
  let session = getSession(id);

  if (session && ['INITIALIZING', 'QR_READY', 'AUTHENTICATED', 'CONNECTED'].includes(session.state.status)) {
    return session.state;
  }

  if (!session) {
    session = createSession(id);
  }

  session.destroying = false;
  session.state.status = 'INITIALIZING';
  session.state.updated_at = new Date().toISOString();

  await session.client.initialize();
  return session.state;
}

export function getWhatsappStatus(companyId) {
  const id = normalizeCompanyId(companyId);
  return getSession(id)?.state ?? baseStatus(id);
}

export function listWhatsappStatuses() {
  return Array.from(sessions.values()).map((session) => session.state);
}

export async function disconnectWhatsappSession(companyId) {
  const id = normalizeCompanyId(companyId);
  const session = getSession(id);

  if (!session) {
    return baseStatus(id);
  }

  session.destroying = true;

  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }

  try {
    await session.client.destroy();
  } finally {
    sessions.delete(id);
  }

  return baseStatus(id);
}
