import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { findAuthUserById } from '../modules/auth/auth.service.js';
import { isTokenRevoked } from '../modules/auth/token-blacklist.js';
import { getPermissionsForRole, normalizeRole } from '../config/permissions.js';
import { createHttpError } from '../utils/http-error.js';

function getBearerToken(req) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim();
}

export async function authenticate(req, res, next) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      throw createHttpError(401, 'Authentication token is required');
    }

    const payload = jwt.verify(token, env.jwt.secret);

    if (isTokenRevoked(payload.jti)) {
      throw createHttpError(401, 'Authentication token has been revoked');
    }

    const user = await findAuthUserById(payload.sub);

    if (!user || user.estado !== 'ACTIVO') {
      throw createHttpError(401, 'Authenticated user is not active');
    }

    req.auth = {
      token,
      payload,
      user: {
        id: user.id,
        empresaId: user.empresa_id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        normalizedRole: normalizeRole(user.rol),
        permissions: getPermissionsForRole(user.rol)
      }
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(createHttpError(401, 'Invalid or expired authentication token'));
      return;
    }

    next(error);
  }
}
