import {
  CONVERSATION_STATES,
  ENTITY_NAMES,
  EXECUTION_ACTIONS,
  PLANNER_INTENTS,
  createEntity,
  createConversationState,
  createExecutionPlan,
  createPlannerDecision,
  resolveQuestionPlan
} from './conversation-contracts.js';
import { normalizeForNcie } from './message-normalizer.js';

function entity(entities, name) {
  return entities?.entities?.[name] ?? entities?.[name] ?? null;
}

function entityValue(entities, name) {
  return entity(entities, name)?.value ?? null;
}

function entityConfidence(entities, name, fallback = 0.9) {
  return entity(entities, name)?.confidence ?? fallback;
}

function withEntity(entities, name, value, {
  confidence = 0.86,
  evidence = null,
  metadata = {}
} = {}) {
  if (entity(entities, name)) return entities;
  return {
    ...entities,
    entities: {
      ...(entities?.entities ?? {}),
      [name]: createEntity({
        name,
        value,
        confidence,
        source: 'semantic-intent-classifier',
        evidence,
        metadata
      })
    }
  };
}

function semanticEntityMetadata(semanticHints) {
  return {
    semanticIntent: semanticHints?.intent ?? null,
    explanation: semanticHints?.explanation ?? null
  };
}

function applySemanticHints(entities, semanticHints = null, stateBefore = null) {
  if (!semanticHints || typeof semanticHints !== 'object') return entities;
  const confidence = Math.max(0, Math.min(1, Number(semanticHints.confidence ?? 0.86) || 0.86));
  const metadata = semanticEntityMetadata(semanticHints);
  const values = semanticHints.entities ?? {};
  let next = entities;

  if (semanticHints.intent === 'SHOW_CATALOG' || values.catalogRequest === true) {
    next = withEntity(next, ENTITY_NAMES.CATALOG_REQUEST, true, { confidence, evidence: semanticHints.intent, metadata });
  }
  if (semanticHints.intent === 'REQUEST_RECOMMENDATION' || semanticHints.intent === 'ASK_FOR_RECOMMENDATION') {
    next = withEntity(next, ENTITY_NAMES.RECOMMENDATION_REQUEST, true, { confidence, evidence: semanticHints.intent, metadata });
  }
  if (semanticHints.intent === 'ASK_PRICE') {
    next = withEntity(next, ENTITY_NAMES.PRICE_REQUEST, true, { confidence, evidence: semanticHints.intent, metadata });
  }
  if (semanticHints.intent === 'ASK_ADVISOR' || values.advisorRequest === true) {
    next = withEntity(next, ENTITY_NAMES.ADVISOR_REQUEST, true, { confidence, evidence: semanticHints.intent, metadata });
  }
  if (values.businessType) {
    next = withEntity(next, ENTITY_NAMES.BUSINESS_TYPE, values.businessType, { confidence, evidence: values.businessType, metadata });
  }
  if (values.businessGoal) {
    next = withEntity(next, ENTITY_NAMES.OBJECTIVE, values.businessGoal, { confidence, evidence: values.businessGoal, metadata });
  }
  if (values.budget) {
    next = withEntity(next, ENTITY_NAMES.BUDGET, values.budget, { confidence, evidence: String(values.budget), metadata });
  }
  if (values.quantity) {
    next = withEntity(next, ENTITY_NAMES.QUANTITY, values.quantity, { confidence, evidence: String(values.quantity), metadata });
  }
  if (semanticHints.intent === 'CONTINUE_ACTIVE_FLOW' || semanticHints.intent === 'ANSWER_LAST_QUESTION') {
    next = withEntity(next, ENTITY_NAMES.CONTINUE_REQUEST, true, { confidence, evidence: semanticHints.intent, metadata });
  }
  if (semanticHints.intent === 'DECLINE_ACTIVE_FLOW') {
    next = withEntity(next, ENTITY_NAMES.CONFIRMATION, false, { confidence, evidence: semanticHints.intent, metadata });
  }
  if (semanticHints.intent === 'CONFIRM_QUANTITY') {
    const previousAmbiguous = currentCollected(stateBefore).ambiguousNumber;
    if (previousAmbiguous && !entity(next, ENTITY_NAMES.QUANTITY)) {
      next = withEntity(next, ENTITY_NAMES.QUANTITY, previousAmbiguous, { confidence, evidence: semanticHints.intent, metadata: { ...metadata, promotedFromPreviousAmbiguousNumber: true } });
    }
  }
  if (semanticHints.intent === 'CONFIRM_BUDGET') {
    const previousAmbiguous = currentCollected(stateBefore).ambiguousNumber;
    if (previousAmbiguous && !entity(next, ENTITY_NAMES.BUDGET)) {
      next = withEntity(next, ENTITY_NAMES.BUDGET, previousAmbiguous, { confidence, evidence: semanticHints.intent, metadata: { ...metadata, promotedFromPreviousAmbiguousNumber: true } });
    }
  }
  if (semanticHints.intent === 'CONFIRM_DIMENSIONS_UNIT' && stateBefore?.status === CONVERSATION_STATES.CONFIRM_DIMENSIONS) {
    const dimensions = currentCollected(stateBefore).dimensions;
    if (dimensions && !entity(next, ENTITY_NAMES.DIMENSIONS)) {
      next = withEntity(next, ENTITY_NAMES.DIMENSIONS, {
        ...dimensions,
        unit: values.dimensionsUnit ?? dimensions.unit ?? 'm'
      }, { confidence, evidence: semanticHints.intent, metadata: { ...metadata, unitConfirmed: true } });
    }
  }
  if (values.currency) {
    next = withEntity(next, ENTITY_NAMES.CURRENCY, values.currency, { confidence, evidence: values.currency, metadata });
  }
  return next;
}

function stateFromSnapshot(snapshot) {
  return snapshot?.state ?? createConversationState();
}

function serviceNeedsMeasurements(service = null) {
  const type = normalizeForNcie(service?.tipo_precio);
  const unit = normalizeForNcie(service?.unidad_medida);
  return Boolean(service?.requiere_medidas) || type === 'por_m2' || unit === 'm2';
}

function serviceNeedsQuantity(service = null) {
  const name = normalizeName(`${service?.nombre ?? ''} ${service?.categoria ?? ''}`);
  return Boolean(service?.requiere_cantidad) || /\bpromocionales?\b/.test(name);
}

function serviceNeedsBudget(service = null) {
  return normalizeForNcie(service?.tipo_precio) === 'cotizacion';
}

function serviceNeedsDetailBeforeBudget(service = null) {
  const name = normalizeName(`${service?.nombre ?? ''} ${service?.categoria ?? ''}`);
  return /\bpromocionales?\b/.test(name);
}

function normalizeName(value) {
  return normalizeForNcie(value ?? '');
}

function catalogServices(catalogHints = {}) {
  return catalogHints.services ?? catalogHints.catalog?.services ?? [];
}

function catalogCategories(catalogHints = {}) {
  return catalogHints.categories ?? catalogHints.catalog?.categories ?? [];
}

function matchServiceByEntity(serviceEntity, catalogHints) {
  const value = normalizeName(serviceEntity?.value);
  if (!value) return null;
  const candidates = catalogServices(catalogHints);
  return candidates.find((service) => {
    const name = normalizeName(service?.nombre);
    return name && (name === value || name.includes(value) || value.includes(name));
  }) ?? { nombre: serviceEntity.value };
}

function matchCategoryByEntity(categoryEntity, catalogHints) {
  const value = normalizeName(categoryEntity?.value);
  if (!value) return null;
  const candidates = catalogCategories(catalogHints);
  const matched = candidates.find((category) => {
    const name = normalizeName(category?.nombre ?? category?.name ?? category);
    return name && (name === value || name.includes(value) || value.includes(name));
  });
  return matched?.nombre ?? matched?.name ?? matched ?? categoryEntity.value;
}

function sameService(left = null, right = null) {
  if (!left || !right) return false;
  if (left.id && right.id) return String(left.id) === String(right.id);
  return normalizeName(left.nombre ?? left.name) === normalizeName(right.nombre ?? right.name);
}

function activeService(state) {
  return state?.selectedService ?? state?.activeFlow?.selectedService ?? null;
}

function messageText(message = {}) {
  return normalizeForNcie(message.normalized ?? message.raw ?? message.original ?? '');
}

function rawMessageText(message = {}) {
  return String(message?.original ?? message?.raw ?? message?.normalized ?? message ?? '').trim();
}

function isTopicSwitch({ state, selectedService }) {
  const current = activeService(state);
  return Boolean(current && selectedService && !sameService(current, selectedService));
}

function nextQuoteStateForService(service, collected = {}) {
  const hasValue = (value) => value !== undefined && value !== null && value !== '';
  if (serviceNeedsQuantity(service) && !hasValue(collected.quantity)) return CONVERSATION_STATES.ESPERANDO_CANTIDAD;
  if (serviceNeedsMeasurements(service) && !hasValue(collected.dimensions)) return CONVERSATION_STATES.ESPERANDO_MEDIDAS;
  if (serviceNeedsDetailBeforeBudget(service) && !hasValue(collected.design)) return CONVERSATION_STATES.ESPERANDO_DISENO;
  if (serviceNeedsMeasurements(service) && !hasValue(collected.design)) return CONVERSATION_STATES.ESPERANDO_DISENO;
  if (serviceNeedsBudget(service) && !hasValue(collected.budget)) return CONVERSATION_STATES.ESPERANDO_PRESUPUESTO;
  return CONVERSATION_STATES.RESUMEN;
}

function questionForState(nextState, service = null, stateBefore = null) {
  if (nextState === CONVERSATION_STATES.ESPERANDO_CANTIDAD) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'quote.quantity',
      text: 'Cuantas piezas necesitas?',
      variants: ['Que cantidad de piezas quieres cotizar?']
    });
  }
  if (nextState === CONVERSATION_STATES.ESPERANDO_MEDIDAS) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'quote.measurements',
      text: 'Me compartes las medidas aproximadas?',
      variants: ['Que alto y ancho aproximado necesitas?']
    });
  }
  if (nextState === CONVERSATION_STATES.ESPERANDO_PRESUPUESTO) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'quote.budget',
      text: 'Con que presupuesto aproximado quieres empezar?',
      variants: ['Que rango de presupuesto tienes contemplado?']
    });
  }
  if (nextState === CONVERSATION_STATES.ESPERANDO_DISENO) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'quote.design',
      text: 'Ya tienes el diseno o quieres que tambien te apoyemos con eso?',
      variants: [
        'El diseno ya lo tienes listo o necesitas apoyo?',
        'Para terminar la cotizacion, el diseno ya lo tienes o necesitas que lo preparemos?'
      ]
    });
  }
  if (nextState === CONVERSATION_STATES.CATALOGO) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'catalog.selection',
      text: 'Cual te gustaria cotizar?',
      variants: ['Que opcion quieres revisar primero?']
    });
  }
  if (nextState === CONVERSATION_STATES.RESUMEN) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'quote.summary',
      text: service?.nombre ? `Tengo listo el resumen para ${service.nombre}. Quieres que lo revise un asesor?` : 'Tengo listo el resumen. Quieres que lo revise un asesor?',
      variants: ['Quieres que pase este resumen con un asesor?']
    });
  }
  return resolveQuestionPlan({
    state: stateBefore,
    questionId: 'clarify.need',
    text: 'Cuentame que quieres lograr y te ayudo a elegir una opcion.',
    variants: ['Que necesitas cotizar o revisar?']
  });
}

function stateWithQuestion(state, question) {
  return {
    ...state,
    lastQuestionId: question?.questionId ?? state.lastQuestionId ?? null,
    lastQuestionText: question?.text ?? state.lastQuestionText ?? null,
    lastQuestionType: question?.questionId ?? state.lastQuestionType ?? null,
    questionHistory: [
      ...(state.questionHistory ?? []),
      ...(question?.questionId ? [question.questionId] : [])
    ].slice(-10)
  };
}

function stateWithOptions(state, options = []) {
  return {
    ...state,
    lastOptionsShown: options
  };
}

function quoteState({ stateBefore, nextState, selectedService, selectedCategory = null, collectedEntities = {}, closePrevious = false, question }) {
  const previousFlow = stateBefore.activeFlow ?? null;
  const flow = {
    id: `flow_service_${selectedService?.id ?? normalizeName(selectedService?.nombre).replace(/\s+/g, '_')}`,
    status: 'active',
    selectedService,
    selectedCategory: selectedCategory ?? selectedService?.categoria ?? null,
    collectedEntities,
    previousFlow: closePrevious && previousFlow ? {
      ...previousFlow,
      status: 'closed',
      closeReason: 'topic_switch'
    } : null
  };
  return stateWithQuestion(createConversationState({
    status: nextState,
    activeFlow: flow,
    selectedService,
    selectedCategory: selectedCategory ?? selectedService?.categoria ?? null,
    collectedEntities,
    history: [
      ...(stateBefore.history ?? []),
      ...(closePrevious && previousFlow ? [{ event: 'flow_closed', reason: 'topic_switch', flow: previousFlow }] : [])
    ]
  }), question);
}

function responsePlanFor({ type, question, selectedService = null, selectedCategory = null, summary = null, data = {} }) {
  return {
    type,
    questionId: question?.questionId ?? null,
    question: question?.text ?? null,
    repeatedQuestion: Boolean(question?.repeated),
    selectedService,
    selectedCategory,
    summary,
    ...data
  };
}

function memoryUpdateFor({ stateAfter, selectedService, entities, responsePlan }) {
  const collected = stateAfter?.collectedEntities ?? {};
  const recommendations = responsePlan?.recommendations ?? [];
  const preferredServices = recommendations
    .map((entry) => entry.service ?? entry)
    .filter(Boolean)
    .slice(0, 3);
  const update = {
    mode: 'useful_only',
    businessType: collected.businessType ?? responsePlan?.businessType ?? entityValue(entities, ENTITY_NAMES.BUSINESS_TYPE) ?? null,
    businessGoal: collected.businessGoal ?? collected.objective ?? responsePlan?.objective ?? entityValue(entities, ENTITY_NAMES.OBJECTIVE) ?? null,
    preferredCategory: responsePlan?.preferredCategory ?? stateAfter?.selectedCategory ?? selectedService?.categoria ?? null,
    preferredServices: preferredServices.length ? preferredServices : (selectedService ?? stateAfter?.selectedService ? [selectedService ?? stateAfter.selectedService] : null),
    budgetRange: collected.budget ?? responsePlan?.budget ?? entityValue(entities, ENTITY_NAMES.BUDGET) ?? null,
    lastRecommendation: responsePlan?.type === 'recommendation_options' ? responsePlan?.summary ?? 'Recomendacion consultiva' : null
  };
  return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== null && value !== undefined));
}

function persistencePlan({ stateAfter, selectedService = null, entities = {}, responsePlan = null }) {
  return {
    saveState: true,
    stateAfter,
    activeMemoryUpdate: memoryUpdateFor({ stateAfter, selectedService, entities, responsePlan })
  };
}

function buildPlan({
  decisionId,
  intent,
  confidence,
  reason,
  entities,
  stateBefore,
  stateAfter,
  selectedService = null,
  selectedCategory = null,
  retrievalPlan = { needed: false, queries: [] },
  mcpPlan = { needed: false, tools: [] },
  responsePlan,
  handoffPlan = { needed: false },
  actions = [EXECUTION_ACTIONS.RENDER_RESPONSE, EXECUTION_ACTIONS.PERSIST_STATE]
}) {
  const decision = createPlannerDecision({
    intent,
    confidence,
    reason,
    entities,
    stateBefore,
    stateAfter,
    selectedService,
    selectedCategory
  });
  return createExecutionPlan({
    decisionId,
    decision,
    retrievalPlan,
    mcpPlan,
    responsePlan,
    persistencePlan: persistencePlan({ stateAfter, selectedService, entities, responsePlan }),
    handoffPlan,
    actions
  });
}

function collectedFromEntities(stateBefore, entities) {
  return {
    ...(stateBefore.collectedEntities ?? {}),
    ...(stateBefore.activeFlow?.collectedEntities ?? {}),
    ...(entityValue(entities, ENTITY_NAMES.BUSINESS_TYPE) ? { businessType: entityValue(entities, ENTITY_NAMES.BUSINESS_TYPE) } : {}),
    ...(entityValue(entities, ENTITY_NAMES.QUANTITY) ? { quantity: entityValue(entities, ENTITY_NAMES.QUANTITY) } : {}),
    ...(entityValue(entities, ENTITY_NAMES.DIMENSIONS) ? { dimensions: entityValue(entities, ENTITY_NAMES.DIMENSIONS) } : {}),
    ...(entityValue(entities, ENTITY_NAMES.BUDGET) ? { budget: entityValue(entities, ENTITY_NAMES.BUDGET) } : {}),
    ...(entityValue(entities, ENTITY_NAMES.CURRENCY) ? { budgetCurrency: entityValue(entities, ENTITY_NAMES.CURRENCY) } : {}),
    ...(entityValue(entities, ENTITY_NAMES.AMBIGUOUS_NUMBER) ? { ambiguousNumber: entityValue(entities, ENTITY_NAMES.AMBIGUOUS_NUMBER) } : {}),
    ...(entity(entities, ENTITY_NAMES.DESIGN) ? { design: entityValue(entities, ENTITY_NAMES.DESIGN) } : {}),
    ...(entity(entities, ENTITY_NAMES.INSTALLATION) ? { installation: entityValue(entities, ENTITY_NAMES.INSTALLATION) } : {}),
    ...(entityValue(entities, ENTITY_NAMES.OBJECTIVE) ? { objective: entityValue(entities, ENTITY_NAMES.OBJECTIVE) } : {}),
    ...(entityValue(entities, ENTITY_NAMES.LOCATION) ? { location: entityValue(entities, ENTITY_NAMES.LOCATION) } : {}),
    ...(entityValue(entities, ENTITY_NAMES.PRIORITY) ? { priority: entityValue(entities, ENTITY_NAMES.PRIORITY) } : {})
  };
}

function moneyText(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function emojiModeFrom(companyConfig = null) {
  const raw = normalizeName(companyConfig?.emojiMode ?? companyConfig?.emoji_mode ?? companyConfig?.ncie?.emojiMode ?? 'professional');
  if (raw === 'none' || raw === 'friendly' || raw === 'professional') return raw;
  return 'professional';
}

const DEFAULT_WELCOME_MESSAGE = 'Hola, gracias por escribirnos. Dime que producto o servicio buscas y te ayudo a revisarlo.';
const PLACEHOLDER_WELCOME_MESSAGES = new Set([
  'hola en que te ayudo',
  'hola en que puedo ayudarte',
  'hola como puedo ayudarte',
  'hola como te puedo ayudar'
]);

function welcomeMessageCandidate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = normalizeName(text).replace(/[?!.]+$/g, '').trim();
  return PLACEHOLDER_WELCOME_MESSAGES.has(normalized) ? null : text;
}

function configuredWelcomeMessage(companyConfig = null) {
  return [
    companyConfig?.response_profile?.saludo_personalizado,
    companyConfig?.greetingMessage,
    companyConfig?.defaultWelcomeMessage,
    companyConfig?.welcomeMessage,
    companyConfig?.mensaje_bienvenida,
    companyConfig?.mensajeBienvenida
  ].map(welcomeMessageCandidate).find(Boolean) ?? null;
}

function excessiveBudgetThreshold(companyConfig = null) {
  const value = Number(
    companyConfig?.budgetConfirmationThreshold
    ?? companyConfig?.maxBudgetWithoutConfirmation
    ?? companyConfig?.ncie?.budgetConfirmationThreshold
    ?? companyConfig?.ncie?.maxBudgetWithoutConfirmation
    ?? 1000000
  );
  return Number.isFinite(value) && value > 0 ? value : 1000000;
}

const DEFAULT_RECOMMENDATION_MATRIX = Object.freeze({
  papeleria: ['lona', 'vinil', 'promocional', 'marketing', 'tarjeta'],
  restaurante: ['menu', 'senal', 'branding', 'pagina web', 'lona', 'vinil'],
  cafeteria: ['vinil', 'lona', 'branding', 'menu'],
  dentista: ['rotulacion', 'imagen corporativa', 'pagina web', 'vinil'],
  veterinaria: ['lona', 'senal', 'branding', 'rotulacion'],
  estetica: ['vinil', 'lona', 'branding', 'tarjeta'],
  abogado: ['tarjeta', 'imagen corporativa', 'pagina web'],
  imprenta: ['promocional', 'lona', 'vinil'],
  ferreteria: ['lona', 'senal', 'vinil'],
  tienda: ['lona', 'vinil', 'promocional', 'tarjeta'],
  boutique: ['branding', 'tarjeta', 'vinil', 'pagina web']
});

function commercialConfig(companyConfig = null) {
  return companyConfig?.commercialIntelligence
    ?? companyConfig?.commercial_intelligence
    ?? companyConfig?.ncie?.commercialIntelligence
    ?? {};
}

function matrixFromCompany(companyConfig = null) {
  return {
    ...DEFAULT_RECOMMENDATION_MATRIX,
    ...(commercialConfig(companyConfig).recommendationMatrix ?? commercialConfig(companyConfig).recommendation_matrix ?? {})
  };
}

function activeMemory(conversationSnapshot = {}) {
  return conversationSnapshot?.activeMemory ?? {};
}

function businessTypeFrom({ entities, conversationSnapshot, companyConfig }) {
  return entityValue(entities, ENTITY_NAMES.BUSINESS_TYPE)
    ?? currentCollected(stateFromSnapshot(conversationSnapshot)).businessType
    ?? activeMemory(conversationSnapshot).businessType
    ?? companyConfig?.customerBusinessType
    ?? null;
}

function businessGoalFrom({ entities, conversationSnapshot }) {
  return entityValue(entities, ENTITY_NAMES.OBJECTIVE)
    ?? currentCollected(stateFromSnapshot(conversationSnapshot)).businessGoal
    ?? currentCollected(stateFromSnapshot(conversationSnapshot)).objective
    ?? activeMemory(conversationSnapshot).businessGoal
    ?? null;
}

function budgetFrom({ entities, conversationSnapshot }) {
  return entityValue(entities, ENTITY_NAMES.BUDGET)
    ?? currentCollected(stateFromSnapshot(conversationSnapshot)).budget
    ?? activeMemory(conversationSnapshot).budgetRange
    ?? null;
}

function serviceEstimate(service, collected = {}) {
  const price = Number(service?.precio);
  if (!Number.isFinite(price) || price <= 0) return null;
  const area = Number(collected.dimensions?.area);
  const quantity = Number(collected.quantity);
  if (serviceNeedsMeasurements(service) && Number.isFinite(area) && area > 0) {
    if (area > 100) return null;
    return price * area;
  }
  const packageQuantity = packageQuantityFor(service);
  if (Number.isFinite(quantity) && quantity > 0 && packageQuantity > 1) {
    return Math.ceil(quantity / packageQuantity) * price;
  }
  if (Number.isFinite(quantity) && quantity > 0) return price * quantity;
  return null;
}

function packageQuantityFor(service = {}) {
  const configured = Number(
    service.packageQuantity
    ?? service.package_quantity
    ?? service.cantidad_paquete
    ?? service.cantidadPaquete
  );
  if (Number.isFinite(configured) && configured > 1) return configured;
  const name = normalizeName(service?.nombre ?? service?.name ?? '');
  const match = name.match(/\b(\d{2,5})\s*(?:pzs|piezas|unidades)\b/);
  return match ? Number(match[1]) : 1;
}

function exaggeratedDimensionsEntity(entities) {
  if (entity(entities, ENTITY_NAMES.DIMENSIONS)?.metadata?.unitConfirmed) return null;
  const dimensions = entityValue(entities, ENTITY_NAMES.DIMENSIONS);
  const area = Number(dimensions?.area);
  return Number.isFinite(area) && area > 100 ? dimensions : null;
}

function dimensionConfirmationText(dimensions) {
  const width = dimensions?.width ?? dimensions?.ancho;
  const height = dimensions?.height ?? dimensions?.alto;
  if (width && height) {
    return `Solo para confirmar, ¿las medidas son ${width} x ${height} metros o quisiste decir centímetros?`;
  }
  return 'Solo para confirmar, ¿esas medidas son en metros o quisiste decir centímetros?';
}

function asksServiceAvailability(message) {
  const text = messageText(message);
  return /\b(manejas|manejan|tienen|ofrecen|venden)\b/.test(text);
}

function isConsultativeNextStepQuestion(message) {
  const text = messageText(message);
  return /\b(que mas necesito|que me falta|que sigue|que mas recomiendas)\b/.test(text);
}

function hasRecentServiceOrHandoff(stateBefore = {}) {
  return Boolean(
    activeService(stateBefore)
    || stateBefore.selectedService
    || stateBefore.activeFlow?.selectedService
    || [CONVERSATION_STATES.RESUMEN, CONVERSATION_STATES.ASESOR].includes(stateBefore.status)
  );
}

function dimensionsText(dimensions = null) {
  if (!dimensions) return null;
  if (dimensions.text) return dimensions.text;
  if (dimensions.width && dimensions.height) return `${dimensions.width}x${dimensions.height}`;
  return null;
}

function yesNoPending(value, yesText, noText) {
  if (value === true) return yesText;
  if (value === false) return noText;
  return 'Pendiente';
}

function quoteSummaryFor({ service, collectedEntities }) {
  const estimate = serviceEstimate(service, collectedEntities);
  const measurementParts = [
    dimensionsText(collectedEntities.dimensions),
    collectedEntities.quantity ? `${collectedEntities.quantity} piezas` : null
  ].filter(Boolean);
  return {
    service: service?.nombre ?? 'Pendiente',
    measurementsOrQuantity: measurementParts.join(' / ') || 'Pendiente',
    budget: moneyText(collectedEntities.budget) ?? 'Pendiente',
    design: yesNoPending(collectedEntities.design, 'Necesita apoyo con diseno', 'Ya tiene diseno'),
    installation: yesNoPending(collectedEntities.installation, 'Revisar instalacion', 'Sin instalacion'),
    estimate: moneyText(estimate) ?? 'Pendiente con asesor',
    nextStep: 'Confirmar detalles con asesor'
  };
}

function serviceKeywords(service = {}) {
  return normalizeName(`${service?.nombre ?? ''} ${service?.descripcion ?? ''} ${service?.categoria ?? ''}`);
}

function serviceMatchesTerms(service, terms = []) {
  const haystack = serviceKeywords(service);
  return terms.some((term) => haystack.includes(normalizeName(term)));
}

function objectiveTerms(objective = '') {
  const normalized = normalizeName(objective);
  if (/\b(atraer|publicidad|promocionar|anunciar|letrero|abrir)\b/.test(normalized)) {
    return ['lona', 'banner', 'vinil', 'rotulacion', 'senal', 'marketing'];
  }
  if (/\b(vender|ventas)\b/.test(normalized)) return ['lona', 'promocional', 'marketing', 'pagina web', 'tarjeta'];
  if (/\b(imagen|marca|branding|presencia)\b/.test(normalized)) return ['logo', 'logotipo', 'identidad', 'branding', 'vinil'];
  if (/\b(imprimir|impresion|cotizar)\b/.test(normalized)) return ['lona', 'vinil', 'tarjeta', 'promocional'];
  if (/\b(automatizar|ahorrar tiempo)\b/.test(normalized)) return ['pagina web', 'web', 'catalogo', 'pedidos'];
  return [];
}

function budgetScore(service, budget) {
  const amount = Number(budget);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const price = Number(service?.precio);
  const name = serviceKeywords(service);
  if (Number.isFinite(price) && price > 0) return price <= amount ? 2 : -4;
  if (amount <= 1500 && /\b(premium|branding|identidad|pagina web|web|marketing)\b/.test(name)) return -3;
  if (amount >= 8000 && /\b(branding|identidad|pagina web|web|marketing)\b/.test(name)) return 2;
  return 0;
}

function recommendationReason({ service, objective, budget, businessType }) {
  const name = normalizeName(service?.nombre);
  const context = businessType ? `Como tienes ${businessType}` : 'Por lo que me cuentas';
  const goal = objective ? ` y buscas ${objective}` : '';
  const budgetText = budget ? ` dentro de un presupuesto cercano a ${moneyText(budget)}` : '';
  if (/\blona|banner\b/.test(name)) return `${context}${goal}, una lona te da visibilidad rapida desde calle${budgetText}.`;
  if (/\bvinil|rotulacion\b/.test(name)) return `${context}${goal}, el vinil o rotulacion convierte fachada, vidrio o vehiculo en publicidad permanente.`;
  if (/\btarjeta|promocional\b/.test(name)) return `${context}${goal}, este material ayuda a que te recuerden y vuelvan a contactarte.`;
  if (/\blogo|logotipo|marca|branding|identidad\b/.test(name)) return `${context}${goal}, primero ordena tu imagen para que lo impreso se vea mas profesional.`;
  if (/\bweb|pagina\b/.test(name)) return `${context}${goal}, una pagina web ayuda a explicar servicios y captar clientes fuera del local.`;
  return `${context}${goal}, esta opcion encaja con tu necesidad y el catalogo disponible.`;
}

function recommendationOptions({ catalogHints, entities, conversationSnapshot, companyConfig }) {
  const objective = businessGoalFrom({ entities, conversationSnapshot });
  const budget = budgetFrom({ entities, conversationSnapshot });
  const businessType = businessTypeFrom({ entities, conversationSnapshot, companyConfig });
  const matrixTerms = matrixFromCompany(companyConfig)[normalizeName(businessType)] ?? [];
  const goalTerms = objectiveTerms(objective);
  const ranked = catalogServices(catalogHints)
    .map((service) => {
      let score = 0;
      if (serviceMatchesTerms(service, matrixTerms)) score += 4;
      if (serviceMatchesTerms(service, goalTerms)) score += 4;
      score += budgetScore(service, budget);
      if (score === 0 && serviceMatchesTerms(service, ['lona', 'banner', 'vinil', 'tarjeta', 'promocional'])) score += 1;
      return { service, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => ({
      service: entry.service,
      score: entry.score,
      reason: recommendationReason({ service: entry.service, objective, budget, businessType })
    }));
  if (ranked.length >= 2) return ranked;
  const existing = new Set(ranked.map((entry) => normalizeName(entry.service?.nombre)));
  const fallback = catalogServices(catalogHints)
    .filter((service) => !existing.has(normalizeName(service?.nombre)))
    .slice(0, 3 - ranked.length)
    .map((service) => ({ service, score: 1, reason: recommendationReason({ service, objective, budget, businessType }) }));
  return [...ranked, ...fallback].slice(0, 3);
}

function missingConsultativeQuestion({ stateBefore, businessType, objective, budget, companyConfig }) {
  if (!businessType && !objective) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'recommendation.business_type',
      text: 'Claro. Que tipo de negocio tienes?',
      variants: ['Va. Primero dime que giro tiene tu negocio.']
    });
  }
  if (!objective) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'recommendation.goal',
      text: `Perfecto, ${businessType}. Que quieres lograr: atraer clientes, vender mas o mejorar tu imagen?`,
      variants: [
        companyConfig?.nombre ? `Para recomendarte algo de ${companyConfig.nombre}, que meta quieres lograr?` : 'Que meta quieres lograr con esta compra?',
        'Buscas atraer clientes, vender mas o mejorar tu imagen?'
      ]
    });
  }
  if (!budget) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'recommendation.budget',
      text: 'Con que presupuesto aproximado quieres comenzar?',
      variants: ['Que rango de presupuesto tienes contemplado para iniciar?']
    });
  }
  return null;
}

function commercialQualityScoreFor({ responsePlan, stateAfter }) {
  let score = 0.62;
  if (stateAfter?.collectedEntities?.businessType || responsePlan?.businessType) score += 0.1;
  if (stateAfter?.collectedEntities?.businessGoal || stateAfter?.collectedEntities?.objective || responsePlan?.objective) score += 0.1;
  if (responsePlan?.recommendations?.length) score += 0.1;
  if ((responsePlan?.recommendations ?? []).every((entry) => entry.reason)) score += 0.05;
  if (responsePlan?.questionId) score += 0.04;
  if (responsePlan?.repeatedQuestion) score -= 0.12;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function currentCollected(stateBefore = {}) {
  return {
    ...(stateBefore.collectedEntities ?? {}),
    ...(stateBefore.activeFlow?.collectedEntities ?? {})
  };
}

function withSyntheticEntity(entities, name, value, { confidence = 0.9, evidence = null, metadata = {} } = {}) {
  const payload = entities?.entities ?? entities ?? {};
  const nextPayload = {
    ...payload,
    [name]: {
      name,
      value,
      confidence,
      source: 'unified-planner-context',
      evidence,
      metadata
    }
  };
  return entities?.schema === 'EntityExtractionResult'
    ? { ...entities, entities: nextPayload }
    : nextPayload;
}

function promoteContextualEntities({ stateBefore, entities, message }) {
  const ambiguous = entity(entities, ENTITY_NAMES.AMBIGUOUS_NUMBER);
  if (stateBefore.status === CONVERSATION_STATES.ESPERANDO_PRESUPUESTO && ambiguous && !entity(entities, ENTITY_NAMES.BUDGET)) {
    return withSyntheticEntity(entities, ENTITY_NAMES.BUDGET, ambiguous.value, {
      confidence: Math.max(0.9, ambiguous.confidence ?? 0),
      evidence: ambiguous.evidence ?? String(ambiguous.value),
      metadata: { promotedFromAmbiguousNumber: true }
    });
  }
  if (stateBefore.status === CONVERSATION_STATES.ESPERANDO_CANTIDAD && ambiguous && !entity(entities, ENTITY_NAMES.QUANTITY)) {
    return withSyntheticEntity(entities, ENTITY_NAMES.QUANTITY, ambiguous.value, {
      confidence: Math.max(0.9, ambiguous.confidence ?? 0),
      evidence: ambiguous.evidence ?? String(ambiguous.value),
      metadata: { promotedFromAmbiguousNumber: true }
    });
  }
  const previousAmbiguous = currentCollected(stateBefore).ambiguousNumber;
  const text = messageText(message);
  if (previousAmbiguous && /\b(cantidad|piezas|pieza|unidades|unidad|pzs)\b/.test(text) && !entity(entities, ENTITY_NAMES.QUANTITY)) {
    return withSyntheticEntity(entities, ENTITY_NAMES.QUANTITY, previousAmbiguous, {
      confidence: 0.9,
      evidence: text,
      metadata: { promotedFromPreviousAmbiguousNumber: true }
    });
  }
  return entities;
}

function isCurrencyClarification({ stateBefore, entities }) {
  return ['EUR', 'USD'].includes(entityValue(entities, ENTITY_NAMES.CURRENCY)) && Boolean(
    activeService(stateBefore)
    || stateBefore.status === CONVERSATION_STATES.ESPERANDO_PRESUPUESTO
    || currentCollected(stateBefore).budget
  );
}

function currencyConfirmationText(currency) {
  const label = currency === 'USD' ? 'dólares' : 'euros';
  return `Perfecto, lo tomo como presupuesto aproximado en ${label}. Para confirmar bien, ¿quieres que lo usemos solo como referencia o manejas el presupuesto en pesos MXN?`;
}

function budgetConfirmationText(budget) {
  const amount = Number(budget).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  return `Solo para confirmar, ¿tu presupuesto aproximado es ${amount} MXN?`;
}

function excessiveBudgetEntity({ entities, companyConfig }) {
  const budget = entityValue(entities, ENTITY_NAMES.BUDGET);
  const amount = Number(budget);
  return Number.isFinite(amount) && amount > excessiveBudgetThreshold(companyConfig) ? amount : null;
}

function continuationRequested({ entities }) {
  return entityValue(entities, ENTITY_NAMES.CONTINUE_REQUEST) === true;
}

function advisorConfirmationAccepted({ stateBefore, entities }) {
  return stateBefore.status === CONVERSATION_STATES.RESUMEN && entityValue(entities, ENTITY_NAMES.CONFIRMATION) === true;
}

function advisorConfirmationDeclined({ stateBefore, entities }) {
  return stateBefore.status === CONVERSATION_STATES.RESUMEN && entityValue(entities, ENTITY_NAMES.CONFIRMATION) === false;
}

function explicitLogoQuoteRequest(message) {
  const text = messageText(message);
  return /\b(cotizar|quiero|tambien|aparte|necesito).*\b(logo|logotipo)\b|\b(logo|logotipo).*\b(aparte|cotizar)\b/.test(text);
}

function designSupportAnswer({ stateBefore, entities, message }) {
  if (stateBefore.status !== CONVERSATION_STATES.ESPERANDO_DISENO || !activeService(stateBefore)) return false;
  if (explicitLogoQuoteRequest(message)) return false;
  const text = messageText(message);
  return Boolean(
    entity(entities, ENTITY_NAMES.DESIGN)
    || /\b(q?quiero|tambien|tambien quiero|necesito|apoyo|ayuda|no tengo|con).*\bdiseno\b/.test(text)
    || /\bdiseno\b/.test(text)
  );
}

function advisorAlreadyPendingAnswer({ stateBefore, entities, message }) {
  if (stateBefore.status !== CONVERSATION_STATES.ASESOR) return false;
  const text = messageText(message);
  return Boolean(
    entityValue(entities, ENTITY_NAMES.CONFIRMATION) === true
    || entity(entities, ENTITY_NAMES.ADVISOR_REQUEST)
    || /\b(esperare|esperaré|espero|esperando).*\basesor\b/.test(text)
  );
}

function questionAfterUsefulEntity({ stateBefore, entities, selected, collectedEntities, nextState }) {
  if (nextState !== CONVERSATION_STATES.ESPERANDO_DISENO) return questionForState(nextState, selected, stateBefore);

  const budget = entityValue(entities, ENTITY_NAMES.BUDGET);
  if (budget) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'quote.design',
      text: `Perfecto, considero presupuesto aproximado de ${moneyText(budget)}. Para cerrar: ya tienes el diseno o quieres apoyo?`,
      variants: [
        `Perfecto, guardo presupuesto aproximado de ${moneyText(budget)}. Para terminar la cotizacion, el diseno ya lo tienes o necesitas que lo preparemos?`,
        'Para cerrar la cotizacion, el diseno ya lo tienes o necesitas apoyo?'
      ]
    });
  }

  if (entity(entities, ENTITY_NAMES.INSTALLATION)) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'quote.design',
      text: 'Perfecto, agrego instalacion para revisar con asesor. Ya tienes el diseno o quieres apoyo?',
      variants: [
        'Perfecto, dejo instalacion considerada. Para terminar la cotizacion, el diseno ya lo tienes o necesitas que lo preparemos?',
        'Agrego instalacion para revisarla con asesor. El diseno ya lo tienes listo o necesitas apoyo?'
      ]
    });
  }

  if (entity(entities, ENTITY_NAMES.QUANTITY) && serviceNeedsDetailBeforeBudget(selected)) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'quote.design',
      text: `Perfecto, anoto ${collectedEntities.quantity} piezas. Tienes medidas, diseno o algun detalle especial?`,
      variants: [
        `Listo, considero ${collectedEntities.quantity} piezas. Para avanzar, tienes medidas, diseno o algun detalle especial?`,
        'Para terminar la cotizacion, tienes medidas, diseno o algun detalle especial?'
      ]
    });
  }

  if (entity(entities, ENTITY_NAMES.DIMENSIONS) && stateBefore.status === CONVERSATION_STATES.ESPERANDO_DISENO) {
    return resolveQuestionPlan({
      state: stateBefore,
      questionId: 'quote.design',
      text: 'Perfecto, actualizo las medidas. Para terminar la cotizacion, el diseno ya lo tienes o necesitas que lo preparemos?',
      variants: [
        'Ya tengo esas medidas. Para cerrar, el diseno ya lo tienes o necesitas apoyo?',
        'Medidas actualizadas. El diseno ya lo tienes listo o quieres que tambien te apoyemos con eso?'
      ]
    });
  }

  return questionForState(nextState, selected, stateBefore);
}

function answersExpectedState(stateBefore, entities) {
  if (stateBefore.status === CONVERSATION_STATES.ESPERANDO_MEDIDAS) return Boolean(entity(entities, ENTITY_NAMES.DIMENSIONS));
  if (stateBefore.status === CONVERSATION_STATES.ESPERANDO_CANTIDAD) return Boolean(entity(entities, ENTITY_NAMES.QUANTITY));
  if (stateBefore.status === CONVERSATION_STATES.ESPERANDO_PRESUPUESTO) return Boolean(entity(entities, ENTITY_NAMES.BUDGET));
  if (stateBefore.status === CONVERSATION_STATES.ESPERANDO_DISENO) return Boolean(entity(entities, ENTITY_NAMES.DESIGN));
  if (stateBefore.status === CONVERSATION_STATES.ESPERANDO_INSTALACION) return Boolean(entity(entities, ENTITY_NAMES.INSTALLATION));
  return false;
}

function containsQuoteEntity(entities) {
  return Boolean(
    entity(entities, ENTITY_NAMES.DIMENSIONS)
    || entity(entities, ENTITY_NAMES.QUANTITY)
    || entity(entities, ENTITY_NAMES.BUDGET)
    || entity(entities, ENTITY_NAMES.DESIGN)
    || entity(entities, ENTITY_NAMES.INSTALLATION)
  );
}

function catalogSelectionNumber({ message, entities }) {
  const ambiguous = entityValue(entities, ENTITY_NAMES.AMBIGUOUS_NUMBER);
  if (Number.isInteger(ambiguous)) return ambiguous;
  const text = normalizeName(rawMessageText(message));
  const match = text.match(/^(?:el\s+)?(?:numero\s+|opcion\s+|#\s*)?(\d{1,3})$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

function selectedCatalogOption({ stateBefore, message, entities }) {
  if (stateBefore.status !== CONVERSATION_STATES.CATALOGO) return null;
  const options = stateBefore.lastOptionsShown ?? [];
  const selection = catalogSelectionNumber({ message, entities });
  if (!selection || selection < 1 || selection > options.length) return null;
  return options[selection - 1] ?? null;
}

function invalidCatalogSelection({ stateBefore, message, entities }) {
  if (stateBefore.status !== CONVERSATION_STATES.CATALOGO) return null;
  const options = stateBefore.lastOptionsShown ?? [];
  if (!options.length) return null;
  const selection = catalogSelectionNumber({ message, entities });
  if (!selection || selection >= 1 && selection <= options.length) return null;
  return { selection, options };
}

function optionRangeText(options = []) {
  const values = options.map((_, index) => String(index + 1));
  if (values.length <= 2) return values.join(' o ');
  return `${values.slice(0, -1).join(', ')} o ${values.at(-1)}`;
}

function neutralTextFor({ entities, stateBefore, companyConfig }) {
  const neutral = entityValue(entities, ENTITY_NAMES.NEUTRAL_MESSAGE);
  const selected = activeService(stateBefore);
  if (neutral === 'thanks') {
    return selected?.nombre
      ? `Con gusto. Seguimos con ${selected.nombre} o lo dejamos pendiente?`
      : 'Con gusto. Cuando quieras te ayudo a cotizar o elegir la mejor opcion.';
  }
  if (neutral === 'greeting') {
    return configuredWelcomeMessage(companyConfig) ?? DEFAULT_WELCOME_MESSAGE;
  }
  return 'Claro, que necesitas revisar ahora?';
}

function quoteResponsePlan({ planResponse, type, question, selectedService, selectedCategory = null, collectedEntities, data = {} }) {
  const quoteSummary = question?.questionId === 'quote.summary'
    ? quoteSummaryFor({ service: selectedService, collectedEntities })
    : null;
  return planResponse({
    type: quoteSummary ? 'quote_summary' : type,
    question,
    selectedService,
    selectedCategory,
    summary: quoteSummary ? `Resumen de ${selectedService?.nombre ?? 'cotizacion'}` : selectedService?.nombre,
    data: {
      ...data,
      ...(quoteSummary ? { quoteSummary } : {})
    }
  });
}

export function planConversation({
  message,
  entities,
  semanticHints = null,
  conversationSnapshot,
  catalogHints = {},
  companyConfig = null
} = {}) {
  const stateBefore = stateFromSnapshot(conversationSnapshot);
  entities = applySemanticHints(entities, semanticHints, stateBefore);
  entities = promoteContextualEntities({ stateBefore, entities, message });
  const services = catalogServices(catalogHints);
  const serviceEntity = entity(entities, ENTITY_NAMES.SERVICE);
  const categoryEntity = entity(entities, ENTITY_NAMES.CATEGORY);
  const selectedService = serviceEntity ? matchServiceByEntity(serviceEntity, catalogHints) : null;
  const selectedCategory = categoryEntity ? matchCategoryByEntity(categoryEntity, catalogHints) : null;
  const decisionId = `planner_${conversationSnapshot?.conversationId ?? 'conversation'}_${Date.now()}`;
  const entityPayload = entities?.entities ?? entities ?? {};
  const emojiMode = emojiModeFrom(companyConfig);
  const planResponse = (args) => responsePlanFor({
    ...args,
    data: {
      ...(args?.data ?? {}),
      emojiMode
    }
  });

  if (advisorAlreadyPendingAnswer({ stateBefore, entities, message })) {
    const selected = activeService(stateBefore);
    const stateAfter = createConversationState({
      ...stateBefore,
      status: CONVERSATION_STATES.ASESOR,
      selectedService: selected ?? stateBefore.selectedService ?? null,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities: currentCollected(stateBefore)
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.NEUTRAL,
      confidence: entityConfidence(entities, ENTITY_NAMES.CONFIRMATION, 0.9),
      reason: 'advisor_handoff_already_pending',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected ?? stateBefore.selectedService ?? null,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      handoffPlan: { needed: false, reason: 'handoff_already_pending' },
      responsePlan: planResponse({
        type: 'advisor_pending',
        question: null,
        selectedService: selected ?? stateBefore.selectedService ?? null,
        selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
        summary: 'Asesor ya solicitado'
      })
    });
  }

  if (advisorConfirmationAccepted({ stateBefore, entities })) {
    const selected = activeService(stateBefore);
    const stateAfter = createConversationState({
      status: CONVERSATION_STATES.ASESOR,
      selectedService: selected ?? null,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities: {
        ...currentCollected(stateBefore),
        handoffSentForSummary: true
      },
      history: stateBefore.history ?? []
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.HANDOFF,
      confidence: entityConfidence(entities, ENTITY_NAMES.CONFIRMATION),
      reason: 'advisor_confirmation_accepted',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected ?? null,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      handoffPlan: { needed: true, reason: 'advisor_confirmation_accepted', payload: { selectedService: selected ?? null } },
      responsePlan: planResponse({ type: 'handoff', question: null, summary: 'Asesor confirmado' }),
      actions: [EXECUTION_ACTIONS.CREATE_HANDOFF, EXECUTION_ACTIONS.RENDER_RESPONSE, EXECUTION_ACTIONS.PERSIST_STATE]
    });
  }

  if (advisorConfirmationDeclined({ stateBefore, entities })) {
    const selected = activeService(stateBefore);
    const stateAfter = createConversationState({
      status: CONVERSATION_STATES.FINALIZADO,
      selectedService: selected ?? null,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities: currentCollected(stateBefore),
      history: stateBefore.history ?? []
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.NEUTRAL,
      confidence: entityConfidence(entities, ENTITY_NAMES.CONFIRMATION),
      reason: 'advisor_confirmation_declined',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected ?? null,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      handoffPlan: { needed: false, reason: 'advisor_confirmation_declined' },
      responsePlan: planResponse({
        type: 'quote_declined',
        question: null,
        selectedService: selected ?? null,
        selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
        summary: 'Asesor no solicitado'
      })
    });
  }

  if (continuationRequested({ entities }) && activeService(stateBefore)) {
    const selected = activeService(stateBefore);
    const collectedEntities = currentCollected(stateBefore);
    const nextState = nextQuoteStateForService(selected, collectedEntities);
    const question = questionForState(nextState, selected, stateBefore);
    const stateAfter = quoteState({
      stateBefore,
      nextState,
      selectedService: selected,
      selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities,
      question
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION,
      confidence: entityConfidence(entities, ENTITY_NAMES.CONTINUE_REQUEST),
      reason: 'customer_requested_continue_active_service',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected,
      selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null,
      responsePlan: quoteResponsePlan({ planResponse, type: 'quote_followup', question, selectedService: selected, selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null, collectedEntities })
    });
  }

  if (entity(entities, ENTITY_NAMES.REPEATED_INFO_REFERENCE) && activeService(stateBefore)) {
    const selected = activeService(stateBefore);
    const question = resolveQuestionPlan({
      state: stateBefore,
      questionId: 'quote.repeated_info_reference',
      text: `Si, tengo registrado: ${selected.nombre}. Quieres que lo pase con un asesor o prefieres ajustar algun dato?`,
      variants: [`Tengo registrado ${selected.nombre}. Lo paso con asesor o quieres ajustar algun dato?`]
    });
    const stateAfter = stateWithQuestion(createConversationState({
      ...stateBefore,
      status: stateBefore.status,
      selectedService: selected,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities: currentCollected(stateBefore)
    }), question);
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.CLARIFY,
      confidence: entityConfidence(entities, ENTITY_NAMES.REPEATED_INFO_REFERENCE),
      reason: 'repeated_info_reference_with_active_service',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      responsePlan: planResponse({ type: 'clarify_need', question, selectedService: selected, selectedCategory: selected?.categoria ?? null })
    });
  }

  if (designSupportAnswer({ stateBefore, entities, message })) {
    const selected = activeService(stateBefore);
    const nextEntities = entity(entities, ENTITY_NAMES.DESIGN)
      ? entities
      : withSyntheticEntity(entities, ENTITY_NAMES.DESIGN, true, {
        confidence: 0.9,
        evidence: messageText(message),
        metadata: { inferredFromDesignAnswer: true }
      });
    const nextEntityPayload = nextEntities?.entities ?? nextEntities ?? {};
    const collectedEntities = collectedFromEntities(stateBefore, nextEntities);
    const nextState = nextQuoteStateForService(selected, collectedEntities);
    const question = questionAfterUsefulEntity({ stateBefore, entities: nextEntities, selected, collectedEntities, nextState });
    const stateAfter = quoteState({
      stateBefore,
      nextState,
      selectedService: selected,
      selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities,
      question
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION,
      confidence: entityConfidence(nextEntities, ENTITY_NAMES.DESIGN, 0.9),
      reason: 'design_support_answered_active_quote',
      entities: nextEntityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected,
      selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null,
      responsePlan: quoteResponsePlan({ planResponse, type: 'quote_followup', question, selectedService: selected, selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null, collectedEntities })
    });
  }

  if (isConsultativeNextStepQuestion(message) && hasRecentServiceOrHandoff(stateBefore)) {
    const selected = activeService(stateBefore);
    const question = resolveQuestionPlan({
      state: stateBefore,
      questionId: 'consultative.next_step',
      text: 'Con lo que llevamos, puedo ayudarte a revisar otra opción, complementar con diseño o cotizar otro servicio. ¿Quieres una recomendación o prefieres ver otro servicio?',
      variants: ['Con lo que llevamos, puedo ayudarte a revisar otra opcion, complementar con diseno o cotizar otro servicio. Quieres una recomendacion o prefieres ver otro servicio?']
    });
    const stateAfter = stateWithQuestion(createConversationState({
      ...stateBefore,
      status: stateBefore.status,
      selectedService: selected ?? stateBefore.selectedService ?? null,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities: currentCollected(stateBefore)
    }), question);
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.RECOMMENDATION,
      confidence: entityConfidence(entities, ENTITY_NAMES.RECOMMENDATION_REQUEST, 0.9),
      reason: 'consultative_next_step_with_active_service',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected ?? stateBefore.selectedService ?? null,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      responsePlan: planResponse({ type: 'clarify_need', question, selectedService: selected ?? stateBefore.selectedService ?? null, selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null })
    });
  }

  if (entity(entities, ENTITY_NAMES.NEUTRAL_MESSAGE)) {
    const neutralText = neutralTextFor({ entities, stateBefore, companyConfig });
    const question = resolveQuestionPlan({
      state: stateBefore,
      questionId: 'neutral.reply',
      text: neutralText
    });
    const stateAfter = stateWithQuestion({ ...stateBefore }, question);
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.NEUTRAL,
      confidence: entity(entities, ENTITY_NAMES.NEUTRAL_MESSAGE).confidence,
      reason: 'neutral_message_has_priority_over_memory',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      responsePlan: planResponse({ type: 'neutral_message', question })
    });
  }

  const optionSelected = selectedCatalogOption({ stateBefore, message, entities });
  if (optionSelected) {
    const selected = optionSelected;
    const collectedEntities = collectedFromEntities(stateBefore, entities);
    const nextState = nextQuoteStateForService(selected, collectedEntities);
    const question = questionForState(nextState, selected, stateBefore);
    const stateAfter = quoteState({
      stateBefore,
      nextState,
      selectedService: selected,
      selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities,
      question
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.START_SERVICE_QUOTE,
      confidence: entity(entities, ENTITY_NAMES.AMBIGUOUS_NUMBER)?.confidence ?? 0.9,
      reason: 'catalog_option_selected',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected,
      selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null,
      responsePlan: quoteResponsePlan({ planResponse, type: 'service_quote_start', question, selectedService: selected, selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null, collectedEntities })
    });
  }

  const invalidSelection = invalidCatalogSelection({ stateBefore, message, entities });
  if (invalidSelection) {
    const label = stateBefore.selectedCategory ?? 'estas opciones';
    const optionsText = optionRangeText(invalidSelection.options);
    const question = resolveQuestionPlan({
      state: stateBefore,
      questionId: 'catalog.invalid_selection',
      text: `No tengo una opcion ${invalidSelection.selection} en ${label}. Responde ${optionsText}, o escribe Catalogo para ver todos los servicios.`,
      variants: [`En ${label} solo tengo ${optionsText}. Elige una de esas opciones o escribe Catalogo para ver todos los servicios.`]
    });
    const stateAfter = stateWithQuestion({
      ...stateBefore,
      status: CONVERSATION_STATES.CATALOGO,
      lastOptionsShown: invalidSelection.options
    }, question);
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.CLARIFY,
      confidence: entity(entities, ENTITY_NAMES.AMBIGUOUS_NUMBER)?.confidence ?? 0.85,
      reason: 'catalog_selection_out_of_range',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedCategory: stateBefore.selectedCategory ?? null,
      responsePlan: planResponse({ type: 'clarify_need', question, selectedCategory: stateBefore.selectedCategory ?? null })
    });
  }

  if (selectedService && isTopicSwitch({ state: stateBefore, selectedService })) {
    const collectedEntities = collectedFromEntities(createConversationState(), entities);
    const nextState = nextQuoteStateForService(selectedService, collectedEntities);
    const question = questionForState(nextState, selectedService, stateBefore);
    const stateAfter = quoteState({
      stateBefore,
      nextState,
      selectedService,
      selectedCategory: selectedService.categoria ?? null,
      collectedEntities,
      closePrevious: true,
      question
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.TOPIC_SWITCH,
      confidence: serviceEntity.confidence,
      reason: 'current_message_selects_different_service',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService,
      selectedCategory: selectedService.categoria ?? null,
      responsePlan: quoteResponsePlan({
        planResponse,
        type: 'service_quote_start',
        question,
        selectedService,
        selectedCategory: selectedService.categoria ?? null,
        collectedEntities,
        data: asksServiceAvailability(message) ? { availabilityConfirmation: true } : {}
      })
    });
  }

  if (isCurrencyClarification({ stateBefore, entities })) {
    const selected = activeService(stateBefore) ?? selectedService;
    const collectedEntities = collectedFromEntities(stateBefore, entities);
    const currency = entityValue(entities, ENTITY_NAMES.CURRENCY);
    const confirmationText = currencyConfirmationText(currency);
    const stateAfter = quoteState({
      stateBefore,
      nextState: stateBefore.status === CONVERSATION_STATES.INIT ? CONVERSATION_STATES.ESPERANDO_PRESUPUESTO : stateBefore.status,
      selectedService: selected,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities,
      question: {
        questionId: 'quote.currency_confirmation',
        text: confirmationText,
        repeated: false
      }
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION,
      confidence: entityConfidence(entities, ENTITY_NAMES.CURRENCY),
      reason: 'budget_currency_requires_confirmation',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      responsePlan: planResponse({
        type: 'budget_currency_confirmation',
        question: {
          questionId: 'quote.currency_confirmation',
          text: confirmationText,
          repeated: false
        },
        selectedService: selected,
        selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
        summary: selected?.nombre ?? `Presupuesto en ${currency}`
      })
    });
  }

  const exaggeratedDimensions = exaggeratedDimensionsEntity(entities);
  if (exaggeratedDimensions && (activeService(stateBefore) || selectedService)) {
    const selected = activeService(stateBefore) ?? selectedService;
    const collectedEntities = collectedFromEntities(stateBefore, entities);
    const question = {
      questionId: 'quote.confirm_dimensions',
      text: dimensionConfirmationText(exaggeratedDimensions),
      repeated: false
    };
    const stateAfter = quoteState({
      stateBefore,
      nextState: CONVERSATION_STATES.CONFIRM_DIMENSIONS,
      selectedService: selected,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities,
      question
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.CONFIRM_DIMENSIONS,
      confidence: entityConfidence(entities, ENTITY_NAMES.DIMENSIONS),
      reason: 'dimensions_area_requires_confirmation',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      responsePlan: planResponse({
        type: 'clarify_need',
        question,
        selectedService: selected,
        selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null
      })
    });
  }

  const excessiveBudget = excessiveBudgetEntity({ entities, companyConfig });
  if (excessiveBudget && (activeService(stateBefore) || selectedService)) {
    const selected = activeService(stateBefore) ?? selectedService;
    const question = {
      questionId: 'quote.confirm_budget',
      text: budgetConfirmationText(excessiveBudget),
      repeated: false
    };
    const stateAfter = stateWithQuestion(createConversationState({
      ...stateBefore,
      status: stateBefore.status === CONVERSATION_STATES.INIT
        ? CONVERSATION_STATES.ESPERANDO_PRESUPUESTO
        : stateBefore.status,
      selectedService: selected,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities: currentCollected(stateBefore)
    }), question);
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.CLARIFY,
      confidence: entityConfidence(entities, ENTITY_NAMES.BUDGET),
      reason: 'budget_amount_requires_confirmation',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      responsePlan: planResponse({
        type: 'budget_amount_confirmation',
        question,
        selectedService: selected,
        selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
        data: {
          budget: excessiveBudget,
          formattedBudget: moneyText(excessiveBudget)
        }
      })
    });
  }

  if ((answersExpectedState(stateBefore, entities) || containsQuoteEntity(entities)) && activeService(stateBefore)) {
    const selected = activeService(stateBefore);
    const collectedEntities = collectedFromEntities(stateBefore, entities);
    const nextState = nextQuoteStateForService(selected, collectedEntities);
    const question = questionAfterUsefulEntity({ stateBefore, entities, selected, collectedEntities, nextState });
    const stateAfter = quoteState({
      stateBefore,
      nextState,
      selectedService: selected,
      selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities,
      question
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION,
      confidence: entities.confidence ?? 0.9,
      reason: answersExpectedState(stateBefore, entities) ? 'message_answers_expected_state' : 'out_of_order_entity_handling',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected,
      selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null,
      responsePlan: quoteResponsePlan({ planResponse, type: 'quote_followup', question, selectedService: selected, selectedCategory: selected.categoria ?? stateBefore.selectedCategory ?? null, collectedEntities })
    });
  }

  if (entity(entities, ENTITY_NAMES.DIMENSIONS) && !activeService(stateBefore) && !selectedService) {
    const question = resolveQuestionPlan({
      state: stateBefore,
      questionId: 'measurements.service',
      text: 'Perfecto, tengo las medidas. Para que servicio las necesitas cotizar?',
      variants: ['Ya tengo las medidas. Que servicio quieres cotizar con ellas?']
    });
    const stateAfter = stateWithQuestion(createConversationState({
      status: CONVERSATION_STATES.INIT,
      collectedEntities: collectedFromEntities(stateBefore, entities),
      history: stateBefore.history ?? []
    }), question);
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.CLARIFY,
      confidence: entity(entities, ENTITY_NAMES.DIMENSIONS).confidence,
      reason: 'dimensions_without_service',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      responsePlan: planResponse({ type: 'dimensions_without_service', question })
    });
  }

  if (entity(entities, ENTITY_NAMES.CATALOG_REQUEST)) {
    const question = questionForState(CONVERSATION_STATES.CATALOGO, null, stateBefore);
    const stateAfter = stateWithOptions(stateWithQuestion(createConversationState({
      status: CONVERSATION_STATES.CATALOGO,
      selectedService: null,
      selectedCategory: null,
      history: stateBefore.history ?? []
    }), question), services);
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.SHOW_CATALOG,
      confidence: entity(entities, ENTITY_NAMES.CATALOG_REQUEST).confidence,
      reason: 'catalog_request_detected',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      retrievalPlan: { needed: services.length === 0, queries: ['catalogo'] },
      responsePlan: planResponse({
        type: 'catalog_listing',
        question,
        summary: 'Catalogo completo',
        data: {
          services,
          categories: catalogCategories(catalogHints)
        }
      })
    });
  }

  if (selectedCategory) {
    const question = questionForState(CONVERSATION_STATES.CATALOGO, null, stateBefore);
    const categoryServices = services.filter((service) => normalizeName(service?.categoria) === normalizeName(selectedCategory));
    const stateAfter = stateWithOptions(stateWithQuestion(createConversationState({
      status: CONVERSATION_STATES.CATALOGO,
      selectedCategory,
      history: stateBefore.history ?? []
    }), question), categoryServices);
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.SHOW_CATEGORY,
      confidence: categoryEntity.confidence,
      reason: 'category_detected',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedCategory,
      retrievalPlan: { needed: true, queries: [selectedCategory] },
      responsePlan: planResponse({
        type: 'category_listing',
        question,
        selectedCategory,
        summary: selectedCategory,
        data: {
          services: categoryServices
        }
      })
    });
  }

  if (selectedService) {
    const collectedEntities = collectedFromEntities(stateBefore, entities);
    const nextState = nextQuoteStateForService(selectedService, collectedEntities);
    const question = questionForState(nextState, selectedService, stateBefore);
    const stateAfter = quoteState({
      stateBefore,
      nextState,
      selectedService,
      selectedCategory: selectedService.categoria ?? null,
      collectedEntities,
      question
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.START_SERVICE_QUOTE,
      confidence: serviceEntity.confidence,
      reason: 'service_detected',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService,
      selectedCategory: selectedService.categoria ?? null,
      responsePlan: quoteResponsePlan({
        planResponse,
        type: 'service_quote_start',
        question,
        selectedService,
        selectedCategory: selectedService.categoria ?? null,
        collectedEntities,
        data: asksServiceAvailability(message) ? { availabilityConfirmation: true } : {}
      })
    });
  }

  if (entity(entities, ENTITY_NAMES.ADVISOR_REQUEST)) {
    const selected = activeService(stateBefore);
    const stateAfter = createConversationState({
      status: CONVERSATION_STATES.ASESOR,
      selectedService: selected ?? null,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      collectedEntities: stateBefore.collectedEntities ?? stateBefore.activeFlow?.collectedEntities ?? {},
      history: stateBefore.history ?? []
    });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.HANDOFF,
      confidence: entity(entities, ENTITY_NAMES.ADVISOR_REQUEST).confidence,
      reason: 'advisor_requested',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      selectedService: selected ?? null,
      selectedCategory: selected?.categoria ?? stateBefore.selectedCategory ?? null,
      handoffPlan: { needed: true, reason: 'customer_requested_advisor', payload: { selectedService: selected ?? null } },
      responsePlan: planResponse({ type: 'handoff', question: null, summary: 'Asesor solicitado' }),
      actions: [EXECUTION_ACTIONS.CREATE_HANDOFF, EXECUTION_ACTIONS.RENDER_RESPONSE, EXECUTION_ACTIONS.PERSIST_STATE]
    });
  }

  const commercialContext = currentCollected(stateBefore);
  const commercialContextChange = !selectedService && !selectedCategory && Boolean(
    entity(entities, ENTITY_NAMES.BUSINESS_TYPE)
    || entity(entities, ENTITY_NAMES.OBJECTIVE)
    || (entity(entities, ENTITY_NAMES.BUDGET) && (commercialContext.businessType || commercialContext.businessGoal || commercialContext.objective))
  );
  if (entity(entities, ENTITY_NAMES.RECOMMENDATION_REQUEST) || commercialContextChange) {
    const objective = businessGoalFrom({ entities, conversationSnapshot });
    const budget = budgetFrom({ entities, conversationSnapshot });
    const businessType = businessTypeFrom({ entities, conversationSnapshot, companyConfig });
    const question = missingConsultativeQuestion({ stateBefore, businessType, objective, budget, companyConfig });
    const recommendations = !question && (objective || budget || businessType)
      ? recommendationOptions({ catalogHints, entities, conversationSnapshot, companyConfig })
      : [];
    if (recommendations.length) {
      const stateAfter = createConversationState({
        status: CONVERSATION_STATES.INIT,
        collectedEntities: {
          ...collectedFromEntities(stateBefore, entities),
          ...(businessType ? { businessType } : {}),
          ...(objective ? { businessGoal: objective, objective } : {}),
          ...(budget ? { budget } : {})
        },
        history: stateBefore.history ?? []
      });
      const responsePlan = planResponse({
        type: 'recommendation_options',
        question: null,
        summary: 'Recomendacion consultiva',
        data: {
          objective,
          budget,
          businessType,
          preferredCategory: recommendations[0]?.service?.categoria ?? null,
          recommendations,
          recommendationExplained: recommendations.every((entry) => Boolean(entry.reason))
        }
      });
      responsePlan.commercialQualityScore = commercialQualityScoreFor({ responsePlan, stateAfter });
      return buildPlan({
        decisionId,
        intent: PLANNER_INTENTS.RECOMMENDATION,
        confidence: entityConfidence(entities, ENTITY_NAMES.RECOMMENDATION_REQUEST, 0.88),
        reason: 'consultative_recommendation_generated',
        entities: entityPayload,
        stateBefore,
        stateAfter,
        mcpPlan: {
          needed: true,
          tools: ['recommend_services'],
          input: {
            objective,
            budget,
            businessType,
            recommendations: recommendations.map((entry) => entry.service?.nombre)
          }
        },
        responsePlan
      });
    }
    const followupQuestion = question ?? resolveQuestionPlan({
      state: stateBefore,
      questionId: 'recommendation.catalog_context',
      text: 'Tengo el contexto. Que producto o servicio quieres revisar primero?',
      variants: ['Con ese contexto, quieres que revisemos lonas, viniles, branding u otra opcion?']
    });
    const stateAfter = stateWithQuestion(createConversationState({
      status: CONVERSATION_STATES.INIT,
      collectedEntities: {
        ...collectedFromEntities(stateBefore, entities),
        ...(businessType ? { businessType } : {}),
        ...(objective ? { businessGoal: objective, objective } : {}),
        ...(budget ? { budget } : {})
      },
      history: stateBefore.history ?? []
    }), followupQuestion);
    const responsePlan = planResponse({
      type: 'recommendation_question',
      question: followupQuestion,
      summary: 'Recomendacion',
      data: {
        objective,
        budget,
        businessType,
        maxQuestions: 3
      }
    });
    responsePlan.commercialQualityScore = commercialQualityScoreFor({ responsePlan, stateAfter });
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.RECOMMENDATION,
      confidence: entityConfidence(entities, ENTITY_NAMES.RECOMMENDATION_REQUEST, 0.88),
      reason: 'recommendation_requested',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      mcpPlan: { needed: true, tools: ['recommend_services'], input: { message: messageText(message), businessType, objective, budget } },
      responsePlan
    });
  }

  if (entity(entities, ENTITY_NAMES.PRICE_REQUEST)) {
    const question = resolveQuestionPlan({
      state: stateBefore,
      questionId: 'price.service',
      text: 'Claro. Para darte un estimado, dime que servicio quieres cotizar y si ya tienes medidas, cantidad o presupuesto aproximado.',
      variants: ['Te ayudo con el costo. Que servicio, medidas o cantidad tienes en mente?']
    });
    const stateAfter = stateWithQuestion(createConversationState({
      status: CONVERSATION_STATES.INIT,
      history: stateBefore.history ?? []
    }), question);
    return buildPlan({
      decisionId,
      intent: PLANNER_INTENTS.CLARIFY,
      confidence: entity(entities, ENTITY_NAMES.PRICE_REQUEST).confidence,
      reason: 'price_request_needs_context',
      entities: entityPayload,
      stateBefore,
      stateAfter,
      responsePlan: planResponse({ type: 'clarify_need', question })
    });
  }

  const clarifyQuestion = resolveQuestionPlan({
    state: stateBefore,
    questionId: 'clarify.need',
    text: entity(entities, ENTITY_NAMES.AMBIGUOUS_NUMBER)
      ? 'Ese numero es cantidad, presupuesto o una medida?'
      : 'Que producto, servicio o categoria tienes en mente?',
    variants: ['Me ayudas con un poco mas de detalle?']
  });
  const stateAfter = stateWithQuestion(createConversationState({
    status: CONVERSATION_STATES.INIT,
    history: stateBefore.history ?? []
  }), clarifyQuestion);
  return buildPlan({
    decisionId,
    intent: PLANNER_INTENTS.CLARIFY,
    confidence: entity(entities, ENTITY_NAMES.AMBIGUOUS_NUMBER)?.confidence ?? 0.5,
    reason: entity(entities, ENTITY_NAMES.AMBIGUOUS_NUMBER) ? 'ambiguous_number_requires_clarification' : 'no_planner_rule_matched',
    entities: entityPayload,
    stateBefore,
    stateAfter,
    responsePlan: planResponse({ type: 'clarify_need', question: clarifyQuestion })
  });
}
