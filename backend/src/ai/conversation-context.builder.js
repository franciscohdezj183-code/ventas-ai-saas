import { query } from '../config/database.js';

function compactItem(item, type) {
  if (!item || typeof item !== 'object') return null;
  const id = Number(item.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    id,
    tipo: type,
    nombre: String(item.nombre ?? '').slice(0, 160),
    precio: item.precio ?? null,
    categoria: item.categoria ?? null
  };
}

export function buildSafeConversationContext({
  message,
  companyContext = {},
  conversationContext = null,
  recentMessages = [],
  handoff = null
}) {
  const data = conversationContext?.datos_json ?? {};
  const products = Array.isArray(data.ultima_lista_productos) ? data.ultima_lista_productos.map((item) => compactItem(item, 'producto')).filter(Boolean) : [];
  const services = Array.isArray(data.ultima_lista_servicios) ? data.ultima_lista_servicios.map((item) => compactItem(item, 'servicio')).filter(Boolean) : [];
  const selectedProduct = compactItem(data.producto, 'producto');
  const selectedService = compactItem(data.servicio, 'servicio');

  return {
    mensaje_actual: String(message ?? '').slice(0, 4000),
    tipo_negocio: String(companyContext.tipo_negocio ?? 'MIXTO').toUpperCase(),
    empresa: {
      nombre: companyContext.nombre ?? null,
      giro: companyContext.giro ?? companyContext.tipo_negocio ?? null,
      descripcion: companyContext.descripcion ?? companyContext.instrucciones_negocio ?? null,
      horario_atencion: companyContext.horario_atencion ?? null,
      politica_entrega: companyContext.politica_entrega ?? null,
      politica_pagos: companyContext.politica_pagos ?? null
    },
    ultimos_mensajes_relevantes: recentMessages.slice(-6).map((item) => ({
      rol: item.rol,
      texto: String(item.texto ?? '').slice(0, 800)
    })),
    ultima_intencion: conversationContext?.ultima_intencion ?? null,
    producto_o_servicio_seleccionado: selectedProduct ?? selectedService ?? null,
    ultimos_resultados_mostrados: [...products, ...services].slice(0, 10),
    estado_comercial_conversacion: data.estado_comercial ?? null,
    estado_handoff_humano: handoff?.estado ?? null,
    si_el_handoff_fue_rechazado: ['DECLINED', 'BOT_ACTIVE', 'EXPIRED'].includes(handoff?.estado),
    canal: 'whatsapp',
    fecha_hora: new Date().toISOString(),
    restricciones_seguridad: [
      'No decidir empresa_id',
      'No generar SQL',
      'No inventar precios, stock, productos o servicios',
      'No ejecutar herramientas'
    ]
  };
}

export async function loadSafeConversationContext(args) {
  const { empresaId, phone } = args;
  const cleanPhone = String(phone ?? '').replace(/\D/g, '');
  let recentMessages = [];
  let handoff = null;

  try {
    const [rows] = await query(
      `SELECT mensaje, respuesta
       FROM conversaciones
       WHERE empresa_id = ? AND telefono_cliente = ?
       ORDER BY fecha DESC
       LIMIT 4`,
      [empresaId, cleanPhone]
    );
    recentMessages = rows.reverse().flatMap((row) => [
      row.mensaje ? { rol: 'cliente', texto: row.mensaje } : null,
      row.respuesta ? { rol: 'bot', texto: row.respuesta } : null
    ]).filter(Boolean);
  } catch {
    recentMessages = [];
  }

  try {
    const [rows] = await query(
      `SELECT estado, motivo
       FROM human_handoffs
       WHERE empresa_id = ? AND telefono_cliente = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      [empresaId, cleanPhone]
    );
    handoff = rows[0] ?? null;
  } catch {
    handoff = null;
  }

  return buildSafeConversationContext({ ...args, recentMessages, handoff });
}
