import { query } from '../config/database.js';
import { createHttpError } from '../utils/http-error.js';

const MAX_RESULTS = 5;

function normalizeEmpresaId(value) {
  const empresaId = Number(value);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw createHttpError(400, 'empresa_id es requerido para ejecutar herramientas MCP');
  }

  return empresaId;
}

function likeTerm(value) {
  const cleanValue = String(value ?? '').trim();
  return cleanValue ? `%${cleanValue}%` : null;
}

function normalizePrice(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function normalizePhone(value) {
  return String(value ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

async function buscarProductos(args) {
  const empresaId = normalizeEmpresaId(args.empresa_id);
  const params = [empresaId];
  const conditions = ["p.empresa_id = ?", "p.estado = 'ACTIVO'"];
  const text = likeTerm(args.texto);
  const category = likeTerm(args.categoria);
  const precioMin = normalizePrice(args.precio_min);
  const precioMax = normalizePrice(args.precio_max);

  if (text) {
    conditions.push('(p.nombre LIKE ? OR p.descripcion LIKE ? OR c.nombre LIKE ?)');
    params.push(text, text, text);
  }

  if (category) {
    conditions.push('c.nombre LIKE ?');
    params.push(category);
  }

  if (precioMin !== null) {
    conditions.push('p.precio >= ?');
    params.push(precioMin);
  }

  if (precioMax !== null) {
    conditions.push('p.precio <= ?');
    params.push(precioMax);
  }

  if (args.stock_requerido === true) {
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

async function buscarServicios(args) {
  const empresaId = normalizeEmpresaId(args.empresa_id);
  const params = [empresaId];
  const conditions = ["s.empresa_id = ?", "s.estado = 'ACTIVO'"];
  const text = likeTerm(args.texto);

  if (text) {
    conditions.push('(s.nombre LIKE ? OR s.descripcion LIKE ?)');
    params.push(text, text);
  }

  const [rows] = await query(
    `SELECT s.id, s.nombre, s.descripcion, s.precio, s.duracion_minutos AS duracion
     FROM servicios s
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.precio ASC, s.nombre ASC
     LIMIT ${MAX_RESULTS}`,
    params
  );

  return { servicios: rows };
}

async function obtenerCategorias(args) {
  const empresaId = normalizeEmpresaId(args.empresa_id);

  const [rows] = await query(
    `SELECT id, nombre, tipo
     FROM categorias
     WHERE empresa_id = ? AND estado = 'ACTIVA'
     ORDER BY nombre ASC`,
    [empresaId]
  );

  return { categorias: rows };
}

async function obtenerPromociones() {
  return {
    promociones: [],
    mensaje: 'No hay un modulo de promociones configurado todavia.'
  };
}

async function obtenerConfiguracionEmpresa(args) {
  const empresaId = normalizeEmpresaId(args.empresa_id);

  const [rows] = await query(
    `SELECT id, nombre, telefono, direccion, tipo_negocio, plan, activo
     FROM empresas
     WHERE id = ?
     LIMIT 1`,
    [empresaId]
  );

  if (!rows[0]) {
    throw createHttpError(404, 'Empresa no encontrada');
  }

  return { empresa: rows[0] };
}

async function crearLead(args) {
  const empresaId = normalizeEmpresaId(args.empresa_id);
  const nombreCliente = String(args.nombre_cliente ?? '').trim() || 'Cliente WhatsApp';
  const telefono = normalizePhone(args.telefono);
  const interes = String(args.interes ?? args.texto ?? 'Consulta por WhatsApp').trim();

  const [result] = await query(
    `INSERT INTO leads (empresa_id, nombre_cliente, telefono, interes, estado)
     VALUES (?, ?, ?, ?, 'NUEVO')`,
    [empresaId, nombreCliente, telefono, interes]
  );

  return {
    lead_id: result.insertId,
    nombre_cliente: nombreCliente,
    telefono,
    interes
  };
}

const tools = {
  buscar_productos: buscarProductos,
  buscar_servicios: buscarServicios,
  obtener_categorias: obtenerCategorias,
  obtener_promociones: obtenerPromociones,
  obtener_configuracion_empresa: obtenerConfiguracionEmpresa,
  crear_lead: crearLead
};

export const mcpClient = {
  async callTool(toolName, args = {}) {
    const tool = tools[toolName];

    if (!tool) {
      throw createHttpError(400, `Herramienta MCP no soportada: ${toolName}`);
    }

    return tool(args);
  }
};

