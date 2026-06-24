import { mcpClient } from '../mcp/mcpClient.js';

export const ALLOWED_INTENTS = Object.freeze([
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
]);

export const TOOL_BY_INTENT = Object.freeze({
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
});

const REGISTERED_TOOLS = new Set(mcpClient.listTools().map((tool) => tool.nombre));
const DANGEROUS_KEYS = new Set([
  'sql',
  'query',
  'raw_sql',
  'rawquery',
  'statement',
  'where',
  'order_by',
  'orderby',
  'include',
  'table',
  'column',
  'password',
  'token',
  'authorization',
  'apikey',
  'api_key',
  'openai_api_key',
  'empresa_id',
  'tenant_id',
  'company_id'
]);

const PARAMETER_CLEANERS = {
  texto: cleanString,
  categoria: cleanString,
  color: cleanString,
  tamano: cleanString,
  cantidad: cleanNullableNumber,
  presupuesto: cleanNullableNumber,
  precio_min: cleanNullableNumber,
  precio_max: cleanNullableNumber,
  stock_requerido: cleanBoolean,
  nombre_cliente: cleanString,
  cliente_nombre: cleanString,
  telefono: cleanString,
  telefono_cliente: cleanString,
  interes: cleanString,
  total: cleanNullableNumber,
  notas: cleanString,
  conversation_id: cleanPositiveInteger,
  producto_id: cleanPositiveInteger,
  servicio_id: cleanPositiveInteger,
  opcion_numerada: cleanPositiveInteger,
  offset: cleanNonNegativeInteger
};

const PARAMS_BY_TOOL = Object.freeze({
  buscar_productos: new Set(['texto', 'categoria', 'color', 'tamano', 'cantidad', 'presupuesto', 'precio_min', 'precio_max', 'stock_requerido', 'offset']),
  buscar_servicios: new Set(['texto', 'categoria', 'presupuesto']),
  obtener_producto: new Set(['producto_id']),
  obtener_servicio: new Set(['servicio_id']),
  obtener_categorias: new Set(),
  obtener_promociones: new Set(),
  obtener_configuracion_empresa: new Set(),
  registrar_intencion_compra: new Set(['texto', 'interes', 'nombre_cliente', 'telefono', 'producto_id', 'servicio_id', 'cantidad', 'presupuesto']),
  crear_lead: new Set(['texto', 'interes', 'nombre_cliente', 'telefono', 'producto_id', 'servicio_id', 'cantidad', 'presupuesto']),
  crear_pedido: new Set(['texto', 'interes', 'cliente_nombre', 'telefono_cliente', 'producto_id', 'cantidad', 'total', 'notas', 'conversation_id'])
});

export const FALLBACK_INTENT = Object.freeze({
  intencion: 'MENSAJE_GENERAL',
  herramienta_mcp: '',
  parametros: {},
  confianza: 0,
  requiere_respuesta_ia: false
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value) {
  if (value === null || value === undefined || typeof value === 'object') return null;
  const clean = String(value).trim();
  return clean ? clean.slice(0, 1000) : null;
}

function cleanNullableNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'object') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function cleanPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function cleanNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function cleanBoolean(value) {
  return value === true || value === false ? value : null;
}

function clampConfidence(value) {
  const confidence = Number(value);
  return Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0;
}

function dangerousPath(value, prefix = '') {
  if (!isPlainObject(value) && !Array.isArray(value)) return null;

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const path = prefix ? `${prefix}.${key}` : key;
    if (DANGEROUS_KEYS.has(normalized)) return path;
    const nested = dangerousPath(child, path);
    if (nested) return nested;
  }

  return null;
}

function cleanStringArray(value, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter(Boolean).slice(0, maxItems);
}

function cleanEntities(value) {
  if (!isPlainObject(value)) return {};
  return {
    nombre_cliente: cleanString(value.nombre_cliente),
    nombre_negocio: cleanString(value.nombre_negocio),
    cantidad: cleanNullableNumber(value.cantidad),
    presupuesto: cleanNullableNumber(value.presupuesto),
    producto_o_servicio_referenciado: cleanString(value.producto_o_servicio_referenciado),
    opcion_numerada: cleanPositiveInteger(value.opcion_numerada)
  };
}

function cleanParameters(parameters, toolName, ignoredFields) {
  if (!isPlainObject(parameters)) return {};
  const allowed = PARAMS_BY_TOOL[toolName] ?? new Set();
  const entries = [];

  for (const [key, value] of Object.entries(parameters)) {
    if (!allowed.has(key) || !PARAMETER_CLEANERS[key]) {
      ignoredFields.push(`parametros.${key}`);
      continue;
    }

    const clean = PARAMETER_CLEANERS[key](value);
    if (clean !== null && clean !== undefined && clean !== '') entries.push([key, clean]);
  }

  return Object.fromEntries(entries);
}

export function expectedToolForIntent(intent) {
  return TOOL_BY_INTENT[intent] ?? '';
}

export function sanitizeRawInterpretation(payload) {
  if (!isPlainObject(payload)) return {};
  const clone = JSON.parse(JSON.stringify(payload));

  function redact(value) {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      const normalized = key.toLowerCase();
      if (DANGEROUS_KEYS.has(normalized) || /secret|authorization|api.?key|password|token/i.test(key)) {
        value[key] = '[REDACTED]';
      } else {
        redact(value[key]);
      }
    }
  }

  redact(clone);
  return clone;
}

export function validateIntentDetailed(payload, { confidenceThreshold = 0.45 } = {}) {
  const ignoredFields = [];
  const securityPath = dangerousPath(payload);

  if (securityPath) {
    return {
      interpretation: { ...FALLBACK_INTENT },
      ignoredFields,
      fallbackReason: `dangerous_field:${securityPath}`,
      securityAlert: true
    };
  }

  if (!isPlainObject(payload)) {
    return { interpretation: { ...FALLBACK_INTENT }, ignoredFields, fallbackReason: 'invalid_json_object', securityAlert: false };
  }

  const intention = String(payload.intencion ?? '').trim().toUpperCase();
  if (!ALLOWED_INTENTS.includes(intention)) {
    return { interpretation: { ...FALLBACK_INTENT }, ignoredFields, fallbackReason: 'intent_not_allowed', securityAlert: false };
  }

  const expectedTool = expectedToolForIntent(intention);
  const providedTool = String(payload.herramienta_mcp ?? '').trim();
  if (!REGISTERED_TOOLS.has(expectedTool) && expectedTool !== '') {
    return { interpretation: { ...FALLBACK_INTENT }, ignoredFields, fallbackReason: 'expected_tool_not_registered', securityAlert: false };
  }
  if (providedTool && (!REGISTERED_TOOLS.has(providedTool) || providedTool !== expectedTool)) {
    return { interpretation: { ...FALLBACK_INTENT }, ignoredFields, fallbackReason: 'tool_intent_mismatch', securityAlert: false };
  }

  const confidence = clampConfidence(payload.confianza);
  if (confidence < confidenceThreshold && !['SALUDO', 'AGRADECIMIENTO', 'DESPEDIDA'].includes(intention)) {
    return { interpretation: { ...FALLBACK_INTENT }, ignoredFields, fallbackReason: 'low_confidence', securityAlert: false };
  }

  const knownTopLevel = new Set([
    'intencion', 'herramienta_mcp', 'parametros', 'resumen_cliente', 'necesidades',
    'entidades', 'sentimiento', 'prioridad', 'requiere_asesor', 'respuesta_sugerida',
    'confianza', 'requiere_respuesta_ia'
  ]);
  for (const key of Object.keys(payload)) {
    if (!knownTopLevel.has(key)) ignoredFields.push(key);
  }

  return {
    interpretation: {
      intencion: intention,
      herramienta_mcp: expectedTool,
      parametros: cleanParameters(payload.parametros, expectedTool, ignoredFields),
      resumen_cliente: cleanString(payload.resumen_cliente),
      necesidades: cleanStringArray(payload.necesidades),
      entidades: cleanEntities(payload.entidades),
      sentimiento: cleanString(payload.sentimiento),
      prioridad: cleanString(payload.prioridad),
      requiere_asesor: payload.requiere_asesor === true,
      respuesta_sugerida: cleanString(payload.respuesta_sugerida),
      confianza: confidence,
      requiere_respuesta_ia: payload.requiere_respuesta_ia === true
    },
    ignoredFields,
    fallbackReason: null,
    securityAlert: false
  };
}

export function validateIntentJson(payload) {
  const result = validateIntentDetailed(payload, { confidenceThreshold: 0 });
  if (result.fallbackReason) return { ...FALLBACK_INTENT, parametros: {} };

  const {
    resumen_cliente: _summary,
    necesidades: _needs,
    entidades: _entities,
    sentimiento: _sentiment,
    prioridad: _priority,
    requiere_asesor: _advisor,
    respuesta_sugerida: _suggested,
    ...legacy
  } = result.interpretation;
  return legacy;
}
