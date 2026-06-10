import { query } from '../../config/database.js';
import { assertAllowedArgs, normalizeEmpresaId } from './utils.js';

function validateObtenerCategorias(args, auth) {
  assertAllowedArgs(args, ['empresa_id']);

  return {
    empresaId: normalizeEmpresaId(args.empresa_id, auth)
  };
}

async function executeObtenerCategorias(args, auth) {
  const input = validateObtenerCategorias(args, auth);
  const [rows] = await query(
    `SELECT id, nombre, tipo
     FROM categorias
     WHERE empresa_id = ? AND estado = 'ACTIVA'
     ORDER BY nombre ASC`,
    [input.empresaId]
  );

  return { categorias: rows };
}

function validateObtenerPromociones(args, auth) {
  assertAllowedArgs(args, ['empresa_id']);

  return {
    empresaId: args.empresa_id ? normalizeEmpresaId(args.empresa_id, auth) : null
  };
}

async function executeObtenerPromociones(args, auth) {
  validateObtenerPromociones(args, auth);

  return {
    promociones: [],
    mensaje: 'No hay un modulo de promociones configurado todavia.'
  };
}

export const companyTools = [
  {
    name: 'obtener_categorias',
    description: 'Lista categorias activas configuradas para una empresa.',
    inputSchema: {
      type: 'object',
      properties: {
        empresa_id: { type: 'integer' }
      },
      required: ['empresa_id'],
      additionalProperties: false
    },
    validate: validateObtenerCategorias,
    execute: executeObtenerCategorias
  },
  {
    name: 'obtener_promociones',
    description: 'Obtiene promociones vigentes de una empresa cuando el modulo esta disponible.',
    inputSchema: {
      type: 'object',
      properties: {
        empresa_id: { type: 'integer' }
      },
      required: [],
      additionalProperties: false
    },
    validate: validateObtenerPromociones,
    execute: executeObtenerPromociones
  }
];
