import OpenAI from 'openai';
import { env } from '../config/env.js';
import { mcpClient } from '../mcp/mcpClient.js';

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
  'CONSULTAR_METODOS_PAGO',
  'CONSULTAR_ENVIOS',
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
  CONSULTAR_METODOS_PAGO: 'obtener_configuracion_empresa',
  CONSULTAR_ENVIOS: 'obtener_configuracion_empresa',
  INTENCION_COMPRA: 'registrar_intencion_compra',
  AGENDAR_CITA: 'crear_lead',
  HABLAR_ASESOR: 'crear_lead'
};

const REGISTERED_TOOLS = new Set(mcpClient.listTools().map((tool) => tool.nombre));
const DANGEROUS_PARAMETER_KEYS = new Set(['sql', 'query', 'raw_sql', 'statement', 'where', 'order_by']);

const PARAMETER_CLEANERS = {
  texto: cleanString,
  categoria: cleanString,
  color: cleanString,
  tamano: cleanString,
  presupuesto: cleanNullableNumber,
  precio_min: cleanNullableNumber,
  precio_max: cleanNullableNumber,
  stock_requerido: cleanBoolean,
  nombre_cliente: cleanString,
  telefono: cleanString,
  interes: cleanString,
  producto_id: cleanPositiveInteger,
  servicio_id: cleanPositiveInteger
};

export const FALLBACK_INTENT = {
  intencion: 'MENSAJE_GENERAL',
  herramienta_mcp: '',
  parametros: {},
  confianza: 0,
  requiere_respuesta_ia: false
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

function fallbackIntent() {
  return { ...FALLBACK_INTENT, parametros: {} };
}

function clampConfidence(value) {
  const confidence = Number(value);

  if (!Number.isFinite(confidence)) {
    return FALLBACK_INTENT.confianza;
  }

  return Math.min(Math.max(confidence, 0), 1);
}

function cleanString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'object') {
    return null;
  }

  const cleanValue = String(value).trim();
  return cleanValue || null;
}

function cleanNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'object') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function cleanPositiveInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function cleanBoolean(value) {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  return null;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function hasDangerousParameters(parameters = {}) {
  return Object.entries(parameters).some(([key, value]) => {
    const normalizedKey = key.toLowerCase();

    if (DANGEROUS_PARAMETER_KEYS.has(normalizedKey) || !PARAMETER_CLEANERS[key]) {
      return true;
    }

    return isPlainObject(value) || Array.isArray(value);
  });
}

function cleanParameters(parameters = {}) {
  if (!isPlainObject(parameters) || hasDangerousParameters(parameters)) {
    return null;
  }

  const cleanEntries = Object.entries(PARAMETER_CLEANERS)
    .map(([key, cleaner]) => [key, cleaner(parameters[key])])
    .filter(([, value]) => value !== null && value !== undefined && value !== '');

  return Object.fromEntries(cleanEntries);
}

function parseJsonObject(content) {
  try {
    const parsed = JSON.parse(content);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeToolName(value) {
  return String(value ?? '').trim();
}

function isRegisteredTool(toolName) {
  return toolName === '' || REGISTERED_TOOLS.has(toolName);
}

export function expectedToolForIntent(intent) {
  return TOOL_BY_INTENT[intent] ?? '';
}

export function validateIntentJson(payload) {
  if (!isPlainObject(payload)) {
    return fallbackIntent();
  }

  const intencion = String(payload.intencion ?? '').trim().toUpperCase();

  if (!ALLOWED_INTENTS.includes(intencion)) {
    return fallbackIntent();
  }

  const expectedTool = expectedToolForIntent(intencion);
  const providedTool = normalizeToolName(payload.herramienta_mcp);

  if (!isRegisteredTool(expectedTool) || !isRegisteredTool(providedTool)) {
    return fallbackIntent();
  }

  if (providedTool && providedTool !== expectedTool) {
    return fallbackIntent();
  }

  const parametros = cleanParameters(payload.parametros ?? {});

  if (!parametros) {
    return fallbackIntent();
  }

  return {
    intencion,
    herramienta_mcp: expectedTool,
    parametros,
    confianza: clampConfidence(payload.confianza),
    requiere_respuesta_ia: payload.requiere_respuesta_ia === true
  };
}

function buildPrompt({ mensajeCliente, contexto }) {
  return [
    'Convierte el mensaje de un cliente de WhatsApp en JSON estructurado.',
    'No respondas al cliente, no vendas, no recomiendes, no inventes datos y no consultes bases de datos.',
    'Tu unica tarea es clasificar la intencion y extraer parametros seguros.',
    'Devuelve un unico JSON valido, sin markdown y sin texto adicional.',
    '',
    `Contexto minimo de empresa: ${JSON.stringify(contexto ?? {})}`,
    'Si conversacion_contexto trae ultimo_producto_id o ultimo_servicio_id, usalo para interpretar frases de seguimiento como "cuanto cuesta", "precio", "me interesa" o "lo quiero".',
    `Intenciones permitidas: ${ALLOWED_INTENTS.join(', ')}`,
    'Herramientas permitidas por intencion:',
    JSON.stringify(TOOL_BY_INTENT),
    'Herramientas registradas:',
    JSON.stringify([...REGISTERED_TOOLS]),
    '',
    'Casos que debes reconocer:',
    '- busqueda por presupuesto: usa presupuesto y/o precio_max',
    '- busqueda por categoria: usa categoria',
    '- busqueda por color: usa color',
    '- busqueda por tamano: usa tamano',
    '- intencion de compra: INTENCION_COMPRA',
    '- pedir asesor: HABLAR_ASESOR',
    '- horarios: CONSULTAR_HORARIO',
    '- ubicacion: CONSULTAR_UBICACION',
    '- metodos de pago: CONSULTAR_METODOS_PAGO',
    '- envios: CONSULTAR_ENVIOS',
    '- promociones: VER_PROMOCIONES',
    '',
    'Parametros permitidos:',
    JSON.stringify(Object.keys(PARAMETER_CLEANERS)),
    'No incluyas parametros SQL, filtros raw, where, order_by ni objetos anidados.',
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
    return fallbackIntent();
  }

  const completion = await client.chat.completions.create({
    model: env.openai.model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Eres un clasificador JSON. Solo conviertes mensajes de clientes en JSON estructurado. No das respuestas finales, no inventas datos y no produces SQL.'
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
