import bcrypt from 'bcrypt';
import { query } from '../../config/database.js';
import { isKnownRole, normalizeRole, ROLES } from '../../config/permissions.js';
import { appendCompanyScope, isSuperAdmin, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { assertPlanLimit } from '../plans/plan-limits.service.js';
import { createHttpError } from '../../utils/http-error.js';

const USER_COLUMNS = `
  u.id,
  u.nombre,
  u.email AS correo,
  u.rol,
  u.empresa_id,
  u.estado,
  u.fecha_creacion,
  u.fecha_actualizacion,
  e.nombre AS empresa_nombre
`;

function normalizeUserPayload(payload, auth, { requirePassword = true } = {}) {
  const nombre = String(payload.nombre ?? '').trim();
  const correo = String(payload.correo ?? payload.email ?? '').trim().toLowerCase();
  const password = String(payload.password ?? '');
  const requestedRole = normalizeRole(payload.rol ?? ROLES.OWNER) ?? String(payload.rol ?? ROLES.OWNER).trim();
  const rol = isSuperAdmin(auth) ? requestedRole : requestedRole === ROLES.SUPER_ADMIN ? ROLES.OWNER : requestedRole;
  const empresaId = resolveScopedEmpresaId(auth, payload.empresa_id);

  if (!nombre) {
    throw createHttpError(400, 'El nombre es requerido');
  }

  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw createHttpError(400, 'El correo no es valido');
  }

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  if (!isKnownRole(rol)) {
    throw createHttpError(400, 'El rol debe ser super_admin, owner, seller, support o viewer');
  }

  const estado = String(payload.estado ?? payload.activo_estado ?? '').trim().toUpperCase();

  if (estado && !['ACTIVO', 'INACTIVO'].includes(estado)) {
    throw createHttpError(400, 'El estado debe ser ACTIVO o INACTIVO');
  }

  if (requirePassword && password.length < 6) {
    throw createHttpError(400, 'El password debe tener al menos 6 caracteres');
  }

  if (!requirePassword && password && password.length < 6) {
    throw createHttpError(400, 'El password debe tener al menos 6 caracteres');
  }

  return { nombre, correo, password, rol, empresaId, estado };
}

function mapDatabaseError(error) {
  if (error?.code === 'ER_DUP_ENTRY') {
    throw createHttpError(409, 'Ya existe un usuario con ese correo en la empresa');
  }

  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    throw createHttpError(400, 'La empresa seleccionada no existe');
  }

  throw error;
}

export async function findUsers(auth) {
  const scope = appendCompanyScope(auth, [], 'u');

  const [rows] = await query(
    `SELECT ${USER_COLUMNS}
     FROM usuarios u
     INNER JOIN empresas e ON e.id = u.empresa_id
     WHERE 1 = 1
     ${scope.clause}
     ORDER BY u.fecha_creacion DESC`,
    scope.params
  );

  return rows;
}

export async function findUserById(userId, auth) {
  const scope = appendCompanyScope(auth, [userId], 'u');

  const [rows] = await query(
    `SELECT ${USER_COLUMNS}
     FROM usuarios u
     INNER JOIN empresas e ON e.id = u.empresa_id
     WHERE u.id = ?
     ${scope.clause}
     LIMIT 1`,
    scope.params
  );

  return rows[0] ?? null;
}

export async function createUser(payload, auth) {
  const user = normalizeUserPayload(payload, auth);
  const passwordHash = await bcrypt.hash(user.password, 10);

  try {
    await assertPlanLimit(user.empresaId, 'users');

    const [result] = await query(
      `INSERT INTO usuarios
        (empresa_id, nombre, email, password_hash, rol, estado)
       VALUES (?, ?, ?, ?, ?, 'ACTIVO')`,
      [user.empresaId, user.nombre, user.correo, passwordHash, user.rol]
    );

    return findUserById(result.insertId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateUser(userId, payload, auth) {
  const currentUser = await findUserById(userId, auth);

  if (!currentUser) {
    throw createHttpError(404, 'Usuario no encontrado');
  }

  const user = normalizeUserPayload(payload, auth, { requirePassword: false });
  const scope = appendCompanyScope(auth, [userId], 'usuarios');

  try {
    if (user.password) {
      const passwordHash = await bcrypt.hash(user.password, 10);

      await query(
        `UPDATE usuarios
         SET empresa_id = ?,
             nombre = ?,
             email = ?,
             password_hash = ?,
             rol = ?,
             estado = ?
         WHERE id = ?
         ${scope.clause}`,
        [
          user.empresaId,
          user.nombre,
          user.correo,
          passwordHash,
          user.rol,
          user.estado || currentUser.estado,
          ...scope.params
        ]
      );
    } else {
      await query(
        `UPDATE usuarios
         SET empresa_id = ?,
             nombre = ?,
             email = ?,
             rol = ?,
             estado = ?
         WHERE id = ?
         ${scope.clause}`,
        [user.empresaId, user.nombre, user.correo, user.rol, user.estado || currentUser.estado, ...scope.params]
      );
    }

    return findUserById(userId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteUser(userId, auth) {
  const scope = appendCompanyScope(auth, [userId], 'usuarios');
  const [result] = await query(`DELETE FROM usuarios WHERE id = ? ${scope.clause}`, scope.params);

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Usuario no encontrado');
  }

  return true;
}
