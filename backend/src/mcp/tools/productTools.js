import { query } from '../../config/database.js';
import {
  assertAllowedArgs,
  likeTerm,
  MAX_RESULTS,
  normalizeBoolean,
  normalizeEmpresaId,
  normalizePositiveId,
  normalizePrice
} from './utils.js';
import { createHttpError } from '../../utils/http-error.js';

function validateBuscarProductos(args, auth) {
  assertAllowedArgs(args, [
    'empresa_id',
    'texto',
    'categoria',
    'color',
    'tamano',
    'presupuesto',
    'precio_min',
    'precio_max',
    'stock_requerido'
  ]);

  return {
    empresaId: normalizeEmpresaId(args.empresa_id, auth),
    text: likeTerm(args.texto),
    category: likeTerm(args.categoria),
    color: likeTerm(args.color),
    tamano: likeTerm(args.tamano),
    precioMin: normalizePrice(args.precio_min),
    precioMax: normalizePrice(args.precio_max ?? args.presupuesto),
    stockRequerido: normalizeBoolean(args.stock_requerido)
  };
}

async function executeBuscarProductos(args, auth) {
  const input = validateBuscarProductos(args, auth);
  const params = [input.empresaId];
  const conditions = ["p.empresa_id = ?", "p.estado = 'ACTIVO'"];

  if (input.text) {
    conditions.push('(p.nombre LIKE ? OR p.descripcion LIKE ? OR c.nombre LIKE ?)');
    params.push(input.text, input.text, input.text);
  }

  if (input.category) {
    conditions.push('c.nombre LIKE ?');
    params.push(input.category);
  }

  if (input.color) {
    conditions.push('(p.nombre LIKE ? OR p.descripcion LIKE ?)');
    params.push(input.color, input.color);
  }

  if (input.tamano) {
    conditions.push('(p.nombre LIKE ? OR p.descripcion LIKE ?)');
    params.push(input.tamano, input.tamano);
  }

  if (input.precioMin !== null) {
    conditions.push('p.precio >= ?');
    params.push(input.precioMin);
  }

  if (input.precioMax !== null) {
    conditions.push('p.precio <= ?');
    params.push(input.precioMax);
  }

  if (input.stockRequerido) {
    conditions.push('p.stock > 0');
  }

  const [rows] = await query(
    `SELECT p.id, p.nombre, p.descripcion, p.precio, p.stock, p.imagen, c.nombre AS categoria
     FROM productos p
     LEFT JOIN categorias c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.stock DESC, p.precio ASC, p.nombre ASC
     LIMIT ${MAX_RESULTS}`,
    params
  );

  return { productos: rows };
}

function validateObtenerProducto(args, auth) {
  assertAllowedArgs(args, ['empresa_id', 'producto_id', 'id']);

  return {
    empresaId: normalizeEmpresaId(args.empresa_id, auth),
    productoId: normalizePositiveId(args.producto_id ?? args.id, 'producto_id')
  };
}

async function executeObtenerProducto(args, auth) {
  const input = validateObtenerProducto(args, auth);
  const [rows] = await query(
    `SELECT p.id, p.nombre, p.descripcion, p.precio, p.stock, p.imagen, c.nombre AS categoria
     FROM productos p
     LEFT JOIN categorias c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
     WHERE p.empresa_id = ? AND p.id = ? AND p.estado = 'ACTIVO'
     LIMIT 1`,
    [input.empresaId, input.productoId]
  );

  if (!rows[0]) {
    throw createHttpError(404, 'Producto no encontrado');
  }

  return { producto: rows[0] };
}

export const productTools = [
  {
    name: 'buscar_productos',
    description: 'Busca productos activos de una empresa por texto, categoria, color, tamano, presupuesto, precio y stock.',
    inputSchema: {
      type: 'object',
      properties: {
        empresa_id: { type: 'integer' },
        texto: { type: 'string' },
        categoria: { type: 'string' },
        color: { type: 'string' },
        tamano: { type: 'string' },
        presupuesto: { type: 'number' },
        precio_min: { type: 'number' },
        precio_max: { type: 'number' },
        stock_requerido: { type: 'boolean' }
      },
      required: ['empresa_id'],
      additionalProperties: false
    },
    validate: validateBuscarProductos,
    execute: executeBuscarProductos
  },
  {
    name: 'obtener_producto',
    description: 'Obtiene el detalle de un producto activo de la empresa.',
    inputSchema: {
      type: 'object',
      properties: {
        empresa_id: { type: 'integer' },
        producto_id: { type: 'integer' },
        id: { type: 'integer' }
      },
      required: ['empresa_id'],
      additionalProperties: false
    },
    validate: validateObtenerProducto,
    execute: executeObtenerProducto
  }
];
