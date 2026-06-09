import { query } from '../../config/database.js';
import { createHttpError } from '../../utils/http-error.js';

const CATEGORY_COLUMNS = `
  c.id,
  c.empresa_id,
  c.nombre,
  c.fecha_creacion,
  c.fecha_actualizacion,
  e.nombre AS empresa_nombre
`;

function isSuperAdmin(auth) {
  return auth?.user?.rol === 'SUPER_ADMIN';
}

function getScopedEmpresaId(auth, payloadEmpresaId) {
  if (isSuperAdmin(auth)) {
    const empresaId = Number(payloadEmpresaId);

    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      throw createHttpError(400, 'La empresa es requerida');
    }

    return empresaId;
  }

  return auth.user.empresaId;
}

function normalizeCategoryPayload(payload, auth) {
  const nombre = String(payload.nombre ?? '').trim();

  if (!nombre) {
    throw createHttpError(400, 'El nombre de la categoria es requerido');
  }

  return {
    nombre,
    empresaId: getScopedEmpresaId(auth, payload.empresa_id)
  };
}

function mapDatabaseError(error) {
  if (error?.code === 'ER_DUP_ENTRY') {
    throw createHttpError(409, 'Ya existe una categoria con ese nombre en la empresa');
  }

  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    throw createHttpError(400, 'La empresa seleccionada no existe');
  }

  throw error;
}

export async function findCategories(auth) {
  if (isSuperAdmin(auth)) {
    const [rows] = await query(
      `SELECT ${CATEGORY_COLUMNS}
       FROM categorias c
       INNER JOIN empresas e ON e.id = c.empresa_id
       ORDER BY c.fecha_creacion DESC`
    );

    return rows;
  }

  const [rows] = await query(
    `SELECT ${CATEGORY_COLUMNS}
     FROM categorias c
     INNER JOIN empresas e ON e.id = c.empresa_id
     WHERE c.empresa_id = ?
     ORDER BY c.fecha_creacion DESC`,
    [auth.user.empresaId]
  );

  return rows;
}

export async function findCategoryById(categoryId, auth) {
  const params = [categoryId];
  const scopeCondition = isSuperAdmin(auth) ? '' : 'AND c.empresa_id = ?';

  if (!isSuperAdmin(auth)) {
    params.push(auth.user.empresaId);
  }

  const [rows] = await query(
    `SELECT ${CATEGORY_COLUMNS}
     FROM categorias c
     INNER JOIN empresas e ON e.id = c.empresa_id
     WHERE c.id = ?
     ${scopeCondition}
     LIMIT 1`,
    params
  );

  return rows[0] ?? null;
}

export async function createCategory(payload, auth) {
  const category = normalizeCategoryPayload(payload, auth);

  try {
    const [result] = await query(
      `INSERT INTO categorias (empresa_id, nombre, tipo, estado)
       VALUES (?, ?, 'PRODUCTO', 'ACTIVA')`,
      [category.empresaId, category.nombre]
    );

    return findCategoryById(result.insertId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateCategory(categoryId, payload, auth) {
  const currentCategory = await findCategoryById(categoryId, auth);

  if (!currentCategory) {
    throw createHttpError(404, 'Categoria no encontrada');
  }

  const category = normalizeCategoryPayload(payload, auth);

  try {
    await query(
      `UPDATE categorias
       SET empresa_id = ?,
           nombre = ?
       WHERE id = ?`,
      [category.empresaId, category.nombre, categoryId]
    );

    return findCategoryById(categoryId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteCategory(categoryId, auth) {
  const currentCategory = await findCategoryById(categoryId, auth);

  if (!currentCategory) {
    throw createHttpError(404, 'Categoria no encontrada');
  }

  await query('DELETE FROM categorias WHERE id = ?', [categoryId]);
  return true;
}
