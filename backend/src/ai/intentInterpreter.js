import OpenAI from 'openai';
import { env } from '../config/env.js';
import { mcpClient } from '../mcp/mcpClient.js';
import { logger } from '../utils/logger.js';
import { buildSafeFallbackIntent } from './intent-fallback.service.js';
import {
  buildIntentDiagnostics,
  logIntentDiagnostics
} from './intent-diagnostics.service.js';
import {
  ALLOWED_INTENTS,
  FALLBACK_INTENT,
  TOOL_BY_INTENT,
  expectedToolForIntent,
  validateIntentDetailed,
  validateIntentJson
} from './intent-validation.service.js';
import {
  recordOpenAIError,
  recordOpenAISuccess
} from './openai-health.service.js';

const REGISTERED_TOOLS = new Set(mcpClient.listTools().map((tool) => tool.nombre));
const ALLOWED_PARAMETER_NAMES = [
  'texto', 'categoria', 'color', 'tamano', 'cantidad', 'presupuesto',
  'precio_min', 'precio_max', 'stock_requerido', 'nombre_cliente',
  'cliente_nombre', 'telefono', 'telefono_cliente', 'interes', 'total',
  'notas', 'conversation_id', 'producto_id', 'servicio_id',
  'opcion_numerada', 'offset'
];
export { ALLOWED_INTENTS, FALLBACK_INTENT, expectedToolForIntent, validateIntentJson };

let openaiClient = null;

export function getOpenAIClient() {
  if (!env.openai.apiKey) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.openai.apiKey,
      timeout: env.openai.timeoutMs,
      maxRetries: env.openai.maxRetries
    });
  }

  return openaiClient;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(content) {
  try {
    const parsed = JSON.parse(content);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}


function buildPrompt({ mensajeCliente, contexto }) {
  return [
    'Analiza dinamicamente el mensaje de un cliente de WhatsApp y conviertelo en JSON estructurado.',
    'No respondas al cliente, no vendas, no recomiendes, no inventes datos y no consultes bases de datos.',
    'No ejecutes herramientas. No decidas empresa_id o tenant_id. No generes SQL.',
    'Usa el contexto solo cuando sea relevante para referencias como "el segundo", "ese", "tambien" o "cuanto cuesta".',
    'Si el mensaje es saludo, agradecimiento, despedida o cambio claro de tema, no reutilices el contexto comercial.',
    'Si hay varias necesidades, separalas en necesidades y resume la solicitud en parametros.texto.',
    'Marca requiere_asesor=true cuando el cliente pida una cotizacion personalizada, una cita, un proyecto con varias necesidades o hablar con una persona.',
    'Si no estas seguro usa MENSAJE_GENERAL con confianza baja.',
    'Devuelve un unico JSON valido, sin markdown y sin texto adicional.',
    '',
    `Contexto conversacional seguro: ${JSON.stringify(contexto ?? {})}`,
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
    '- busqueda de producto: coloca toda la descripcion buscada en el parametro texto',
    '- busqueda de servicio: coloca todos los servicios o necesidades mencionados en un unico parametro texto',
    '- catalogo/lista/menu: si el negocio es de servicios o mixto y el cliente pide "catalogo", "catalogo de servicios", "que servicios tienen" o "que ofrecen", usa BUSCAR_SERVICIO con buscar_servicios y texto vacio',
    '- no uses parametros como servicios_solicitados, productos_solicitados, items, necesidades ni listas; usa texto',
    '- intencion de compra: INTENCION_COMPRA para frases como "me interesa", "lo quiero", "la quiero", "quiero comprar", "apartamelo", "me lo llevo", "quiero ese" o "quiero informacion"',
    '- pedir asesor: HABLAR_ASESOR para frases como "pasame con asesor" o "quiero hablar con un asesor"',
    '- afirmaciones contextuales: si el cliente dice "si", "ok", "claro" o similar y el contexto muestra que el bot acaba de ofrecer un asesor, usa HABLAR_ASESOR con crear_lead',
    '- una cotizacion de proyecto puede conservar BUSCAR_SERVICIO, pero debe marcar requiere_asesor=true y resumir claramente las necesidades',
    '- horarios: CONSULTAR_HORARIO',
    '- ubicacion: CONSULTAR_UBICACION',
    '- metodos de pago: CONSULTAR_METODOS_PAGO',
    '- envios: CONSULTAR_ENVIOS',
    '- promociones: VER_PROMOCIONES',
    '',
    'Parametros permitidos:',
    JSON.stringify(ALLOWED_PARAMETER_NAMES),
    'No incluyas parametros SQL, filtros raw, where, order_by ni objetos anidados.',
    '',
    'Estructura obligatoria:',
    '{"intencion":"INTENCION_PERMITIDA","herramienta_mcp":"HERRAMIENTA_CORRESPONDIENTE_O_VACIO","parametros":{"texto":"descripcion cuando aplique"},"resumen_cliente":"resumen breve","necesidades":[],"entidades":{"nombre_cliente":null,"nombre_negocio":null,"cantidad":null,"presupuesto":null,"producto_o_servicio_referenciado":null,"opcion_numerada":null},"sentimiento":"neutral","prioridad":"media","requiere_asesor":false,"respuesta_sugerida":null,"confianza":0.95,"requiere_respuesta_ia":false}',
    '',
    `Mensaje del cliente: ${mensajeCliente}`
  ].join('\n');
}

export async function interpretIntentDetailed({
  empresa_id: empresaId,
  mensaje_cliente: mensajeCliente,
  contexto = {},
  client = getOpenAIClient(),
  onUsage = null,
  confidenceThreshold = 0.45,
  conversation_id: conversationId = null
}) {
  const cleanMessage = String(mensajeCliente ?? '').trim();
  const startedAt = Date.now();
  let rawInterpretation = null;
  let usage = {};
  let model = env.openai.model;
  let errorCode = null;

  if (!empresaId || !cleanMessage || !client) {
    const finalInterpretation = buildSafeFallbackIntent({ message: cleanMessage, context: contexto });
    return buildIntentDiagnostics({
      rawInterpretation: {},
      validatedInterpretation: { ...FALLBACK_INTENT },
      finalInterpretation,
      fallbackReason: !client ? 'openai_not_configured' : 'missing_required_input',
      model,
      latencyMs: Date.now() - startedAt,
      contextUsed: contexto
    });
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.openai.model,
      temperature: env.openai.temperature,
      max_tokens: env.openai.maxTokens,
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
    recordOpenAISuccess();
    model = completion.model ?? env.openai.model;
    usage = {
      tokens_input: Number(completion.usage?.prompt_tokens ?? 0),
      tokens_output: Number(completion.usage?.completion_tokens ?? 0),
      total_tokens: Number(completion.usage?.total_tokens ?? 0),
      modelo_usado: model
    };
    rawInterpretation = parseJsonObject(completion.choices[0]?.message?.content ?? '{}');
    const validation = validateIntentDetailed(rawInterpretation, { confidenceThreshold });
    const finalInterpretation = validation.fallbackReason
      ? buildSafeFallbackIntent({ message: cleanMessage, context: contexto })
      : validation.interpretation;
    const diagnostics = buildIntentDiagnostics({
      rawInterpretation,
      validatedInterpretation: validation.interpretation,
      finalInterpretation,
      ignoredFields: validation.ignoredFields,
      fallbackReason: validation.fallbackReason,
      model,
      latencyMs: Date.now() - startedAt,
      usage,
      contextUsed: contexto
    });

    if (typeof onUsage === 'function') {
      try {
        await onUsage(usage);
      } catch (error) {
        logger.error('openai_usage_callback_error', { empresaId, error });
      }
    }

    logIntentDiagnostics({ companyId: empresaId, conversationId, diagnostics });
    return diagnostics;
  } catch (error) {
    recordOpenAIError(error);
    errorCode = error?.code ?? error?.name ?? 'OPENAI_ERROR';
    const finalInterpretation = buildSafeFallbackIntent({ message: cleanMessage, context: contexto });
    const diagnostics = buildIntentDiagnostics({
      rawInterpretation: {},
      validatedInterpretation: { ...FALLBACK_INTENT },
      finalInterpretation,
      fallbackReason: `openai_error:${errorCode}`,
      model,
      latencyMs: Date.now() - startedAt,
      usage,
      contextUsed: contexto
    });
    logIntentDiagnostics({ companyId: empresaId, conversationId, diagnostics, errorCode });
    return diagnostics;
  }
}

export async function interpretIntent(args) {
  const diagnostics = await interpretIntentDetailed(args);
  return diagnostics.final_interpretation;
}
