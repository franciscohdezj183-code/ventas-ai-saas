import { getConnection, query } from '../../config/database.js';
import { env } from '../../config/env.js';
import { appendCompanyScope, companyScopeCondition, isSuperAdmin, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { createHttpError } from '../../utils/http-error.js';

const PRODUCT_COLUMNS = `
  p.id,
  p.empresa_id,
  p.categoria_id,
  p.nombre,
  p.descripcion,
  p.precio,
  p.stock,
  p.imagen,
  p.estado,
  p.fecha_creacion,
  p.fecha_actualizacion,
  e.nombre AS empresa_nombre,
  c.nombre AS categoria_nombre
`;

function normalizeProductPayload(payload, auth) {
  const nombre = String(payload.nombre ?? '').trim();
  const precio = Number(payload.precio);
  const stock = Number(payload.stock ?? 0);
  const categoriaId = payload.categoria_id ? Number(payload.categoria_id) : null;
  const estado = ['ACTIVO', 'INACTIVO'].includes(payload.estado) ? payload.estado : 'ACTIVO';

  if (!nombre) {
    throw createHttpError(400, 'El nombre del producto es requerido');
  }

  if (!Number.isFinite(precio) || precio < 0) {
    throw createHttpError(400, 'El precio debe ser mayor o igual a 0');
  }

  if (!Number.isInteger(stock) || stock < 0) {
    throw createHttpError(400, 'El stock debe ser un entero mayor o igual a 0');
  }

  if (categoriaId !== null && (!Number.isInteger(categoriaId) || categoriaId <= 0)) {
    throw createHttpError(400, 'La categoria no es valida');
  }

  return {
    empresaId: resolveScopedEmpresaId(auth, payload.empresa_id),
    categoriaId,
    nombre,
    descripcion: String(payload.descripcion ?? '').trim() || null,
    precio,
    stock,
    estado
  };
}

function imageUrlFromFile(file) {
  if (!file) {
    return null;
  }

  return `${env.apiUrl}/uploads/products/${file.filename}`;
}

function mapDatabaseError(error) {
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    throw createHttpError(400, 'La empresa o categoria seleccionada no existe');
  }

  if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
    throw createHttpError(409, 'No se puede eliminar este producto porque tiene datos relacionados');
  }

  throw error;
}

export async function findProducts(auth) {
  const scope = companyScopeCondition(auth, 'p');
  const whereClause = scope.clause ? `WHERE ${scope.clause}` : '';

  const [rows] = await query(
    `SELECT ${PRODUCT_COLUMNS}
     FROM productos p
     INNER JOIN empresas e ON e.id = p.empresa_id
     LEFT JOIN categorias c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
     ${whereClause}
     ORDER BY p.fecha_creacion DESC`,
    scope.params
  );

  return rows;
}

export async function findProductById(productId, auth) {
  const scope = appendCompanyScope(auth, [productId], 'p');

  const [rows] = await query(
    `SELECT ${PRODUCT_COLUMNS}
     FROM productos p
     INNER JOIN empresas e ON e.id = p.empresa_id
     LEFT JOIN categorias c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
     WHERE p.id = ?
     ${scope.clause}
     LIMIT 1`,
    scope.params
  );

  return rows[0] ?? null;
}

export async function createProduct(payload, auth, file) {
  const product = normalizeProductPayload(payload, auth);
  const imagen = imageUrlFromFile(file);

  try {
    const [result] = await query(
      `INSERT INTO productos
        (empresa_id, categoria_id, nombre, descripcion, precio, stock, imagen, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product.empresaId,
        product.categoriaId,
        product.nombre,
        product.descripcion,
        product.precio,
        product.stock,
        imagen,
        product.estado
      ]
    );

    return findProductById(result.insertId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateProduct(productId, payload, auth, file) {
  const currentProduct = await findProductById(productId, auth);

  if (!currentProduct) {
    throw createHttpError(404, 'Producto no encontrado');
  }

  const product = normalizeProductPayload(payload, auth);
  const imagen = imageUrlFromFile(file) ?? currentProduct.imagen;
  const scope = appendCompanyScope(auth, [productId], 'productos');

  try {
    await query(
      `UPDATE productos
       SET empresa_id = ?,
           categoria_id = ?,
           nombre = ?,
           descripcion = ?,
           precio = ?,
           stock = ?,
           imagen = ?,
           estado = ?
       WHERE id = ?
       ${scope.clause}`,
      [
        product.empresaId,
        product.categoriaId,
        product.nombre,
        product.descripcion,
        product.precio,
        product.stock,
        imagen,
        product.estado,
        ...scope.params
      ]
    );

    return findProductById(productId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteProduct(productId, auth) {
  const scope = appendCompanyScope(auth, [productId], 'productos');

  try {
    const [result] = await query(`DELETE FROM productos WHERE id = ? ${scope.clause}`, scope.params);

    if (result.affectedRows === 0) {
      throw createHttpError(404, 'Producto no encontrado');
    }

    return true;
  } catch (error) {
    mapDatabaseError(error);
  }
}

async function findCategoryByName(connection, empresaId, nombre) {
  const [rows] = await connection.query(
    `SELECT id
     FROM categorias
     WHERE empresa_id = ? AND nombre = ? AND tipo = 'PRODUCTO'
     LIMIT 1`,
    [empresaId, nombre]
  );

  return rows[0]?.id ?? null;
}

async function findOrCreateCategory(connection, empresaId, nombre) {
  const cleanName = String(nombre ?? '').trim();

  if (!cleanName) {
    return null;
  }

  const existingCategoryId = await findCategoryByName(connection, empresaId, cleanName);

  if (existingCategoryId) {
    return existingCategoryId;
  }

  const [result] = await connection.query(
    `INSERT INTO categorias (empresa_id, nombre, tipo, estado)
     VALUES (?, ?, 'PRODUCTO', 'ACTIVA')`,
    [empresaId, cleanName]
  );

  return result.insertId;
}

function normalizeImportRow(row, index, auth, empresaId) {
  const errors = [];
  const nombre = String(row.nombre ?? '').trim();
  const descripcion = String(row.descripcion ?? '').trim() || null;
  const precio = Number(row.precio);
  const stock = Number(row.stock);
  const categoria = String(row.categoria ?? '').trim();

  if (!nombre) {
    errors.push('nombre es requerido');
  }

  if (!Number.isFinite(precio) || precio < 0) {
    errors.push('precio debe ser mayor o igual a 0');
  }

  if (!Number.isInteger(stock) || stock < 0) {
    errors.push('stock debe ser un entero mayor o igual a 0');
  }

  if (!categoria) {
    errors.push('categoria es requerida');
  }

  if (isSuperAdmin(auth) && (!Number.isInteger(empresaId) || empresaId <= 0)) {
    errors.push('empresa_id es requerido para SUPER_ADMIN');
  }

  return {
    data: { nombre, descripcion, precio, stock, categoria, empresaId },
    error: errors.length > 0 ? { fila: index + 2, errores: errors } : null
  };
}

export async function importProducts(rows, auth, payload = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw createHttpError(400, 'El archivo no contiene productos para importar');
  }

  const empresaId = resolveScopedEmpresaId(auth, payload.empresa_id);
  const normalizedRows = rows.map((row, index) => normalizeImportRow(row, index, auth, empresaId));
  const validationErrors = normalizedRows.filter((row) => row.error).map((row) => row.error);
  const validRows = normalizedRows.filter((row) => !row.error).map((row) => row.data);

  if (validRows.length === 0) {
    return {
      total_filas: rows.length,
      insertados: 0,
      errores: validationErrors
    };
  }

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    for (const product of validRows) {
      const categoryId = await findOrCreateCategory(connection, product.empresaId, product.categoria);

      await connection.query(
        `INSERT INTO productos
          (empresa_id, categoria_id, nombre, descripcion, precio, stock, imagen, estado)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 'ACTIVO')`,
        [
          product.empresaId,
          categoryId,
          product.nombre,
          product.descripcion,
          product.precio,
          product.stock
        ]
      );
    }

    await connection.commit();

    return {
      total_filas: rows.length,
      insertados: validRows.length,
      errores: validationErrors
    };
  } catch (error) {
    await connection.rollback();
    mapDatabaseError(error);
  } finally {
    connection.release();
  }
}
