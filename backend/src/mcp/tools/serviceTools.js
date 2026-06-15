import { query } from '../../config/database.js';
import {
  assertAllowedArgs,
  likeTerm,
  MAX_RESULTS,
  normalizeEmpresaId,
  normalizePositiveId
} from './utils.js';
import { createHttpError } from '../../utils/http-error.js';

const SEARCH_STOP_WORDS = new Set(['a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'los', 'para', 'por', 'que']);

function normalizeSearchTokens(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))
    .slice(0, 6);
}

function booleanFullTextQuery(tokens) {
  return tokens.map((token) => `${token}*`).join(' ');
}

function validateBuscarServicios(args, auth) {
  assertAllowedArgs(args, ['empresa_id', 'texto']);

  return {
    empresaId: normalizeEmpresaId(args.empresa_id, auth),
    text: likeTerm(args.texto),
    textTokens: normalizeSearchTokens(args.texto)
  };
}

async function executeBuscarServicios(args, auth) {
  const input = validateBuscarServicios(args, auth);
  const params = [input.empresaId];
  const conditions = ["s.empresa_id = ?", "s.estado = 'ACTIVO'"];
  const fullTextQuery = input.textTokens.length > 0 ? booleanFullTextQuery(input.textTokens) : '';

  if (fullTextQuery) {
    const tokenConditions = [];

    for (const token of input.textTokens) {
      const term = likeTerm(token);
      tokenConditions.push('(s.nombre LIKE ? OR s.descripcion LIKE ? OR c.nombre LIKE ?)');
      params.push(term, term, term);
    }

    conditions.push(`(MATCH(s.nombre, s.descripcion) AGAINST (? IN BOOLEAN MODE) OR ${tokenConditions.join(' OR ')})`);
    params.splice(1, 0, fullTextQuery);
  } else if (input.text) {
    conditions.push('(s.nombre LIKE ? OR s.descripcion LIKE ? OR c.nombre LIKE ?)');
    params.push(input.text, input.text, input.text);
  }

  const [rows] = await query(
    `SELECT
       s.id,
       s.nombre,
       s.descripcion,
       s.precio,
       s.tipo_precio,
       s.duracion_minutos AS duracion,
       c.nombre AS categoria,
       CASE
         WHEN ? = '' THEN 0
         ELSE MATCH(s.nombre, s.descripcion) AGAINST (? IN BOOLEAN MODE)
       END AS relevancia
     FROM servicios s
     LEFT JOIN categorias c ON c.empresa_id = s.empresa_id AND c.id = s.categoria_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY relevancia DESC, s.precio ASC, s.nombre ASC
     LIMIT ${MAX_RESULTS}`,
    [fullTextQuery, fullTextQuery, ...params]
  );

  return { servicios: rows };
}

function validateObtenerServicio(args, auth) {
  assertAllowedArgs(args, ['empresa_id', 'servicio_id', 'id']);

  return {
    empresaId: normalizeEmpresaId(args.empresa_id, auth),
    servicioId: normalizePositiveId(args.servicio_id ?? args.id, 'servicio_id')
  };
}

async function executeObtenerServicio(args, auth) {
  const input = validateObtenerServicio(args, auth);
  const [rows] = await query(
    `SELECT s.id, s.nombre, s.descripcion, s.precio, s.tipo_precio, s.duracion_minutos AS duracion, c.nombre AS categoria
     FROM servicios s
     LEFT JOIN categorias c ON c.empresa_id = s.empresa_id AND c.id = s.categoria_id
     WHERE s.empresa_id = ? AND s.id = ? AND s.estado = 'ACTIVO'
     LIMIT 1`,
    [input.empresaId, input.servicioId]
  );

  if (!rows[0]) {
    throw createHttpError(404, 'Servicio no encontrado');
  }

  return { servicio: rows[0] };
}

export const serviceTools = [
  {
    name: 'buscar_servicios',
    description: 'Busca servicios activos de una empresa por texto.',
    inputSchema: {
      type: 'object',
      properties: {
        empresa_id: { type: 'integer' },
        texto: { type: 'string' }
      },
      required: ['empresa_id'],
      additionalProperties: false
    },
    validate: validateBuscarServicios,
    execute: executeBuscarServicios
  },
  {
    name: 'obtener_servicio',
    description: 'Obtiene el detalle de un servicio activo de la empresa.',
    inputSchema: {
      type: 'object',
      properties: {
        empresa_id: { type: 'integer' },
        servicio_id: { type: 'integer' },
        id: { type: 'integer' }
      },
      required: ['empresa_id'],
      additionalProperties: false
    },
    validate: validateObtenerServicio,
    execute: executeObtenerServicio
  }
];
