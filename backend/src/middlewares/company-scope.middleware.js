import { createHttpError } from '../utils/http-error.js';
import { normalizeRole, ROLES } from '../config/permissions.js';

export function isSuperAdmin(auth) {
  return normalizeRole(auth?.user?.rol) === ROLES.SUPER_ADMIN;
}

export function getAuthenticatedEmpresaId(auth) {
  const empresaId = Number(auth?.user?.empresaId);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw createHttpError(403, 'El usuario autenticado no tiene una empresa valida');
  }

  return empresaId;
}

export function resolveScopedEmpresaId(auth, requestedEmpresaId, { requiredForSuperAdmin = true } = {}) {
  if (!isSuperAdmin(auth)) {
    return getAuthenticatedEmpresaId(auth);
  }

  if (!requiredForSuperAdmin && (requestedEmpresaId === undefined || requestedEmpresaId === null || requestedEmpresaId === '')) {
    return null;
  }

  const empresaId = Number(requestedEmpresaId);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return empresaId;
}

export function companyScopeCondition(auth, alias = '') {
  if (isSuperAdmin(auth)) {
    return { clause: '', params: [] };
  }

  const prefix = alias ? `${alias}.` : '';

  return {
    clause: `${prefix}empresa_id = ?`,
    params: [getAuthenticatedEmpresaId(auth)]
  };
}

export function appendCompanyScope(auth, params = [], alias = '') {
  const scope = companyScopeCondition(auth, alias);

  if (!scope.clause) {
    return { clause: '', params };
  }

  return {
    clause: `AND ${scope.clause}`,
    params: [...params, ...scope.params]
  };
}

export function attachCompanyScope(req, res, next) {
  try {
    const scope = companyScopeCondition(req.auth);

    req.companyScope = {
      isSuperAdmin: isSuperAdmin(req.auth),
      empresaId: isSuperAdmin(req.auth) ? null : getAuthenticatedEmpresaId(req.auth),
      condition: scope.clause,
      params: scope.params
    };

    next();
  } catch (error) {
    next(error);
  }
}
