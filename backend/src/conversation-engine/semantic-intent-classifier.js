import { env } from '../config/env.js';
import { getOpenAIClient } from '../ai/intentInterpreter.js';
import {
  recordOpenAIError,
  recordOpenAISuccess
} from '../ai/openai-health.service.js';
import { logger } from '../utils/logger.js';
import { normalizeForNcie } from './message-normalizer.js';

const SEMANTIC_INTENTS = Object.freeze([
  'SHOW_CATALOG',
  'REQUEST_RECOMMENDATION',
  'ASK_PRICE',
  'ASK_ADVISOR',
  'PROVIDE_BUSINESS_TYPE',
  'PROVIDE_BUSINESS_GOAL',
  'CONFIRM_DIMENSIONS_UNIT',
  'CONTINUE_ACTIVE_FLOW',
  'ANSWER_LAST_QUESTION',
  'DECLINE_ACTIVE_FLOW',
  'ASK_FOR_RECOMMENDATION',
  'CONFIRM_BUDGET',
  'CONFIRM_QUANTITY',
  'UNKNOWN'
]);

const CONTEXTUAL_STATES = new Set([
  'CONFIRM_DIMENSIONS',
  'ESPERANDO_PRESUPUESTO',
  'ESPERANDO_CANTIDAD',
  'RESUMEN',
  'ASESOR',
  'FINALIZADO'
]);

const GENERIC_RESPONSE_PATTERNS = [
  /\bque producto servicio o categoria tienes en mente\b/,
  /\bme ayudas con un poco mas de detalle\b/,
  /\bno entendi bien\b/,
  /\bno entendi\b/
];

const FORBIDDEN_KEYS = new Set([
  'respuesta_sugerida',
  'herramienta_mcp',
  'mcpPlan',
  'selectedService',
  'nextState',
  'responseText',
  'handoffPlan',
  'persistencePlan'
]);

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  minConfidence: 0.85,
  maxTokens: 250,
  temperature: 0,
  timeoutMs: 4000,
  cacheTTL: 3600
});

const cache = new Map();

function flag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'si'].includes(String(value).trim().toLowerCase());
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function semanticIntentConfig(overrides = {}) {
  return {
    enabled: flag(process.env.SEMANTIC_INTENT_ENABLED, overrides.enabled ?? DEFAULT_CONFIG.enabled),
    minConfidence: numberValue(process.env.SEMANTIC_INTENT_MIN_CONFIDENCE, overrides.minConfidence ?? DEFAULT_CONFIG.minConfidence),
    maxTokens: numberValue(process.env.SEMANTIC_INTENT_MAX_TOKENS, overrides.maxTokens ?? DEFAULT_CONFIG.maxTokens),
    temperature: numberValue(process.env.SEMANTIC_INTENT_TEMPERATURE, overrides.temperature ?? DEFAULT_CONFIG.temperature),
    timeoutMs: numberValue(process.env.SEMANTIC_INTENT_TIMEOUT_MS, overrides.timeoutMs ?? DEFAULT_CONFIG.timeoutMs),
    cacheTTL: numberValue(process.env.SEMANTIC_INTENT_CACHE_TTL, overrides.cacheTTL ?? DEFAULT_CONFIG.cacheTTL)
  };
}

function messageText(message = {}) {
  return String(message?.normalized ?? message?.raw ?? message?.original ?? message ?? '').trim();
}

function cacheKey({ empresaId, message, conversationSnapshot = null }) {
  const normalized = normalizeForNcie(messageText(message));
  const state = conversationSnapshot?.state ?? {};
  const locale = conversationSnapshot?.companyConfig?.locale
    ?? conversationSnapshot?.companyConfig?.idioma
    ?? conversationSnapshot?.companyConfig?.language
    ?? 'es-MX';
  const businessType = conversationSnapshot?.activeMemory?.businessType
    ?? conversationSnapshot?.state?.collectedEntities?.businessType
    ?? '';
  const selectedService = state?.selectedService?.nombre
    ?? state?.activeFlow?.selectedService?.nombre
    ?? state?.activeFlow?.selectedServiceName
    ?? '';
  return [
    empresaId,
    locale,
    normalizeForNcie(businessType),
    normalizeForNcie(state?.status ?? ''),
    normalizeForNcie(state?.lastQuestionId ?? state?.lastQuestionText ?? ''),
    normalizeForNcie(selectedService),
    normalized
  ].join('|');
}

function pruneCache(now = Date.now()) {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseJson(content) {
  try {
    const parsed = JSON.parse(String(content ?? '{}'));
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cleanString(value, max = 200) {
  if (value === null || value === undefined || typeof value === 'object') return null;
  const clean = normalizeForNcie(value).replace(/\s+/g, '_');
  return clean ? clean.slice(0, max) : null;
}

function cleanText(value, max = 500) {
  if (value === null || value === undefined || typeof value === 'object') return '';
  return String(value).trim().slice(0, max);
}

function cleanBudget(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'object') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function cleanQuantity(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'object') return null;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function cleanCurrency(value) {
  const normalized = normalizeForNcie(value).toUpperCase();
  return ['MXN', 'USD', 'EUR'].includes(normalized) ? normalized : null;
}

function cleanBoolean(value) {
  return value === true;
}

function hasForbiddenKeys(payload) {
  if (!isObject(payload) && !Array.isArray(payload)) return false;
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (hasForbiddenKeys(value)) return true;
  }
  return false;
}

function sanitizeSemanticResult(payload, { minConfidence }) {
  if (!isObject(payload) || hasForbiddenKeys(payload)) return null;
  const intent = SEMANTIC_INTENTS.includes(String(payload.intent ?? '').trim())
    ? String(payload.intent).trim()
    : 'UNKNOWN';
  const confidence = Math.max(0, Math.min(1, Number(payload.confidence ?? 0) || 0));
  const entities = isObject(payload.entities) ? payload.entities : {};
  const result = {
    intent,
    confidence,
    entities: {
      businessType: cleanString(entities.businessType),
      businessGoal: cleanString(entities.businessGoal),
      budget: cleanBudget(entities.budget),
      quantity: cleanQuantity(entities.quantity),
      dimensionsUnit: cleanString(entities.dimensionsUnit, 40),
      currency: cleanCurrency(entities.currency),
      catalogRequest: cleanBoolean(entities.catalogRequest),
      advisorRequest: cleanBoolean(entities.advisorRequest)
    },
    explanation: cleanText(payload.explanation)
  };
  if (result.confidence < minConfidence || result.intent === 'UNKNOWN') {
    return { ...result, lowConfidence: true };
  }
  return result;
}

function promptFor({ message, conversationSnapshot }) {
  const context = {
    currentState: conversationSnapshot?.state?.status ?? null,
    selectedService: conversationSnapshot?.state?.selectedService?.nombre ?? null,
    activeBusinessType: conversationSnapshot?.state?.collectedEntities?.businessType
      ?? conversationSnapshot?.activeMemory?.businessType
      ?? null,
    activeBusinessGoal: conversationSnapshot?.state?.collectedEntities?.businessGoal
      ?? conversationSnapshot?.activeMemory?.businessGoal
      ?? null,
    catalogSummary: conversationSnapshot?.catalogSummary ?? null
  };
  return [
    'Clasifica semanticamente el mensaje de un cliente de WhatsApp para ayudar a un planner deterministico.',
    'No respondas al cliente. No elijas servicio final. No decidas estado, handoff, persistencia, herramientas ni texto de respuesta.',
    'Devuelve solo JSON valido con el schema indicado.',
    '',
    'Intents permitidos:',
    SEMANTIC_INTENTS.join(', '),
    '',
    'Criterios:',
    '- SHOW_CATALOG: pide ver servicios, catalogo, opciones, que manejan u ofrecen.',
    '- REQUEST_RECOMMENDATION: pide recomendacion, orientacion, no sabe que necesita, quiere promocionarse.',
    '- ASK_PRICE: pregunta precio/costo/presupuesto sin suficiente contexto.',
    '- ASK_ADVISOR: pide asesor/persona/humano.',
    '- PROVIDE_BUSINESS_TYPE: informa giro como cafeteria, restaurante, tienda, dentista.',
    '- PROVIDE_BUSINESS_GOAL: informa objetivo como atraer clientes, vender mas, promocionarse.',
    '- CONFIRM_DIMENSIONS_UNIT: contesta si medidas previas eran metros o centimetros.',
    '- CONTINUE_ACTIVE_FLOW: quiere seguir o retomar el flujo activo.',
    '- ANSWER_LAST_QUESTION: respuesta corta que probablemente contesta la ultima pregunta del bot.',
    '- DECLINE_ACTIVE_FLOW: rechaza seguir, lo deja o pide cerrar el flujo activo.',
    '- ASK_FOR_RECOMMENDATION: pregunta que sigue, que falta o que mas necesita.',
    '- CONFIRM_BUDGET: aclara que el dato previo o actual es presupuesto.',
    '- CONFIRM_QUANTITY: aclara que el dato previo o actual es cantidad.',
    '- UNKNOWN: insuficiente o conversacional simple.',
    '',
    'Schema obligatorio:',
    '{"intent":"SHOW_CATALOG | REQUEST_RECOMMENDATION | ASK_PRICE | ASK_ADVISOR | PROVIDE_BUSINESS_TYPE | PROVIDE_BUSINESS_GOAL | CONFIRM_DIMENSIONS_UNIT | CONTINUE_ACTIVE_FLOW | ANSWER_LAST_QUESTION | DECLINE_ACTIVE_FLOW | ASK_FOR_RECOMMENDATION | CONFIRM_BUDGET | CONFIRM_QUANTITY | UNKNOWN","confidence":0.0,"entities":{"businessType":null,"businessGoal":null,"budget":null,"quantity":null,"dimensionsUnit":null,"currency":null,"catalogRequest":false,"advisorRequest":false},"explanation":""}',
    '',
    'Campos prohibidos: respuesta_sugerida, herramienta_mcp, mcpPlan, selectedService, nextState, responseText, handoffPlan, persistencePlan.',
    `Contexto simple: ${JSON.stringify(context)}`,
    `Mensaje: ${messageText(message)}`
  ].join('\n');
}

function responsePlanText(responsePlan = null) {
  if (!responsePlan || typeof responsePlan !== 'object') return '';
  return normalizeForNcie([
    responsePlan.question,
    responsePlan.summary,
    responsePlan.text,
    responsePlan.message,
    responsePlan.type
  ].filter(Boolean).join(' '));
}

function hasGenericResponse(responsePlan = null) {
  const text = responsePlanText(responsePlan);
  return GENERIC_RESPONSE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasEntity(entities, name) {
  return Boolean(entities?.entities?.[name] ?? entities?.[name]);
}

function entityNames(entities = {}) {
  return Object.keys(entities?.entities ?? entities ?? {});
}

function entityCount(entities = {}) {
  return entityNames(entities).length;
}

function activeService(state = {}) {
  return state?.selectedService ?? state?.activeFlow?.selectedService ?? null;
}

function planLostActiveService({ initialPlan = null, currentState = null, conversationSnapshot = null }) {
  const state = currentState && typeof currentState === 'object'
    ? currentState
    : conversationSnapshot?.state ?? {};
  const selected = activeService(state);
  if (!selected) return false;
  if (initialPlan?.selectedService) return false;
  return initialPlan?.nextState === 'INIT'
    || initialPlan?.stateAfter?.status === 'INIT'
    || initialPlan?.stateAfter?.selectedService === null;
}

function shortReplyLikelyAnswersLastQuestion({ message, lastBotQuestion, currentState }) {
  const text = normalizeForNcie(messageText(message));
  if (!text) return false;
  const tokenCount = text.split(/\s+/).filter(Boolean).length;
  const question = normalizeForNcie(lastBotQuestion ?? currentState?.lastQuestionText ?? currentState?.lastQuestionId ?? '');
  if (tokenCount <= 4 && question) return true;
  if (CONTEXTUAL_STATES.has(currentState?.status) && tokenCount <= 6) return true;
  return /\b(metro|metros|centimetro|centimetros|cm|seguimos|continuemos|sigamos|por favor|presupuesto|cantidad|piezas|que sigue|que mas|lo dejamos|retomamos|eso)\b/.test(text);
}

function hasConversationalIntent(message) {
  const text = normalizeForNcie(messageText(message));
  if (!text) return false;
  return /\b(metro|metros|centimetro|centimetros|cm|seguimos|continuemos|sigamos|por favor|es (mi )?presupuesto|presupuesto|es la cantidad|cantidad de piezas|que sigue|que mas necesito|que me falta|lo dejamos|retomamos|eso)\b/.test(text);
}

function contextlessAcknowledgement({ entities, currentState }) {
  const names = entityNames(entities);
  const hasOnlyAckEntity = names.length > 0 && names.every((name) => ['confirmation', 'neutralMessage'].includes(name));
  return Boolean(
    hasOnlyAckEntity
    && (!currentState || currentState.status === 'INIT')
    && !activeService(currentState)
    && !currentState?.lastQuestionText
  );
}

function contextlessStandaloneQuoteEntity({ entities, currentState }) {
  const names = entityNames(entities);
  const hasQuoteEntity = names.some((name) => ['budget', 'quantity', 'dimensions', 'ambiguousNumber'].includes(name));
  return Boolean(
    hasQuoteEntity
    && (!currentState || currentState.status === 'INIT')
    && !activeService(currentState)
    && !currentState?.lastQuestionText
  );
}

export function shouldUseSemanticClassifier({
  message,
  entities,
  initialPlan,
  conversationSnapshot,
  lastBotQuestion = null,
  currentState = null,
  config = { enabled: true }
} = {}) {
  if (!config?.enabled || !initialPlan) return false;
  const state = currentState && typeof currentState === 'object'
    ? currentState
    : conversationSnapshot?.state ?? {};
  if (initialPlan.intent !== 'CLARIFY') return false;
  if (initialPlan.reason === 'repeated_info_reference_with_active_service') return false;
  if (contextlessAcknowledgement({ entities, currentState: state })) return false;
  if (contextlessStandaloneQuoteEntity({ entities, currentState: state })) return false;
  if (initialPlan.reason === 'no_planner_rule_matched') return true;
  if (hasGenericResponse(initialPlan.responsePlan)) return true;
  if (
    CONTEXTUAL_STATES.has(state?.status)
    && shortReplyLikelyAnswersLastQuestion({ message, lastBotQuestion, currentState: state })
    && !hasEntity(entities, 'budget')
    && !hasEntity(entities, 'quantity')
    && !hasEntity(entities, 'dimensions')
  ) {
    return true;
  }
  if (planLostActiveService({ initialPlan, currentState: state, conversationSnapshot }) && !hasEntity(entities, 'service')) return true;
  if (hasConversationalIntent(message) && entityCount(entities) <= 2) return true;
  return false;
}

function timeoutPromise(timeoutMs) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error('semantic_classifier_timeout');
      error.code = 'SEMANTIC_CLASSIFIER_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
}

function log(name, payload) {
  logger.info(name, payload);
}

export function resetSemanticIntentClassifierCacheForTests() {
  cache.clear();
}

export async function classifySemanticIntent({
  empresaId,
  message,
  conversationSnapshot = null,
  client = getOpenAIClient(),
  config = semanticIntentConfig()
} = {}) {
  const startedAt = Date.now();
  const normalizedMessage = normalizeForNcie(messageText(message));
  if (!config.enabled || !empresaId || !normalizedMessage || !client) {
    return { used: false, reason: !client ? 'openai_not_configured' : 'disabled_or_missing_input' };
  }

  const key = cacheKey({ empresaId, message, conversationSnapshot });
  const now = Date.now();
  pruneCache(now);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    log('semantic_classifier_cache_hit', { empresaId, cacheKey: key, intent: cached.result.intent });
    return { ...cached.result, cacheHit: true };
  }

  log('semantic_classifier_called', { empresaId });
  log('semantic_classifier_request', {
    empresaId,
    userMessage: normalizedMessage,
    state: conversationSnapshot?.state?.status ?? null
  });

  try {
    const completion = await Promise.race([
      client.chat.completions.create({
        model: env.openai.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Eres un clasificador JSON estricto. No respondes al cliente y no tomas decisiones del planner.'
          },
          {
            role: 'user',
            content: promptFor({ message, conversationSnapshot })
          }
        ]
      }),
      timeoutPromise(config.timeoutMs)
    ]);
    recordOpenAISuccess();
    const raw = parseJson(completion.choices?.[0]?.message?.content ?? '{}');
    log('semantic_classifier_response', { empresaId, raw });
    const result = sanitizeSemanticResult(raw, { minConfidence: config.minConfidence });
    if (!result) {
      log('semantic_classifier_error', { empresaId, reason: 'invalid_or_forbidden_payload' });
      return { used: false, reason: 'invalid_or_forbidden_payload' };
    }
    if (result.lowConfidence) {
      log('semantic_classifier_low_confidence', {
        empresaId,
        intent: result.intent,
        confidence: result.confidence
      });
      return { ...result, used: false, reason: 'low_confidence' };
    }
    log('semantic_classifier_success', {
      empresaId,
      intent: result.intent,
      confidence: result.confidence,
      latencyMs: Date.now() - startedAt,
      usage: completion.usage ?? null
    });
    cache.set(key, {
      result,
      expiresAt: now + (Math.max(0, Number(config.cacheTTL) || 0) * 1000)
    });
    return result;
  } catch (error) {
    recordOpenAIError(error);
    const event = error?.code === 'SEMANTIC_CLASSIFIER_TIMEOUT'
      ? 'semantic_classifier_timeout'
      : 'semantic_classifier_error';
    logger[event === 'semantic_classifier_error' ? 'error' : 'warn'](event, {
      empresaId,
      error: {
        name: error?.name,
        message: error?.message,
        code: error?.code
      }
    });
    return { used: false, reason: event };
  }
}
