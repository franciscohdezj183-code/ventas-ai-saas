import { saveConversationContext } from '../bot/conversationContext.service.js';
import { logger } from '../utils/logger.js';
import {
  createConversationSnapshot,
  createConversationState
} from './conversation-contracts.js';
import { extractEntities } from './entity-extractor.js';
import { executeExecutionPlan } from './execution-plan.executor.js';
import { loadFullServiceCatalog } from './retrieval.service.js';
import {
  classifySemanticIntent,
  semanticIntentConfig,
  shouldUseSemanticClassifier
} from './semantic-intent-classifier.js';
import { planConversation } from './unified-conversation-planner.js';

function flagEnabled(value) {
  return ['1', 'true', 'yes', 'on', 'si'].includes(String(value ?? '').trim().toLowerCase());
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function selectedServiceName(value = null) {
  return value?.nombre ?? value?.name ?? value?.selectedServiceName ?? null;
}

function hasUsefulMemory(update = {}) {
  return Boolean(
    update.businessType
    || update.businessGoal
    || update.preferredCategory
    || update.preferredServices?.length
    || update.budgetRange
    || update.lastRecommendation
  );
}

function mergeUsefulMemory(previous = {}, update = {}) {
  return {
    businessType: update.businessType ?? previous.businessType ?? null,
    businessGoal: update.businessGoal ?? previous.businessGoal ?? null,
    preferredCategory: update.preferredCategory ?? previous.preferredCategory ?? null,
    preferredServices: update.preferredServices ?? previous.preferredServices ?? [],
    budgetRange: update.budgetRange ?? previous.budgetRange ?? null,
    lastRecommendation: update.lastRecommendation ?? previous.lastRecommendation ?? null
  };
}

function qualityScoreFor({ executionPlan, executorResult }) {
  if (Number.isFinite(Number(executionPlan.responsePlan?.commercialQualityScore))) {
    return Number(executionPlan.responsePlan.commercialQualityScore);
  }
  let score = 0.72;
  if (executionPlan.responsePlan?.type === 'quote_summary') score += 0.1;
  if (executionPlan.responsePlan?.type === 'recommendation_options') score += 0.1;
  if (executionPlan.responsePlan?.emojiMode) score += 0.03;
  if (String(executorResult.responseText ?? '').length > 30) score += 0.05;
  if (executionPlan.responsePlan?.repeatedQuestion) score -= 0.1;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function hasLegacyServiceRevival({ state, executionPlan }) {
  const legacyService = selectedServiceName(state?.legacyContext?.datos_json?.servicio)
    ?? state?.legacyContext?.datos_json?.ncie?.active_service_name
    ?? selectedServiceName(state?.selectedService)
    ?? null;
  const unifiedService = selectedServiceName(executionPlan?.selectedService);
  const explicitService = Boolean(executionPlan?.entities?.service);
  return Boolean(legacyService && unifiedService && !explicitService && normalize(legacyService) === normalize(unifiedService));
}

function canaryEmpresaIds() {
  return String(process.env.UNIFIED_PLANNER_CANARY_EMPRESAS ?? '')
    .split(',')
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export function isUnifiedPlannerEnabled() {
  return flagEnabled(process.env.UNIFIED_PLANNER_ENABLED);
}

export function isUnifiedPlannerRollbackOnError() {
  const raw = process.env.UNIFIED_PLANNER_ROLLBACK_ON_ERROR;
  if (raw === undefined || raw === null || raw === '') return true;
  return flagEnabled(raw);
}

export function selectUnifiedPlannerCanary({ empresaId }) {
  if (!isUnifiedPlannerEnabled()) {
    return { selected: false, reason: 'disabled', canaryEmpresas: canaryEmpresaIds() };
  }
  const canaryEmpresas = canaryEmpresaIds();
  if (!canaryEmpresas.includes(Number(empresaId))) {
    return { selected: false, reason: 'empresa_not_in_canary', canaryEmpresas };
  }
  return { selected: true, reason: 'empresa_in_canary', canaryEmpresas };
}

function conversationStateFromUnifiedNamespace(state = {}) {
  const unified = state?.unified ?? state?.legacyContext?.datos_json?.ncie?.unified ?? null;
  if (!unified) return createConversationState();
  const selectedService = unified.selectedService ?? null;
  const selectedCategory = unified.selectedCategory ?? selectedService?.categoria ?? null;
  const activeFlow = unified.flowId || selectedService
    ? {
      id: unified.flowId ?? `unified_service_${selectedService?.id ?? 'current'}`,
      status: unified.flowStatus ?? 'active',
      selectedService,
      selectedCategory,
      collectedEntities: unified.entities ?? {}
    }
    : null;
  return createConversationState({
    status: unified.currentState,
    selectedService,
    selectedCategory,
    activeFlow,
    collectedEntities: unified.entities ?? {},
    lastQuestionId: unified.lastQuestionId ?? null,
    lastQuestionText: unified.lastQuestionText ?? null,
    lastQuestionType: unified.lastQuestionType ?? unified.lastQuestionId ?? null,
    lastOptionsShown: unified.lastOptionsShown ?? [],
    questionHistory: unified.questionHistory ?? [],
    history: unified.history ?? []
  });
}

async function loadCompanyConfig({ empresaId, mcpClient }) {
  try {
    return (await mcpClient.callTool('obtener_configuracion_empresa', { empresa_id: empresaId }))?.empresa ?? null;
  } catch {
    return null;
  }
}

async function persistUnifiedState({
  empresaId,
  phone,
  state,
  executionPlan,
  executorResult,
  contextStore = { save: saveConversationContext }
}) {
  const stateAfter = executorResult.stateToPersist ?? executionPlan.persistencePlan?.stateAfter ?? executionPlan.stateAfter ?? null;
  const previousData = state?.legacyContext?.datos_json ?? {};
  const selectedService = executionPlan.selectedService ?? stateAfter?.selectedService ?? null;
  const selectedCategory = executionPlan.selectedCategory ?? stateAfter?.selectedCategory ?? selectedService?.categoria ?? null;
  const lastOptionsShown = executionPlan.responsePlan?.services
    ?? executionPlan.responsePlan?.options
    ?? stateAfter?.lastOptionsShown
    ?? state?.unified?.lastOptionsShown
    ?? [];
  const unified = {
    currentState: stateAfter?.status ?? executionPlan.nextState,
    selectedService,
    selectedCategory,
    lastOptionsShown,
    entities: stateAfter?.collectedEntities ?? {},
    lastQuestionId: stateAfter?.lastQuestionId ?? executionPlan.responsePlan?.questionId ?? null,
    lastQuestionText: stateAfter?.lastQuestionText ?? executionPlan.responsePlan?.question ?? null,
    lastQuestionType: stateAfter?.lastQuestionType ?? stateAfter?.lastQuestionId ?? executionPlan.responsePlan?.questionId ?? null,
    flowId: stateAfter?.activeFlow?.id ?? null,
    flowStatus: stateAfter?.activeFlow?.status ?? (selectedService ? 'active' : null),
    questionHistory: stateAfter?.questionHistory ?? [],
    history: stateAfter?.history ?? []
  };
  const datos = {
    ...previousData,
    ncie: {
      ...(previousData.ncie ?? {}),
      unified,
      unified_memory: mergeUsefulMemory(
        previousData.ncie?.unified_memory ?? {},
        executionPlan.persistencePlan?.activeMemoryUpdate ?? {}
      ),
      unified_execution_plan: {
        decisionId: executionPlan.decisionId,
        intent: executionPlan.intent,
        nextState: executionPlan.nextState,
        selectedService: executionPlan.selectedService,
        selectedCategory: executionPlan.selectedCategory,
        responsePlan: executionPlan.responsePlan,
        handoffPlan: executionPlan.handoffPlan
      },
      unified_canary_last_response: executorResult.responseText
    }
  };

  return contextStore.save({
    empresaId,
    phone,
    ultimaIntencion: executionPlan.intent,
    ultimoProductoId: null,
    ultimoServicioId: null,
    ultimoTextoBusqueda: null,
    datos
  });
}

async function saveUnifiedConversation({
  mcpClient,
  empresaId,
  phone,
  whatsappChatId,
  whatsappMessageId,
  contactName,
  message,
  response,
  executionPlan
}) {
  return mcpClient.callTool('guardar_conversacion', {
    empresa_id: empresaId,
    telefono: phone,
    whatsapp_id: whatsappChatId,
    whatsapp_message_id: whatsappMessageId,
    contact_name: contactName,
    mensaje: message,
    respuesta: response,
    estado: executionPlan.handoffPlan?.needed ? 'requires_human' : 'bot_active',
    tipo_mensaje: 'bot'
  });
}

function ownerDataText(executionPlan) {
  const summary = executionPlan.responsePlan?.quoteSummary ?? {};
  const entities = executionPlan.stateAfter?.collectedEntities ?? {};
  return [
    summary.measurementsOrQuantity && summary.measurementsOrQuantity !== 'Pendiente' ? summary.measurementsOrQuantity : null,
    summary.budget && summary.budget !== 'Pendiente' ? `presupuesto ${summary.budget}` : null,
    summary.design && summary.design !== 'Pendiente' ? `diseno ${summary.design}` : null,
    summary.installation && summary.installation !== 'Pendiente' ? `instalacion ${summary.installation}` : null,
    entities.objective ? `objetivo ${entities.objective}` : null
  ].filter(Boolean).join(', ') || 'pendiente';
}

function buildOwnerMessage({ executionPlan, normalizedMessage, phone, contactName, companyConfig, conversationId }) {
  const code = String(conversationId ?? phone ?? 'chat').replace(/[^a-z0-9]/gi, '').slice(-6) || 'chat';
  const summary = executionPlan.responsePlan?.quoteSummary ?? {};
  return [
    `Nueva solicitud - ${companyConfig?.nombre ?? 'Empresa'}`,
    `Cliente: ${contactName ?? phone}`,
    `Servicio: ${selectedServiceName(executionPlan.selectedService) ?? 'pendiente'}`,
    `Datos: ${ownerDataText(executionPlan)}`,
    `Estimado: ${summary.estimate ?? 'pendiente con asesor'}`,
    `Mensaje: ${normalizedMessage?.raw ?? normalizedMessage?.normalized ?? ''}`,
    `Responder: si ${code} / no ${code}`
  ].join('\n');
}

function buildAdvisorNotification({ executionPlan, normalizedMessage, phone, conversationId, contactName, companyConfig }) {
  if (!executionPlan.handoffPlan?.needed) {
    return {
      advisorNotificationRequired: false,
      advisorNotification: null,
      notificationReason: null,
      notificationPayload: null,
      notificationHash: null
    };
  }
  const ownerMessage = buildOwnerMessage({ executionPlan, normalizedMessage, phone, contactName, companyConfig, conversationId });
  const payload = {
    conversationId,
    phone,
    contactName,
    selectedService: selectedServiceName(executionPlan.selectedService),
    selectedServiceId: executionPlan.selectedService?.id ?? null,
    originalMessage: normalizedMessage?.raw ?? normalizedMessage?.normalized ?? '',
    lastUserMessage: normalizedMessage?.raw ?? normalizedMessage?.normalized ?? '',
    handoffSummary: ownerMessage,
    message: ownerMessage
  };
  return {
    advisorNotificationRequired: true,
    advisorNotification: {
      advisorNotificationRequired: true,
      notificationReason: executionPlan.handoffPlan.reason ?? 'handoff_explicit',
      notificationPayload: payload,
      notificationHash: `unified:${conversationId}:${executionPlan.decisionId}`
    },
    notificationReason: executionPlan.handoffPlan.reason ?? 'handoff_explicit',
    notificationPayload: payload,
    notificationHash: `unified:${conversationId}:${executionPlan.decisionId}`
  };
}

export async function runUnifiedPlannerCanary({
  empresaId,
  phone,
  message,
  normalizedMessage,
  whatsappChatId = null,
  whatsappMessageId = null,
  contactName = null,
  state,
  mcpClient,
  contextStore,
  persist = true,
  semanticClassifier = classifySemanticIntent,
  semanticConfig = semanticIntentConfig()
}) {
  const [catalog, companyConfig] = await Promise.all([
    loadFullServiceCatalog({ empresaId, mcpClient }),
    loadCompanyConfig({ empresaId, mcpClient })
  ]);
  const catalogHints = {
    services: catalog?.services ?? [],
    categories: catalog?.categories ?? []
  };
  const conversationId = whatsappChatId ?? phone;
  const conversationSnapshot = createConversationSnapshot({
    empresaId,
    conversationId,
    state: conversationStateFromUnifiedNamespace(state),
    activeMemory: {
      businessType: state?.legacyContext?.datos_json?.ncie?.unified_memory?.businessType ?? null,
      businessGoal: state?.legacyContext?.datos_json?.ncie?.unified_memory?.businessGoal ?? null,
      preferredCategory: state?.legacyContext?.datos_json?.ncie?.unified_memory?.preferredCategory ?? null,
      preferredServices: state?.legacyContext?.datos_json?.ncie?.unified_memory?.preferredServices ?? [],
      budgetRange: state?.legacyContext?.datos_json?.ncie?.unified_memory?.budgetRange ?? null,
      lastRecommendation: state?.legacyContext?.datos_json?.ncie?.unified_memory?.lastRecommendation ?? null,
      history: []
    },
    companyConfig,
    catalogSummary: {
      services: catalogHints.services.length,
      categories: catalogHints.categories.length
    }
  });
  const entities = extractEntities({ message: normalizedMessage, catalog: catalogHints, companyConfig });
  let semanticHints = null;
  let executionPlan = planConversation({
    message: normalizedMessage,
    entities,
    conversationSnapshot,
    catalogHints,
    companyConfig
  });
  if (shouldUseSemanticClassifier({
    message: normalizedMessage,
    entities,
    initialPlan: executionPlan,
    conversationSnapshot,
    lastBotQuestion: conversationSnapshot.state?.lastQuestionText,
    currentState: conversationSnapshot.state,
    config: semanticConfig
  })) {
    semanticHints = await semanticClassifier({
      empresaId,
      message: normalizedMessage,
      conversationSnapshot,
      config: semanticConfig
    });
    if (semanticHints?.intent && semanticHints?.used !== false && Number(semanticHints.confidence ?? 0) >= Number(semanticConfig.minConfidence ?? 0.85)) {
      logger.info('semantic_classifier_used', {
        empresaId,
        conversationId,
        intent: semanticHints.intent,
        confidence: semanticHints.confidence
      });
      executionPlan = planConversation({
        message: normalizedMessage,
        entities,
        semanticHints,
        conversationSnapshot,
        catalogHints,
        companyConfig
      });
    }
  }
  const executorResult = await executeExecutionPlan({
    executionPlan,
    retrievalAdapter: async (retrievalPlan) => ({
      services: catalogHints.services.filter((service) => {
        const queries = retrievalPlan.queries ?? [];
        if (!queries.length) return true;
        return queries.some((query) => normalize(service?.categoria).includes(normalize(query)) || normalize(service?.nombre).includes(normalize(query)));
      }),
      categories: catalogHints.categories
    }),
    mcpAdapter: async (mcpPlan) => ({
      tools: mcpPlan.tools ?? [],
      text: executionPlan.responsePlan?.question ?? null
    })
  });
  if (!String(executorResult.responseText ?? '').trim()) {
    throw new Error('Unified planner returned empty response');
  }

  if (executionPlan.intent === 'CLARIFY') {
    logger.info('unified_canary_clarify', {
      empresaId,
      conversationId,
      reason: executionPlan.reason,
      nextState: executionPlan.nextState
    });
  }
  if (executionPlan.responsePlan?.repeatedQuestion) {
    logger.info('unified_canary_repeated_question_prevented', {
      empresaId,
      conversationId,
      questionId: executionPlan.responsePlan.questionId,
      question: executionPlan.responsePlan.question
    });
  }
  if (executionPlan.reason === 'out_of_order_entity_handling') {
    logger.info('unified_canary_out_of_order_entity_handled', {
      empresaId,
      conversationId,
      selectedService: selectedServiceName(executionPlan.selectedService),
      nextState: executionPlan.nextState,
      entities: Object.keys(executionPlan.entities ?? {})
    });
  }
  if (executionPlan.handoffPlan?.needed) {
    logger.info('unified_canary_handoff_sent', {
      empresaId,
      conversationId,
      selectedService: selectedServiceName(executionPlan.selectedService),
      reason: executionPlan.handoffPlan.reason ?? null
    });
  }
  if (hasLegacyServiceRevival({ state, executionPlan })) {
    logger.warn('unified_canary_legacy_service_revived', {
      empresaId,
      conversationId,
      selectedService: selectedServiceName(executionPlan.selectedService),
      intent: executionPlan.intent,
      reason: executionPlan.reason
    });
  }

  let savedConversation = null;
  let savedState = null;
  if (persist) {
    savedConversation = await saveUnifiedConversation({
      mcpClient,
      empresaId,
      phone,
      whatsappChatId,
      whatsappMessageId,
      contactName,
      message,
      response: executorResult.responseText,
      executionPlan
    });
    savedState = await persistUnifiedState({
      empresaId,
      phone,
      state,
      executionPlan,
      executorResult,
      contextStore: contextStore ?? { save: saveConversationContext }
    });
  }

  const advisor = buildAdvisorNotification({
    executionPlan,
    normalizedMessage,
    phone,
    conversationId,
    contactName,
    companyConfig
  });
  const result = {
    respuesta: executorResult.responseText,
    medios: [],
    intencion: executionPlan.intent,
    tipo: 'unified_planner',
    herramienta_mcp: null,
    parametros: entities.entities,
    confianza: executionPlan.confidence,
    requiere_respuesta_ia: false,
    ncie: {
      unifiedCanary: true,
      entities,
      semanticHints,
      executionPlan,
      executorResult,
      selectedService: executionPlan.selectedService,
      selectedCategory: executionPlan.selectedCategory,
      nextState: executionPlan.nextState,
      statePersisted: savedState ?? null,
      advisorNotificationRequired: advisor.advisorNotificationRequired,
      notificationReason: advisor.notificationReason,
      notificationPayload: advisor.notificationPayload,
      notificationHash: advisor.notificationHash,
      advisorNotification: advisor.advisorNotification
    },
    mcp_result: {
      services: catalogHints.services,
      categories: catalogHints.categories
    },
    notificacion: null,
    lead_id: null,
    conversacion_id: savedConversation?.conversacion_id ?? null
  };

  logger.info('unified_canary_response_sent', {
    empresaId,
    conversationId,
    intent: executionPlan.intent,
    reason: executionPlan.reason,
    selectedService: selectedServiceName(executionPlan.selectedService),
    nextState: executionPlan.nextState,
    handoff: Boolean(executionPlan.handoffPlan?.needed),
    repeatedQuestionPrevented: Boolean(executionPlan.responsePlan?.repeatedQuestion),
    outOfOrderEntityHandled: executionPlan.reason === 'out_of_order_entity_handling',
    legacyServiceRevived: hasLegacyServiceRevival({ state, executionPlan })
  });

  const memoryUpdate = executionPlan.persistencePlan?.activeMemoryUpdate ?? {};
  if (executionPlan.responsePlan?.type === 'recommendation_options') {
    logger.info('unified_recommendation_generated', {
      empresaId,
      conversationId,
      objective: executionPlan.responsePlan.objective ?? null,
      budget: executionPlan.responsePlan.budget ?? null,
      options: (executionPlan.responsePlan.recommendations ?? []).map((entry) => selectedServiceName(entry.service))
    });
    logger.info('recommendation_generated', {
      empresaId,
      conversationId,
      recommendation_generated: true,
      businessType: executionPlan.responsePlan.businessType ?? null,
      businessGoal: executionPlan.responsePlan.objective ?? null
    });
    logger.info('recommendation_explained', {
      empresaId,
      conversationId,
      recommendation_explained: Boolean(executionPlan.responsePlan.recommendationExplained)
    });
  }
  if (executionPlan.responsePlan?.type === 'quote_summary') {
    logger.info('unified_quote_summary_generated', {
      empresaId,
      conversationId,
      selectedService: selectedServiceName(executionPlan.selectedService),
      estimate: executionPlan.responsePlan.quoteSummary?.estimate ?? null
    });
  }
  if (hasUsefulMemory(memoryUpdate)) {
    logger.info('unified_memory_enriched', {
      empresaId,
      conversationId,
      fields: Object.keys(memoryUpdate).filter((key) => key !== 'mode' && memoryUpdate[key] !== null && memoryUpdate[key] !== undefined)
    });
  }
  for (const item of Object.values(entities.entities ?? {})) {
    if (item?.metadata?.synonymMatched) {
      logger.info('unified_synonym_matched', {
        empresaId,
        conversationId,
        entity: item.name,
        term: item.metadata.synonymTerm,
        configurable: Boolean(item.metadata.configurable)
      });
    }
  }
  logger.info('unified_emoji_mode_applied', {
    empresaId,
    conversationId,
    emojiMode: executionPlan.responsePlan?.emojiMode ?? null
  });
  logger.info('unified_conversation_quality_score', {
    empresaId,
    conversationId,
    score: qualityScoreFor({ executionPlan, executorResult }),
    responsePlanType: executionPlan.responsePlan?.type ?? null
  });
  logger.info('commercial_quality_score', {
    empresaId,
    conversationId,
    commercial_quality_score: qualityScoreFor({ executionPlan, executorResult }),
    responsePlanType: executionPlan.responsePlan?.type ?? null
  });
  if (executionPlan.responsePlan?.businessType || executionPlan.stateAfter?.collectedEntities?.businessType) {
    logger.info('business_type_detected', {
      empresaId,
      conversationId,
      business_type_detected: true,
      businessType: executionPlan.responsePlan?.businessType ?? executionPlan.stateAfter?.collectedEntities?.businessType ?? null
    });
  }
  if (executionPlan.responsePlan?.objective || executionPlan.stateAfter?.collectedEntities?.businessGoal || executionPlan.stateAfter?.collectedEntities?.objective) {
    logger.info('business_goal_detected', {
      empresaId,
      conversationId,
      business_goal_detected: true,
      businessGoal: executionPlan.responsePlan?.objective ?? executionPlan.stateAfter?.collectedEntities?.businessGoal ?? executionPlan.stateAfter?.collectedEntities?.objective ?? null
    });
  }

  return result;
}
