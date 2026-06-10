import { query } from '../../config/database.js';
import {
  assertAllowedArgs,
  normalizeEmpresaId,
  normalizePhone,
  normalizeText
} from './utils.js';

function normalizeLeadArgs(args, auth, defaultInterest) {
  assertAllowedArgs(args, [
    'empresa_id',
    'nombre_cliente',
    'telefono',
    'interes',
    'texto',
    'producto_id',
    'servicio_id'
  ]);

  return {
    empresaId: normalizeEmpresaId(args.empresa_id, auth),
    nombreCliente: normalizeText(args.nombre_cliente, 'nombre_cliente', {
      fallback: 'Cliente WhatsApp'
    }),
    telefono: normalizePhone(args.telefono),
    interes: normalizeText(args.interes ?? args.texto, 'interes', {
      fallback: defaultInterest
    }),
    productoId: args.producto_id ? Number(args.producto_id) : null,
    servicioId: args.servicio_id ? Number(args.servicio_id) : null
  };
}

async function insertLead(input) {
  const [result] = await query(
    `INSERT INTO leads (empresa_id, nombre_cliente, telefono, interes, estado)
     VALUES (?, ?, ?, ?, 'NUEVO')`,
    [input.empresaId, input.nombreCliente, input.telefono, input.interes]
  );

  return {
    lead_id: result.insertId,
    nombre_cliente: input.nombreCliente,
    telefono: input.telefono,
    interes: input.interes,
    producto_id: input.productoId,
    servicio_id: input.servicioId
  };
}

function validateCrearLead(args, auth) {
  return normalizeLeadArgs(args, auth, 'Consulta por WhatsApp');
}

async function executeCrearLead(args, auth) {
  return insertLead(validateCrearLead(args, auth));
}

function validateRegistrarIntencionCompra(args, auth) {
  return normalizeLeadArgs(args, auth, 'Intencion de compra');
}

async function executeRegistrarIntencionCompra(args, auth) {
  return insertLead(validateRegistrarIntencionCompra(args, auth));
}

const leadSchema = {
  type: 'object',
  properties: {
    empresa_id: { type: 'integer' },
    nombre_cliente: { type: 'string' },
    telefono: { type: 'string' },
    interes: { type: 'string' },
    texto: { type: 'string' },
    producto_id: { type: 'integer' },
    servicio_id: { type: 'integer' }
  },
  required: ['empresa_id'],
  additionalProperties: false
};

export const leadTools = [
  {
    name: 'crear_lead',
    description: 'Crea un lead comercial para la empresa.',
    inputSchema: leadSchema,
    validate: validateCrearLead,
    execute: executeCrearLead
  },
  {
    name: 'registrar_intencion_compra',
    description: 'Registra una intencion de compra como lead comercial.',
    inputSchema: leadSchema,
    validate: validateRegistrarIntencionCompra,
    execute: executeRegistrarIntencionCompra
  }
];
