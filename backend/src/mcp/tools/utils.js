import { resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { createHttpError } from '../../utils/http-error.js';
import { normalizeMexicanPhoneNumber } from '../../whatsapp/whatsapp-number.helper.js';

const FORBIDDEN_ARG_KEYS = new Set(['sql', 'query', 'raw_sql', 'statement']);

export const MAX_RESULTS = 5;

export function assertAllowedArgs(args, allowedKeys) {
  const allowedKeySet = new Set(allowedKeys);

  Object.keys(args ?? {}).forEach((key) => {
    if (FORBIDDEN_ARG_KEYS.has(key.toLowerCase())) {
      throw createHttpError(400, `Parametro no permitido para herramienta MCP: ${key}`);
    }

    if (!allowedKeySet.has(key)) {
      throw createHttpError(400, `Parametro desconocido para herramienta MCP: ${key}`);
    }
  });
}

export function normalizeEmpresaId(value, auth = null) {
  if (auth) {
    return resolveScopedEmpresaId(auth, value);
  }

  const empresaId = Number(value);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw createHttpError(400, 'empresa_id es requerido para ejecutar herramientas MCP');
  }

  return empresaId;
}

export function normalizePositiveId(value, fieldName = 'id') {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, `${fieldName} no es valido`);
  }

  return id;
}

export function normalizeText(value, fieldName, { required = false, fallback = null } = {}) {
  const text = String(value ?? '').trim();

  if (!text && required) {
    throw createHttpError(400, `${fieldName} es requerido`);
  }

  return text || fallback;
}

export function likeTerm(value) {
  const cleanValue = String(value ?? '').trim();
  return cleanValue ? `%${cleanValue}%` : null;
}

export function normalizePrice(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function normalizePhone(value) {
  return normalizeMexicanPhoneNumber(value);
}

export function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return value === true || value === 'true' || value === 1 || value === '1';
}
