import { query } from '../../config/database.js';
import {
  assertAllowedArgs,
  normalizeEmpresaId,
  normalizePhone,
  normalizeText
} from './utils.js';

const ALLOWED_STATES = new Set(['open', 'bot_active', 'requires_human', 'human_active', 'closed']);
const ALLOWED_MESSAGE_TYPES = new Set(['customer', 'bot', 'human', 'system']);

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return allowedValues.has(normalized) ? normalized : fallback;
}

function validateGuardarConversacion(args, auth) {
  assertAllowedArgs(args, [
    'empresa_id',
    'telefono',
    'telefono_cliente',
    'whatsapp_id',
    'external_id',
    'whatsapp_message_id',
    'message_id',
    'contact_name',
    'nombre_contacto',
    'mensaje',
    'texto',
    'respuesta',
    'estado',
    'tipo_mensaje'
  ]);

  return {
    empresaId: normalizeEmpresaId(args.empresa_id, auth),
    telefonoCliente: normalizePhone(args.telefono_cliente ?? args.telefono),
    whatsappId: normalizeText(args.whatsapp_id ?? args.external_id, 'whatsapp_id'),
    whatsappMessageId: normalizeText(args.whatsapp_message_id ?? args.message_id, 'whatsapp_message_id'),
    contactName: normalizeText(args.contact_name ?? args.nombre_contacto, 'contact_name'),
    mensaje: normalizeText(args.mensaje ?? args.texto, 'mensaje', { required: true }),
    respuesta: normalizeText(args.respuesta, 'respuesta'),
    estado: normalizeEnum(args.estado, ALLOWED_STATES, args.respuesta ? 'bot_active' : 'open'),
    tipoMensaje: normalizeEnum(args.tipo_mensaje, ALLOWED_MESSAGE_TYPES, args.respuesta ? 'bot' : 'customer')
  };
}

async function executeGuardarConversacion(args, auth) {
  const input = validateGuardarConversacion(args, auth);
  const [result] = await query(
    `INSERT INTO conversaciones
      (empresa_id, telefono_cliente, whatsapp_id, whatsapp_message_id, contact_name, mensaje, respuesta, estado, tipo_mensaje, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       telefono_cliente = VALUES(telefono_cliente),
       whatsapp_id = COALESCE(VALUES(whatsapp_id), whatsapp_id),
       contact_name = COALESCE(VALUES(contact_name), contact_name)`,
    [
      input.empresaId,
      input.telefonoCliente,
      input.whatsappId,
      input.whatsappMessageId,
      input.contactName,
      input.mensaje,
      input.respuesta,
      input.estado,
      input.tipoMensaje
    ]
  );

  return {
    conversacion_id: result.insertId,
    telefono_cliente: input.telefonoCliente,
    whatsapp_id: input.whatsappId,
    whatsapp_message_id: input.whatsappMessageId,
    contact_name: input.contactName
  };
}

export const conversationTools = [
  {
    name: 'guardar_conversacion',
    description: 'Guarda una conversacion entrante y su respuesta dentro del historial de la empresa.',
    inputSchema: {
      type: 'object',
      properties: {
        empresa_id: { type: 'integer' },
        telefono: { type: 'string' },
        telefono_cliente: { type: 'string' },
        whatsapp_id: { type: 'string' },
        external_id: { type: 'string' },
        whatsapp_message_id: { type: 'string' },
        message_id: { type: 'string' },
        contact_name: { type: 'string' },
        nombre_contacto: { type: 'string' },
        mensaje: { type: 'string' },
        texto: { type: 'string' },
        respuesta: { type: 'string' },
        estado: { type: 'string' },
        tipo_mensaje: { type: 'string' }
      },
      required: ['empresa_id'],
      additionalProperties: false
    },
    validate: validateGuardarConversacion,
    execute: executeGuardarConversacion
  }
];
