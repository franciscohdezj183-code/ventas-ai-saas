import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { query } from '../../config/database.js';
import { getPermissionsForRole, normalizeRole } from '../../config/permissions.js';
import { createHttpError } from '../../utils/http-error.js';

const AUTH_USER_COLUMNS = `
  u.id,
  u.empresa_id,
  u.nombre,
  u.email,
  u.password_hash,
  u.rol,
  u.estado,
  e.nombre AS empresa_nombre,
  e.slug AS empresa_slug,
  e.activo AS empresa_activo,
  e.estado AS empresa_estado
`;

export function sanitizeUser(user) {
  return {
    id: user.id,
    empresaId: user.empresa_id,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
    normalizedRole: normalizeRole(user.rol),
    permissions: getPermissionsForRole(user.rol),
    estado: user.estado,
    empresa: {
      id: user.empresa_id,
      nombre: user.empresa_nombre,
      slug: user.empresa_slug,
      activo: Boolean(user.empresa_activo),
      estado: user.empresa_estado
    }
  };
}

export function createToken(user) {
  const jti = crypto.randomUUID();

  const token = jwt.sign(
    {
      empresaId: user.empresa_id,
      rol: normalizeRole(user.rol) ?? user.rol
    },
    env.jwt.secret,
    {
      subject: String(user.id),
      expiresIn: env.jwt.expiresIn,
      jwtid: jti
    }
  );

  const decoded = jwt.decode(token);

  return {
    token,
    expiresAt: decoded.exp,
    tokenType: 'Bearer'
  };
}

export async function findAuthUserByEmail(email) {
  const [rows] = await query(
    `SELECT ${AUTH_USER_COLUMNS}
     FROM usuarios u
     INNER JOIN empresas e ON e.id = u.empresa_id
     WHERE u.email = ?
     LIMIT 1`,
    [email]
  );

  return rows[0] ?? null;
}

export async function findAuthUserById(userId) {
  const [rows] = await query(
    `SELECT ${AUTH_USER_COLUMNS}
     FROM usuarios u
     INNER JOIN empresas e ON e.id = u.empresa_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] ?? null;
}

export async function loginWithEmailAndPassword(email, password) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw createHttpError(400, 'Email and password are required');
  }

  const user = await findAuthUserByEmail(normalizedEmail);

  if (!user) {
    throw createHttpError(401, 'Invalid credentials');
  }

  if (user.estado !== 'ACTIVO' || !user.empresa_activo) {
    throw createHttpError(403, 'User or company is inactive');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    throw createHttpError(401, 'Invalid credentials');
  }

  return {
    user: sanitizeUser(user),
    accessToken: createToken(user)
  };
}

export function getAuthenticatedUser(user) {
  return sanitizeUser({
    ...user,
    empresa_nombre: user.empresa_nombre ?? null,
    empresa_slug: user.empresa_slug ?? null,
    empresa_estado: user.empresa_estado ?? null
  });
}
