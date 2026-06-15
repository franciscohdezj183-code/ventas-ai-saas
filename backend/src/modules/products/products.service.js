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
  p.sku,
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

export async function findProducts(auth, listOptions = {}) {
  return findProductsPage(auth, listOptions);
}

function normalizeListOptions(options = {}) {
  const page = Math.max(Number.parseInt(options.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(options.pageSize, 10) || 24, 1), 100);
  const search = String(options.search ?? '').trim();
  const categoriaId = options.categoria_id ? Number(options.categoria_id) : null;
  const estado = ['ACTIVO', 'INACTIVO'].includes(String(options.estado ?? '').toUpperCase())
    ? String(options.estado).toUpperCase()
    : null;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search,
    categoriaId: Number.isInteger(categoriaId) && categoriaId > 0 ? categoriaId : null,
    estado
  };
}

function buildProductListWhere(auth, options) {
  const scope = companyScopeCondition(auth, 'p');
  const clauses = [];
  const params = [];

  if (scope.clause) {
    clauses.push(scope.clause);
    params.push(...scope.params);
  }

  if (options.search) {
    const term = `%${options.search}%`;
    clauses.push('(p.nombre LIKE ? OR p.descripcion LIKE ? OR p.sku LIKE ? OR c.nombre LIKE ?)');
    params.push(term, term, term, term);
  }

  if (options.categoriaId) {
    clauses.push('p.categoria_id = ?');
    params.push(options.categoriaId);
  }

  if (options.estado) {
    clauses.push('p.estado = ?');
    params.push(options.estado);
  }

  return {
    whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

export async function findProductsPage(auth, listOptions = {}) {
  const options = normalizeListOptions(listOptions);
  const { whereClause, params } = buildProductListWhere(auth, options);

  const [rows] = await query(
    `SELECT ${PRODUCT_COLUMNS}
     FROM productos p
     INNER JOIN empresas e ON e.id = p.empresa_id
     LEFT JOIN categorias c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
     ${whereClause}
     ORDER BY p.fecha_creacion DESC
     LIMIT ?
     OFFSET ?`,
    [...params, options.pageSize, options.offset]
  );

  const [countRows] = await query(
    `SELECT COUNT(*) AS total
     FROM productos p
     INNER JOIN empresas e ON e.id = p.empresa_id
     LEFT JOIN categorias c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
     ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total ?? 0);

  return {
    items: rows,
    meta: {
      page: options.page,
      pageSize: options.pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / options.pageSize), 1)
    }
  };
}

function normalizeInsightTotals(row = {}) {
  const totalProducts = Number(row.total_productos ?? 0);
  const productsWithDescription = Number(row.con_descripcion ?? 0);
  const productsWithImage = Number(row.con_imagen ?? 0);
  const activeProducts = Number(row.activos ?? 0);

  return {
    total_productos: totalProducts,
    productos_activos: activeProducts,
    productos_inactivos: Number(row.inactivos ?? 0),
    sin_stock: Number(row.sin_stock ?? 0),
    bajo_stock: Number(row.bajo_stock ?? 0),
    sin_categoria: Number(row.sin_categoria ?? 0),
    sin_descripcion: Math.max(totalProducts - productsWithDescription, 0),
    sin_imagen: Math.max(totalProducts - productsWithImage, 0),
    precio_promedio: Number(Number(row.precio_promedio ?? 0).toFixed(2)),
    cobertura_descripcion: totalProducts ? Number(((productsWithDescription / totalProducts) * 100).toFixed(2)) : 0,
    cobertura_imagen: totalProducts ? Number(((productsWithImage / totalProducts) * 100).toFixed(2)) : 0,
    salud_catalogo: totalProducts
      ? Math.round((
        (activeProducts / totalProducts) * 30
        + (productsWithDescription / totalProducts) * 25
        + (productsWithImage / totalProducts) * 20
        + ((totalProducts - Number(row.sin_stock ?? 0)) / totalProducts) * 25
      ))
      : 0
  };
}

function buildCatalogRecommendations(totals) {
  const recommendations = [];

  if (totals.sin_stock > 0) {
    recommendations.push({
      prioridad: 'ALTA',
      titulo: 'Revisar productos agotados',
      detalle: `${totals.sin_stock} productos no se pueden vender porque no tienen stock.`,
      accion: 'Actualizar stock o desactivarlos temporalmente.'
    });
  }

  if (totals.bajo_stock > 0) {
    recommendations.push({
      prioridad: 'MEDIA',
      titulo: 'Prevenir quiebres de inventario',
      detalle: `${totals.bajo_stock} productos estan cerca de agotarse.`,
      accion: 'Priorizar resurtido de los productos con mayor demanda.'
    });
  }

  if (totals.sin_descripcion > 0) {
    recommendations.push({
      prioridad: 'MEDIA',
      titulo: 'Mejorar respuestas del bot',
      detalle: `${totals.sin_descripcion} productos no tienen descripcion comercial.`,
      accion: 'Agregar materiales, medidas, usos o beneficios.'
    });
  }

  if (totals.sin_imagen > 0) {
    recommendations.push({
      prioridad: 'BAJA',
      titulo: 'Completar evidencia visual',
      detalle: `${totals.sin_imagen} productos no tienen imagen.`,
      accion: 'Subir foto para que el asesor y el cliente validen mas rapido.'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      prioridad: 'BAJA',
      titulo: 'Catalogo listo para vender',
      detalle: 'Los productos activos tienen buena cobertura operativa.',
      accion: 'Mantener precios, stock e imagenes actualizados.'
    });
  }

  return recommendations;
}

export async function getCatalogInsights(auth) {
  const productScope = companyScopeCondition(auth, 'p');
  const productWhere = productScope.clause ? `WHERE ${productScope.clause}` : '';
  const serviceScope = companyScopeCondition(auth, 's');
  const serviceWhere = serviceScope.clause ? `WHERE ${serviceScope.clause}` : '';
  const categoryScope = companyScopeCondition(auth, 'c');
  const categoryWhere = categoryScope.clause ? `WHERE ${categoryScope.clause}` : '';

  const [[productTotals], [serviceTotals], [categoryRows], [priorityRows], [categoryHealthRows]] = await Promise.all([
    query(
      `SELECT
         COUNT(*) AS total_productos,
         SUM(CASE WHEN p.estado = 'ACTIVO' THEN 1 ELSE 0 END) AS activos,
         SUM(CASE WHEN p.estado = 'INACTIVO' THEN 1 ELSE 0 END) AS inactivos,
         SUM(CASE WHEN p.stock <= 0 THEN 1 ELSE 0 END) AS sin_stock,
         SUM(CASE WHEN p.stock > 0 AND p.stock <= 5 THEN 1 ELSE 0 END) AS bajo_stock,
         SUM(CASE WHEN p.categoria_id IS NULL THEN 1 ELSE 0 END) AS sin_categoria,
         SUM(CASE WHEN p.descripcion IS NOT NULL AND p.descripcion <> '' THEN 1 ELSE 0 END) AS con_descripcion,
         SUM(CASE WHEN p.imagen IS NOT NULL AND p.imagen <> '' THEN 1 ELSE 0 END) AS con_imagen,
         AVG(p.precio) AS precio_promedio
       FROM productos p
       ${productWhere}`,
      productScope.params
    ),
    query(
      `SELECT
         COUNT(*) AS total_servicios,
         SUM(CASE WHEN s.estado = 'ACTIVO' THEN 1 ELSE 0 END) AS servicios_activos,
         SUM(CASE WHEN s.descripcion IS NULL OR s.descripcion = '' THEN 1 ELSE 0 END) AS servicios_sin_descripcion,
         AVG(s.precio) AS precio_promedio_servicios
       FROM servicios s
       ${serviceWhere}`,
      serviceScope.params
    ),
    query(
      `SELECT c.tipo, COUNT(*) AS total
       FROM categorias c
       ${categoryWhere}
       GROUP BY c.tipo`,
      categoryScope.params
    ),
    query(
      `SELECT ${PRODUCT_COLUMNS}
       FROM productos p
       INNER JOIN empresas e ON e.id = p.empresa_id
       LEFT JOIN categorias c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
       ${productWhere}
       ORDER BY
         CASE
           WHEN p.stock <= 0 THEN 1
           WHEN p.stock <= 5 THEN 2
           WHEN p.descripcion IS NULL OR p.descripcion = '' THEN 3
           WHEN p.imagen IS NULL OR p.imagen = '' THEN 4
           ELSE 5
         END,
         p.fecha_actualizacion DESC
       LIMIT 8`,
      productScope.params
    ),
    query(
      `SELECT
         COALESCE(c.nombre, 'Sin categoria') AS categoria,
         COUNT(*) AS productos,
         SUM(CASE WHEN p.stock <= 0 THEN 1 ELSE 0 END) AS sin_stock,
         SUM(CASE WHEN p.descripcion IS NULL OR p.descripcion = '' THEN 1 ELSE 0 END) AS sin_descripcion,
         AVG(p.precio) AS precio_promedio
       FROM productos p
       LEFT JOIN categorias c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
       ${productWhere}
       GROUP BY COALESCE(c.nombre, 'Sin categoria')
       ORDER BY sin_stock DESC, sin_descripcion DESC, productos DESC
       LIMIT 8`,
      productScope.params
    )
  ]);

  const totals = normalizeInsightTotals(productTotals[0]);
  const serviceSummary = serviceTotals[0] ?? {};
  const categories = categoryRows.reduce((accumulator, row) => ({
    ...accumulator,
    [String(row.tipo ?? 'GENERAL').toLowerCase()]: Number(row.total ?? 0)
  }), {});

  return {
    resumen: {
      ...totals,
      total_servicios: Number(serviceSummary.total_servicios ?? 0),
      servicios_activos: Number(serviceSummary.servicios_activos ?? 0),
      servicios_sin_descripcion: Number(serviceSummary.servicios_sin_descripcion ?? 0),
      precio_promedio_servicios: Number(Number(serviceSummary.precio_promedio_servicios ?? 0).toFixed(2)),
      categorias_producto: categories.producto ?? 0,
      categorias_servicio: categories.servicio ?? 0
    },
    recomendaciones: buildCatalogRecommendations(totals),
    productos_prioritarios: priorityRows.map((product) => ({
      ...product,
      precio: Number(product.precio ?? 0),
      stock: Number(product.stock ?? 0)
    })),
    salud_por_categoria: categoryHealthRows.map((row) => ({
      categoria: row.categoria,
      productos: Number(row.productos ?? 0),
      sin_stock: Number(row.sin_stock ?? 0),
      sin_descripcion: Number(row.sin_descripcion ?? 0),
      precio_promedio: Number(Number(row.precio_promedio ?? 0).toFixed(2))
    }))
  };
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
