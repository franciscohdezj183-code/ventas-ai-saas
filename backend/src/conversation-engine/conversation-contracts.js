import { normalizeForNcie } from './message-normalizer.js';

export const CONVERSATION_STATES = Object.freeze({
  INIT: 'INIT',
  CATALOGO: 'CATALOGO',
  SERVICIO: 'SERVICIO',
  COTIZANDO: 'COTIZANDO',
  CONFIRM_DIMENSIONS: 'CONFIRM_DIMENSIONS',
  ESPERANDO_MEDIDAS: 'ESPERANDO_MEDIDAS',
  ESPERANDO_CANTIDAD: 'ESPERANDO_CANTIDAD',
  ESPERANDO_PRESUPUESTO: 'ESPERANDO_PRESUPUESTO',
  ESPERANDO_DISENO: 'ESPERANDO_DISENO',
  ESPERANDO_INSTALACION: 'ESPERANDO_INSTALACION',
  RESUMEN: 'RESUMEN',
  ASESOR: 'ASESOR',
  FINALIZADO: 'FINALIZADO'
});

export const ENTITY_NAMES = Object.freeze({
  QUANTITY: 'quantity',
  DIMENSIONS: 'dimensions',
  BUDGET: 'budget',
  SERVICE: 'service',
  CATEGORY: 'category',
  DESIGN: 'design',
  INSTALLATION: 'installation',
  BUSINESS_TYPE: 'businessType',
  OBJECTIVE: 'objective',
  LOCATION: 'location',
  PRIORITY: 'priority',
  ADVISOR_REQUEST: 'advisorRequest',
  CATALOG_REQUEST: 'catalogRequest',
  RECOMMENDATION_REQUEST: 'recommendationRequest',
  PRICE_REQUEST: 'priceRequest',
  CURRENCY: 'currency',
  CONFIRMATION: 'confirmation',
  CONTINUE_REQUEST: 'continueRequest',
  REPEATED_INFO_REFERENCE: 'repeatedInfoReference',
  NEUTRAL_MESSAGE: 'neutralMessage',
  AMBIGUOUS_NUMBER: 'ambiguousNumber'
});

export const PLANNER_INTENTS = Object.freeze({
  ANSWER_PREVIOUS_QUESTION: 'ANSWER_PREVIOUS_QUESTION',
  TOPIC_SWITCH: 'TOPIC_SWITCH',
  SHOW_CATALOG: 'SHOW_CATALOG',
  SHOW_CATEGORY: 'SHOW_CATEGORY',
  START_SERVICE_QUOTE: 'START_SERVICE_QUOTE',
  CONFIRM_DIMENSIONS: 'CONFIRM_DIMENSIONS',
  HANDOFF: 'HANDOFF',
  RECOMMENDATION: 'RECOMMENDATION',
  CLARIFY: 'CLARIFY',
  NEUTRAL: 'NEUTRAL'
});

export const EXECUTION_ACTIONS = Object.freeze({
  NONE: 'none',
  RETRIEVE: 'retrieve',
  CALL_MCP: 'call_mcp',
  RENDER_RESPONSE: 'render_response',
  PERSIST_STATE: 'persist_state',
  CREATE_HANDOFF: 'create_handoff',
  CREATE_LEAD: 'create_lead'
});

export function createEntity({
  name,
  value,
  confidence,
  source = 'entity-extractor',
  evidence = null,
  metadata = {}
}) {
  if (!Object.values(ENTITY_NAMES).includes(name)) {
    throw new Error(`Unknown entity name: ${name}`);
  }
  const numericConfidence = Number(confidence);
  if (!Number.isFinite(numericConfidence) || numericConfidence < 0 || numericConfidence > 1) {
    throw new Error(`Invalid confidence for entity ${name}`);
  }
  return {
    name,
    value,
    confidence: numericConfidence,
    source,
    evidence,
    metadata
  };
}

export function createEntityExtractionResult({
  message,
  entities = {},
  candidates = {},
  confidence = null,
  warnings = []
}) {
  for (const [key, entity] of Object.entries(entities)) {
    if (!entity || entity.name !== key) {
      throw new Error(`EntityExtractionResult entity key mismatch: ${key}`);
    }
  }
  return {
    schema: 'EntityExtractionResult',
    version: 1,
    message,
    entities,
    candidates,
    confidence: confidence ?? aggregateConfidence(entities),
    warnings
  };
}

export function createConversationState({
  status = CONVERSATION_STATES.INIT,
  activeFlow = null,
  selectedService = null,
  selectedCategory = null,
  collectedEntities = {},
  lastQuestionId = null,
  lastQuestionText = null,
  lastQuestionType = null,
  lastOptionsShown = [],
  questionHistory = [],
  history = []
} = {}) {
  if (!Object.values(CONVERSATION_STATES).includes(status)) {
    throw new Error(`Invalid conversation state: ${status}`);
  }
  return {
    schema: 'ConversationState',
    version: 1,
    status,
    activeFlow,
    selectedService,
    selectedCategory,
    collectedEntities,
    lastQuestionId,
    lastQuestionText,
    lastQuestionType,
    lastOptionsShown,
    questionHistory,
    history
  };
}

export function createConversationSnapshot({
  empresaId,
  conversationId,
  state = createConversationState(),
  activeMemory = {},
  companyConfig = null,
  catalogSummary = null
}) {
  return {
    schema: 'ConversationSnapshot',
    version: 1,
    empresaId,
    conversationId,
    state,
    activeMemory: {
      lastServiceConsulted: activeMemory.lastServiceConsulted ?? null,
      lastObjective: activeMemory.lastObjective ?? null,
      lastBudget: activeMemory.lastBudget ?? activeMemory.lastBudgetMentioned ?? null,
      lastSummary: activeMemory.lastSummary ?? activeMemory.lastSummarySent ?? null,
      preferences: activeMemory.preferences ?? {},
      history: activeMemory.history ?? []
    },
    companyConfig,
    catalogSummary
  };
}

export function createPlannerDecision({
  intent,
  confidence,
  reason,
  entities,
  stateBefore,
  stateAfter,
  selectedService = null,
  selectedCategory = null,
  nextState = stateAfter?.status ?? null
}) {
  if (!Object.values(PLANNER_INTENTS).includes(intent)) {
    throw new Error(`Invalid planner intent: ${intent}`);
  }
  if (!Object.values(CONVERSATION_STATES).includes(nextState)) {
    throw new Error(`Invalid planner nextState: ${nextState}`);
  }
  return {
    schema: 'PlannerDecision',
    version: 1,
    intent,
    confidence,
    reason,
    entities,
    stateBefore,
    stateAfter,
    nextState,
    selectedService,
    selectedCategory
  };
}

export function createExecutionPlan({
  decisionId,
  decision,
  retrievalPlan = { needed: false, queries: [] },
  mcpPlan = { needed: false, tools: [] },
  responsePlan,
  persistencePlan,
  handoffPlan = { needed: false },
  actions = []
}) {
  for (const action of actions) {
    if (!Object.values(EXECUTION_ACTIONS).includes(action)) {
      throw new Error(`Invalid execution action: ${action}`);
    }
  }
  return {
    schema: 'ExecutionPlan',
    version: 1,
    decisionId,
    decision,
    intent: decision.intent,
    confidence: decision.confidence,
    reason: decision.reason,
    stateBefore: decision.stateBefore,
    stateAfter: decision.stateAfter,
    nextState: decision.nextState,
    entities: decision.entities,
    selectedService: decision.selectedService,
    selectedCategory: decision.selectedCategory,
    retrievalPlan,
    mcpPlan,
    responsePlan,
    persistencePlan,
    handoffPlan,
    actions
  };
}

export function resolveQuestionPlan({ state, questionId, text, variants = [] }) {
  const normalizedText = normalizeForNcie(text);
  const normalizedLastText = normalizeForNcie(state?.lastQuestionText);
  const normalizedVariants = variants.map((variant) => normalizeForNcie(variant));
  const repeatedById = questionId && state?.lastQuestionId === questionId;
  const repeatedByText = normalizedText && (
    normalizedLastText === normalizedText ||
    normalizedVariants.includes(normalizedLastText)
  );
  if (!repeatedById && !repeatedByText) {
    return { questionId, text, repeated: false };
  }
  const options = [text, ...variants];
  const alternate = options.find((variant) => normalizeForNcie(variant) !== normalizedLastText);
  return {
    questionId,
    text: alternate ?? text,
    repeated: true
  };
}

function aggregateConfidence(entities) {
  const values = Object.values(entities).map((entity) => Number(entity?.confidence)).filter(Number.isFinite);
  if (values.length === 0) return 0;
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(4));
}
