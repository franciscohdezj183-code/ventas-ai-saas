import { createHttpError } from '../utils/http-error.js';
import { normalizeRole, roleHasAllPermissions } from '../config/permissions.js';

export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    const userRole = normalizeRole(req.auth?.user?.rol);
    const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role)).filter(Boolean);

    if (!userRole) {
      next(createHttpError(401, 'Authenticated user is required'));
      return;
    }

    if (!normalizedAllowedRoles.includes(userRole)) {
      next(createHttpError(403, 'You do not have permission to access this resource'));
      return;
    }

    next();
  };
}

export function authorizePermissions(...requiredPermissions) {
  return (req, res, next) => {
    const userRole = normalizeRole(req.auth?.user?.rol);

    if (!userRole) {
      next(createHttpError(401, 'Authenticated user is required'));
      return;
    }

    if (!roleHasAllPermissions(userRole, requiredPermissions)) {
      next(createHttpError(403, 'You do not have permission to access this resource'));
      return;
    }

    next();
  };
}
