import OpenAI from 'openai';
import { env } from '../config/env.js';

export const ALLOWED_INTENTS = [
  'SALUDO',
  'DESPEDIDA',
  'AGRADECIMIENTO',
  'AYUDA',
  'BUSCAR_PRODUCTO',
  'BUSCAR_SERVICIO',
  'VER_CATEGORIAS',
  'VER_PROMOCIONES',
  'CONSULTAR_PRECIO',
  'CONSULTAR_STOCK',
  'CONSULTAR_HORARIO',
  'CONSULTAR_UBICACION',
  'INTENCION_COMPRA',
  'AGENDAR_CITA',
  'HABLAR_ASESOR',
  'FUERA_DE_TEMA',
  'MENSAJE_GENERAL'
];

const TOOL_BY_INTENT = {
  BUSCAR_PRODUCTO: 'buscar_productos',
  BUSCAR_SERVICIO: 'buscar_servicios',
  VER_CATEGORIAS: 'obtener_categorias',
  VER_PROMOCIONES: 'obtener_promociones',
  CONSULTAR_PRECIO: 'buscar_productos',
  CONSULTAR_STOCK: 'buscar_productos',
  CONSULTAR_HORARIO: 'obtener_configuracion_empresa',
  CONSULTAR_UBICACION: 'obtener_configuracion_empresa',
  INTENCION_COMPRA: 'crear_lead',
  AGENDAR_CITA: 'crear_lead',
  HABLAR_ASESOR: 'crear_lead'
};

export const FALLBACK_INTENT = {
  intencion: 'MENSAJE_GENERAL',
  herramienta_mcp: null,
  parametros: {},
  confianza: 0.3,
  requiere_respuesta_ia: true
};

let openaiClient = null;

function getOpenAIClient() {
  if (!env.openai.apiKey) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: env.openai.apiKey });
  }

  return openaiClient;
}

function clampConfidence(value) {
  const confidence = Number(value);

  if (!Number.isFinite(confidence)) {
    return FALLBACK_INTENT.confianza;
  }

  return Math.min(Math.max(confidence, 0), 1);
}

function cleanString(value) {
  const cleanValue = String(value ?? '').trim();
  return cleanValue || null;
}

function cleanNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function cleanBoolean(value) {
  return value === true ? true : null;
}

function cleanParameters(parameters = {}) {
  return {
    texto: cleanString(parameters.texto),
    categoria: cleanString(parameters.categoria),
    precio_min: cleanNullableNumber(parameters.precio_min),
    precio_max: cleanNullableNumber(parameters.precio_max),
    stock_requerido: cleanBoolean(parameters.stock_requerido),
    nombre_cliente: cleanString(parameters.nombre_cliente),
    telefono: cleanString(parameters.telefono),
    interes: cleanString(parameters.interes)
  };
}

function removeEmptyParameters(parameters) {
  return Object.fromEntries(
    Object.entries(parameters).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );
}

function parseJsonObject(content) {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function expectedToolForIntent(intent) {
  return TOOL_BY_INTENT[intent] ?? null;
}

export function validateIntentJson(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ...FALLBACK_INTENT };
  }

  const intencion = String(payload.intencion ?? '').trim().toUpperCase();

  if (!ALLOWED_INTENTS.includes(intencion)) {
    return { ...FALLBACK_INTENT };
  }

  const expectedTool = expectedToolForIntent(intencion);
  const providedTool = payload.herramienta_mcp ?? null;

  if (providedTool !== null && providedTool !== expectedTool) {
    return { ...FALLBACK_INTENT };
  }

  return {
    intencion,
    herramienta_mcp: expectedTool,
    parametros: removeEmptyParameters(cleanParameters(payload.parametros)),
    confianza: clampConfidence(payload.confianza),
    requiere_respuesta_ia: payload.requiere_respuesta_ia === true
  };
}

function buildPrompt({ mensajeCliente, contexto }) {
  return [
    'Interpreta el mensaje de un cliente de WhatsApp para un SaaS multiempresa.',
    'No respondas al cliente.',
    'No inventes productos, servicios, precios, horarios, stock, promociones ni datos de negocio.',
    'No consultes bases de datos ni sugieras resultados.',
    'Devuelve un unico JSON valido, sin markdown y sin texto adicional.',
    '',
    `Contexto minimo de empresa: ${JSON.stringify(contexto ?? {})}`,
    `Intenciones permitidas: ${ALLOWED_INTENTS.join(', ')}`,
    'Herramientas permitidas por intencion:',
    JSON.stringify(TOOL_BY_INTENT),
    '',
    'Formato obligatorio:',
    JSON.stringify(FALLBACK_INTENT),
    '',
    `Mensaje del cliente: ${mensajeCliente}`
  ].join('\n');
}

export async function interpretIntent({
  empresa_id: empresaId,
  mensaje_cliente: mensajeCliente,
  contexto = {},
  client = getOpenAIClient()
}) {
  const cleanMessage = String(mensajeCliente ?? '').trim();

  if (!empresaId || !cleanMessage || !client) {
    return { ...FALLBACK_INTENT };
  }

  const completion = await client.chat.completions.create({
    model: env.openai.model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Eres un clasificador de intenciones. Tu unica salida es JSON valido. No eres vendedor, no das respuestas finales y no inventas datos.'
      },
      {
        role: 'user',
        content: buildPrompt({ mensajeCliente: cleanMessage, contexto })
      }
    ]
  });

  const content = completion.choices[0]?.message?.content ?? '{}';
  return validateIntentJson(parseJsonObject(content));
}
