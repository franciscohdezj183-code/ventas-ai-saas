import { query } from '../../config/database.js';
import {
  assertAllowedArgs,
  likeTerm,
  MAX_RESULTS,
  normalizeEmpresaId,
  normalizePositiveId
} from './utils.js';
import { createHttpError } from '../../utils/http-error.js';

function validateBuscarServicios(args, auth) {
  assertAllowedArgs(args, ['empresa_id', 'texto']);

  return {
    empresaId: normalizeEmpresaId(args.empresa_id, auth),
    text: likeTerm(args.texto)
  };
}

async function executeBuscarServicios(args, auth) {
  const input = validateBuscarServicios(args, auth);
  const params = [input.empresaId];
  const conditions = ["s.empresa_id = ?", "s.estado = 'ACTIVO'"];

  if (input.text) {
    conditions.push('(s.nombre LIKE ? OR s.descripcion LIKE ?)');
    params.push(input.text, input.text);
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
    `SELECT id, nombre, descripcion, precio, duracion_minutos AS duracion
     FROM servicios
     WHERE empresa_id = ? AND id = ? AND estado = 'ACTIVO'
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
