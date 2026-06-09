import { createHttpError } from '../utils/http-error.js';

export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.auth?.user?.rol;

    if (!userRole) {
      next(createHttpError(401, 'Authenticated user is required'));
      return;
    }

    if (!allowedRoles.includes(userRole)) {
      next(createHttpError(403, 'You do not have permission to access this resource'));
      return;
    }

    next();
  };
}
