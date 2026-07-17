import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { createHttpError } from '../../utils/http-error.js';
import { logger } from '../../utils/logger.js';
import { createMysqlBaileysAuthStore } from './baileys-mysql-auth.store.js';

function normalizeEmpresaId(empresaId) {
  const id = Number(empresaId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return id;
}

export function resolveBaileysAuthPath(empresaId, { authPath = env.whatsapp.baileys.authPath, cwd = process.cwd() } = {}) {
  const id = normalizeEmpresaId(empresaId);
  const basePath = path.resolve(cwd, authPath);
  const companyPath = path.resolve(basePath, `empresa-${id}`);

  if (!companyPath.startsWith(`${basePath}${path.sep}`)) {
    throw createHttpError(400, 'Ruta de credenciales de Baileys invalida');
  }

  return companyPath;
}

export async function createBaileysAuthState(empresaId, {
  authPath = env.whatsapp.baileys.authPath,
  authStore = env.whatsapp.baileys.authStore,
  importBaileys = () => import('@whiskeysockets/baileys'),
  loggerInstance = logger,
  mysqlAuthStore = null
} = {}) {
  if (authStore === 'mysql') {
    loggerInstance.info('baileys_auth_store_selected', {
      empresaId: normalizeEmpresaId(empresaId),
      store: 'mysql'
    });
    const mysqlStore = mysqlAuthStore ?? createMysqlBaileysAuthStore({ importBaileys, loggerInstance });
    return mysqlStore.createAuthState(empresaId);
  }

  if (authStore !== 'file') {
    throw new Error('BAILEYS_AUTH_STORE must be file or mysql');
  }

  const folder = resolveBaileysAuthPath(empresaId, { authPath });
  await fs.mkdir(folder, { recursive: true });
  const { useMultiFileAuthState } = await importBaileys();
  loggerInstance.info('baileys_auth_store_selected', {
    empresaId: normalizeEmpresaId(empresaId),
    store: 'file'
  });

  // Experimental only: replace before high-scale production with a durable, optimized auth store.
  const authState = await useMultiFileAuthState(folder);
  return { ...authState, folder };
}

export async function removeBaileysAuthState(empresaId, options = {}) {
  if ((options.authStore ?? env.whatsapp.baileys.authStore) === 'mysql') {
    const mysqlStore = createMysqlBaileysAuthStore({
      loggerInstance: options.loggerInstance ?? logger,
      importBaileys: options.importBaileys ?? (() => import('@whiskeysockets/baileys'))
    });
    await mysqlStore.removeAuthState(empresaId);
    return;
  }

  const folder = resolveBaileysAuthPath(empresaId, options);
  await fs.rm(folder, { recursive: true, force: true });
}
