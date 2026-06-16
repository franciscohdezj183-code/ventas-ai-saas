import { createOrder } from '../../modules/orders/orders.service.js';
import {
  assertAllowedArgs,
  normalizeEmpresaId,
  normalizePhone,
  normalizeText
} from './utils.js';

function validateCrearPedido(args, auth) {
  assertAllowedArgs(args, [
    'empresa_id',
    'nombre_cliente',
    'cliente_nombre',
    'telefono',
    'telefono_cliente',
    'conversation_id',
    'total',
    'notas'
  ]);

  return {
    empresaId: normalizeEmpresaId(args.empresa_id, auth),
    clienteNombre: normalizeText(args.cliente_nombre ?? args.nombre_cliente, 'cliente_nombre', {
      fallback: 'Cliente WhatsApp'
    }),
    telefonoCliente: normalizePhone(args.telefono_cliente ?? args.telefono),
    conversationId: args.conversation_id ? Number(args.conversation_id) : null,
    total: Number(args.total ?? 0),
    notas: normalizeText(args.notas, 'notas')
  };
}

async function executeCrearPedido(args, auth) {
  const input = validateCrearPedido(args, auth);
  const order = await createOrder({
    empresa_id: input.empresaId,
    cliente_nombre: input.clienteNombre,
    telefono_cliente: input.telefonoCliente,
    conversation_id: input.conversationId,
    total: input.total,
    notas: input.notas,
    estado: 'NUEVO'
  }, auth);

  return {
    pedido_id: order.id,
    cliente_nombre: order.cliente_nombre,
    telefono_cliente: order.telefono_cliente,
    total: order.total,
    estado: order.estado
  };
}

export const orderTools = [
  {
    name: 'crear_pedido',
    description: 'Crea un pedido basico para la empresa con tenant_id validado.',
    inputSchema: {
      type: 'object',
      properties: {
        empresa_id: { type: 'integer' },
        nombre_cliente: { type: 'string' },
        cliente_nombre: { type: 'string' },
        telefono: { type: 'string' },
        telefono_cliente: { type: 'string' },
        conversation_id: { type: 'integer' },
        total: { type: 'number' },
        notas: { type: 'string' }
      },
      required: ['empresa_id'],
      additionalProperties: false
    },
    validate: validateCrearPedido,
    execute: executeCrearPedido
  }
];
