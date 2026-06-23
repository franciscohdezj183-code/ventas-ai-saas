import fs from 'node:fs';
import path from 'node:path';
import pkg from 'whatsapp-web.js';
import { logger } from '../utils/logger.js';
import { buildClientId, normalizeCompanyId } from './whatsapp.types.js';

const { Client, LocalAuth } = pkg;

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

  ensureWhatsappSessionPath();

  return new Client({
    authStrategy: createLocalAuth(id),
    puppeteer: {
      headless: true,
      executablePath,
      args: isProduction
        ? [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote'
        ]
        : []
    }
  });
}
