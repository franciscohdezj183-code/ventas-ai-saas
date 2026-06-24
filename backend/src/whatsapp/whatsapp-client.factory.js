import fs from 'node:fs';
import path from 'node:path';
import pkg from 'whatsapp-web.js';
import { logger } from '../utils/logger.js';
import { buildClientId, normalizeCompanyId } from './whatsapp.types.js';

const { Client, LocalAuth } = pkg;

function booleanEnv(name, fallback) {
  const value = process.env[name];

  if (value === undefined || value === '') {
    return fallback;
  }

  return value !== 'false';
}

function listEnv(name) {
  return String(process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getWhatsappSessionPath() {
  return path.resolve(process.cwd(), process.env.WHATSAPP_SESSION_PATH || '.wwebjs_auth');
}

export function ensureWhatsappSessionPath() {
  const sessionPath = getWhatsappSessionPath();
  fs.mkdirSync(sessionPath, { recursive: true });
  return sessionPath;
}

export function getCompanyLocalAuthPath(companyId) {
  return path.join(getWhatsappSessionPath(), `session-${buildClientId(companyId)}`);
}

function isLockedSessionRemovalError(error) {
  const message = String(error?.message ?? error ?? '');
  return message.includes('EBUSY') || message.includes('EPERM') || message.includes('ENOTEMPTY');
}

function createLocalAuth(companyId) {
  const authStrategy = new LocalAuth({
    clientId: buildClientId(companyId),
    dataPath: getWhatsappSessionPath(),
    rmMaxRetries: Number(process.env.WHATSAPP_LOCALAUTH_RM_MAX_RETRIES ?? 20)
  });
  const originalLogout = authStrategy.logout.bind(authStrategy);

  authStrategy.logout = async () => {
    if (process.env.WHATSAPP_ALLOW_AUTH_DELETE !== 'true') {
      logger.info('whatsapp_auth_delete_skipped', {
        empresaId: companyId,
        reason: 'WHATSAPP_ALLOW_AUTH_DELETE is not true'
      });
      return;
    }

    try {
      await originalLogout();
    } catch (error) {
      if (!isLockedSessionRemovalError(error)) {
        throw error;
      }

      logger.error('whatsapp_localauth_logout_locked_session', {
        empresaId: companyId,
        sessionPath: getCompanyLocalAuthPath(companyId),
        error
      });
    }
  };

  return authStrategy;
}

export function createWhatsappClient(companyId) {
  const id = normalizeCompanyId(companyId);
  const isProduction = process.env.NODE_ENV === 'production';
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.WHATSAPP_PUPPETEER_EXECUTABLE_PATH || undefined;
  const productionArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote'
  ];
  const configuredArgs = listEnv('WHATSAPP_PUPPETEER_ARGS');
  const args = [...new Set([...(isProduction ? productionArgs : []), ...configuredArgs])];

  ensureWhatsappSessionPath();

  return new Client({
    authStrategy: createLocalAuth(id),
    puppeteer: {
      headless: booleanEnv('WHATSAPP_HEADLESS', true),
      executablePath,
      args
    }
  });
}
