import bcrypt from 'bcrypt';
import { query } from '../../config/database.js';
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

function normalizeUserPayload(payload, { requirePassword = true } = {}) {
  const nombre = String(payload.nombre ?? '').trim();
  const correo = String(payload.correo ?? payload.email ?? '').trim().toLowerCase();
  const password = String(payload.password ?? '');
  const rol = String(payload.rol ?? 'OWNER').trim().toUpperCase();
  const empresaId = Number(payload.empresa_id);

  if (!nombre) {
    throw createHttpError(400, 'El nombre es requerido');
  }

  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw createHttpError(400, 'El correo no es valido');
  }

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  if (!['SUPER_ADMIN', 'OWNER'].includes(rol)) {
    throw createHttpError(400, 'El rol debe ser SUPER_ADMIN u OWNER');
  }

  if (requirePassword && password.length < 6) {
    throw createHttpError(400, 'El password debe tener al menos 6 caracteres');
  }

  if (!requirePassword && password && password.length < 6) {
    throw createHttpError(400, 'El password debe tener al menos 6 caracteres');
  }

  return { nombre, correo, password, rol, empresaId };
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

export async function findUsers() {
  const [rows] = await query(
    `SELECT ${USER_COLUMNS}
     FROM usuarios u
     INNER JOIN empresas e ON e.id = u.empresa_id
     ORDER BY u.fecha_creacion DESC`
  );

  return rows;
}

export async function findUserById(userId) {
  const [rows] = await query(
    `SELECT ${USER_COLUMNS}
     FROM usuarios u
     INNER JOIN empresas e ON e.id = u.empresa_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] ?? null;
}

export async function createUser(payload) {
  const user = normalizeUserPayload(payload);
  const passwordHash = await bcrypt.hash(user.password, 10);

  try {
    const [result] = await query(
      `INSERT INTO usuarios
        (empresa_id, nombre, email, password_hash, rol, estado)
       VALUES (?, ?, ?, ?, ?, 'ACTIVO')`,
      [user.empresaId, user.nombre, user.correo, passwordHash, user.rol]
    );

    return findUserById(result.insertId);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateUser(userId, payload) {
  const currentUser = await findUserById(userId);

  if (!currentUser) {
    throw createHttpError(404, 'Usuario no encontrado');
  }

  const user = normalizeUserPayload(payload, { requirePassword: false });

  try {
    if (user.password) {
      const passwordHash = await bcrypt.hash(user.password, 10);

      await query(
        `UPDATE usuarios
         SET empresa_id = ?,
             nombre = ?,
             email = ?,
             password_hash = ?,
             rol = ?
         WHERE id = ?`,
        [user.empresaId, user.nombre, user.correo, passwordHash, user.rol, userId]
      );
    } else {
      await query(
        `UPDATE usuarios
         SET empresa_id = ?,
             nombre = ?,
             email = ?,
             rol = ?
         WHERE id = ?`,
        [user.empresaId, user.nombre, user.correo, user.rol, userId]
      );
    }

    return findUserById(userId);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteUser(userId) {
  const [result] = await query('DELETE FROM usuarios WHERE id = ?', [userId]);

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Usuario no encontrado');
  }

  return true;
}
