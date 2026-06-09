import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { query } from '../../config/database.js';
import { createHttpError } from '../../utils/http-error.js';

let openaiClient = null;

function getOpenAIClient() {
  if (!env.openai.apiKey) {
    throw createHttpError(500, 'OPENAI_API_KEY no esta configurada');
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: env.openai.apiKey });
  }

  return openaiClient;
}

function normalizePhone(value) {
  return String(value ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

async function getCompanyContext(empresaId) {
  const [companyRows] = await query(
    `SELECT id, nombre, tipo_negocio, plan
     FROM empresas
     WHERE id = ?
     LIMIT 1`,
    [empresaId]
  );

  if (!companyRows[0]) {
    throw createHttpError(404, 'Empresa no encontrada');
  }

  const [products] = await query(
    `SELECT p.id, p.nombre, p.descripcion, p.precio, p.stock, c.nombre AS categoria
     FROM productos p
     LEFT JOIN categorias c ON c.id = p.categoria_id
     WHERE p.empresa_id = ? AND p.estado = 'ACTIVO'
     ORDER BY p.nombre ASC
     LIMIT 80`,
    [empresaId]
  );

  const [services] = await query(
    `SELECT id, nombre, descripcion, precio, duracion_minutos AS duracion
     FROM servicios
     WHERE empresa_id = ? AND estado = 'ACTIVO'
     ORDER BY nombre ASC
     LIMIT 80`,
    [empresaId]
  );

  return {
    empresa: companyRows[0],
    productos: products,
    servicios: services
  };
}

function buildCatalogText(context) {
  const productsText =
    context.productos
      .map(
        (product) =>
          `- ${product.nombre}: ${product.descripcion ?? 'Sin descripcion'} | precio ${product.precio} | stock ${product.stock} | categoria ${product.categoria ?? 'Sin categoria'}`
      )
      .join('\n') || 'Sin productos cargados.';

  const servicesText =
    context.servicios
      .map(
        (service) =>
          `- ${service.nombre}: ${service.descripcion ?? 'Sin descripcion'} | precio ${service.precio} | duracion ${service.duracion ?? 'no definida'} minutos`
      )
      .join('\n') || 'Sin servicios cargados.';

  return `Empresa: ${context.empresa.nombre}
Tipo de negocio: ${context.empresa.tipo_negocio ?? 'No especificado'}

Productos:
${productsText}

Servicios:
${servicesText}`;
}

function parseAIJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return {
      respuesta:
        'Gracias por escribirnos. En un momento revisamos tu mensaje y te compartimos la informacion.',
      intencion_compra: false,
      interes: '',
      nombre_cliente: ''
    };
  }
}

async function createLeadIfNeeded({ empresaId, phone, analysis }) {
  if (!analysis.intencion_compra) {
    return null;
  }

  const nombreCliente = String(analysis.nombre_cliente ?? '').trim() || 'Cliente WhatsApp';
  const interes = String(analysis.interes ?? '').trim() || 'Consulta por WhatsApp';

  const [result] = await query(
    `INSERT INTO leads (empresa_id, nombre_cliente, telefono, interes, estado)
     VALUES (?, ?, ?, ?, 'NUEVO')`,
    [empresaId, nombreCliente, phone, interes]
  );

  return result.insertId;
}

async function saveConversation({ empresaId, phone, message, response }) {
  const [result] = await query(
    `INSERT INTO conversaciones (empresa_id, telefono_cliente, mensaje, respuesta, fecha)
     VALUES (?, ?, ?, ?, NOW())`,
    [empresaId, phone, message, response]
  );

  return result.insertId;
}

export function getAIStatus() {
  return {
    configured: Boolean(env.openai.apiKey),
    model: env.openai.model,
    auto_reply: env.openai.autoReply
  };
}

export async function generateCompanyReply({ empresaId, phone, message }) {
  if (!env.openai.autoReply) {
    throw createHttpError(409, 'La respuesta automatica con IA esta desactivada');
  }

  const context = await getCompanyContext(empresaId);
  const client = getOpenAIClient();

  const completion = await client.chat.completions.create({
    model: env.openai.model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Eres un asistente comercial para una empresa pequena. Responde solo usando los datos de la empresa indicada. No inventes productos, precios ni stock. Si detectas intencion de compra, marca intencion_compra=true. Devuelve exclusivamente JSON valido con claves: respuesta, intencion_compra, interes, nombre_cliente.'
      },
      {
        role: 'user',
        content: `Catalogo y contexto de la empresa:
${buildCatalogText(context)}

Telefono del cliente: ${phone}
Mensaje del cliente: ${message}`
      }
    ]
  });

  const content = completion.choices[0]?.message?.content ?? '{}';
  const analysis = parseAIJson(content);
  const response = String(analysis.respuesta ?? '').trim();

  if (!response) {
    analysis.respuesta =
      'Gracias por escribirnos. Puedo ayudarte con informacion de productos, servicios, precios y disponibilidad.';
  }

  const cleanPhone = normalizePhone(phone);
  const leadId = await createLeadIfNeeded({ empresaId, phone: cleanPhone, analysis });
  const conversationId = await saveConversation({
    empresaId,
    phone: cleanPhone,
    message,
    response: analysis.respuesta
  });

  return {
    respuesta: analysis.respuesta,
    intencion_compra: Boolean(analysis.intencion_compra),
    interes: analysis.interes ?? '',
    lead_id: leadId,
    conversacion_id: conversationId
  };
}

export async function processIncomingCustomerMessage({ empresaId, phone, message }) {
  if (!env.openai.apiKey || !env.openai.autoReply) {
    await saveConversation({
      empresaId,
      phone: normalizePhone(phone),
      message,
      response: null
    });

    return {
      respuesta: null,
      intencion_compra: false,
      lead_id: null,
      conversacion_id: null
    };
  }

  return generateCompanyReply({
    empresaId,
    phone: normalizePhone(phone),
    message
  });
}
