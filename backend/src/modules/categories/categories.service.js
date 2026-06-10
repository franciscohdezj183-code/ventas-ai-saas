import { query } from '../../config/database.js';
import { appendCompanyScope, companyScopeCondition, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { createHttpError } from '../../utils/http-error.js';

const CATEGORY_COLUMNS = `
  c.id,
  c.empresa_id,
  c.nombre,
  c.fecha_creacion,
  c.fecha_actualizacion,
  e.nombre AS empresa_nombre
`;

function normalizeCategoryPayload(payload, auth) {
  const nombre = String(payload.nombre ?? '').trim();

  if (!nombre) {
    throw createHttpError(400, 'El nombre de la categoria es requerido');
  }

  return {
    nombre,
    empresaId: resolveScopedEmpresaId(auth, payload.empresa_id)
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
  const scope = companyScopeCondition(auth, 'c');
  const whereClause = scope.clause ? `WHERE ${scope.clause}` : '';

  const [rows] = await query(
    `SELECT ${CATEGORY_COLUMNS}
     FROM categorias c
     INNER JOIN empresas e ON e.id = c.empresa_id
     ${whereClause}
     ORDER BY c.fecha_creacion DESC`,
    scope.params
  );

  return rows;
}

export async function findCategoryById(categoryId, auth) {
  const scope = appendCompanyScope(auth, [categoryId], 'c');

  const [rows] = await query(
    `SELECT ${CATEGORY_COLUMNS}
     FROM categorias c
     INNER JOIN empresas e ON e.id = c.empresa_id
     WHERE c.id = ?
     ${scope.clause}
     LIMIT 1`,
    scope.params
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
  const scope = appendCompanyScope(auth, [categoryId], 'categorias');

  try {
    await query(
      `UPDATE categorias
       SET empresa_id = ?,
           nombre = ?
       WHERE id = ?
       ${scope.clause}`,
      [category.empresaId, category.nombre, ...scope.params]
    );

    return findCategoryById(categoryId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteCategory(categoryId, auth) {
  const scope = appendCompanyScope(auth, [categoryId], 'categorias');
  const [result] = await query(`DELETE FROM categorias WHERE id = ? ${scope.clause}`, scope.params);

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Categoria no encontrada');
  }

  return true;
}
