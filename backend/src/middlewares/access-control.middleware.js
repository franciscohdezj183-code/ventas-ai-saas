import { authenticate } from './auth.middleware.js';
import { attachCompanyScope, getAuthenticatedEmpresaId, isSuperAdmin } from './company-scope.middleware.js';
import { authorizePermissions, authorizeRoles } from './roles.middleware.js';
import { createHttpError } from '../utils/http-error.js';

function normalizeTenantId(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const tenantId = Number(value);

  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw createHttpError(400, 'tenant_id debe ser un entero positivo');
  }

  return tenantId;
}

function getRequestedTenantIds(req) {
  const sources = [
    req.params?.tenant_id,
    req.params?.tenantId,
    req.params?.empresaId,
    req.params?.companyId,
    req.body?.tenant_id,
    req.body?.tenantId,
    req.body?.empresa_id,
    req.body?.empresaId,
    req.body?.company_id,
    req.body?.companyId,
    req.query?.tenant_id,
    req.query?.tenantId,
    req.query?.empresa_id,
    req.query?.empresaId,
    req.query?.company_id,
    req.query?.companyId
  ];

  return sources
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map(normalizeTenantId);
}

export const requireAuth = authenticate;

export function requireRole(role) {
  return authorizeRoles(role);
}

export function requirePermission(permission) {
  return authorizePermissions(permission);
}

export function requireTenantScope(req, res, next) {
  try {
    if (!req.auth?.user) {
      throw createHttpError(401, 'Authenticated user is required');
    }

    const requestedTenantIds = getRequestedTenantIds(req);
    const distinctTenantIds = [...new Set(requestedTenantIds)];

    if (distinctTenantIds.length > 1) {
      throw createHttpError(400, 'La solicitud contiene identificadores de empresa contradictorios');
    }

    const requestedTenantId = distinctTenantIds[0] ?? null;

    if (isSuperAdmin(req.auth)) {
      req.tenant = {
        id: requestedTenantId,
        isSuperAdmin: true
      };
      next();
      return;
    }

    const authenticatedTenantId = getAuthenticatedEmpresaId(req.auth);

    if (requestedTenantId !== null && requestedTenantId !== authenticatedTenantId) {
      throw createHttpError(403, 'No tienes permiso para acceder a datos de otra empresa');
    }

    req.tenant = {
      id: authenticatedTenantId,
      isSuperAdmin: false
    };

    if (!req.body?.tenant_id && req.body && Object.keys(req.body).length > 0) {
      req.body.tenant_id = authenticatedTenantId;
    }

    next();
  } catch (error) {
    next(error);
  }
}

export const attachTenantScope = [requireTenantScope, attachCompanyScope];
