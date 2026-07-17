import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { createHttpError } from '../../utils/http-error.js';

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
  importBaileys = () => import('@whiskeysockets/baileys')
} = {}) {
  const folder = resolveBaileysAuthPath(empresaId, { authPath });
  await fs.mkdir(folder, { recursive: true });
  const { useMultiFileAuthState } = await importBaileys();

  // Experimental only: replace before high-scale production with a durable, optimized auth store.
  const authState = await useMultiFileAuthState(folder);
  return { ...authState, folder };
}

export async function removeBaileysAuthState(empresaId, options = {}) {
  const folder = resolveBaileysAuthPath(empresaId, options);
  await fs.rm(folder, { recursive: true, force: true });
}
