import { mcpClient as defaultMcpClient } from '../mcp/mcpClient.js';
import { logger } from '../utils/logger.js';
import { normalizeIncomingMessage } from './message-normalizer.js';
import { loadConversationState, saveConversationState } from './conversation-state.manager.js';
import { interpretNlu } from './nlu.interpreter.js';
import { decisionFromCommercialReasoning, reasonCommercially } from './commercial-reasoner.js';
import { loadServiceById, retrieveConversationData } from './retrieval.service.js';
import { decideNextAction } from './decision-engine.js';
import { planResponse } from './response-planner.js';
import { generateResponse } from './response-generator.js';
import { NCIE_ACTIONS, NCIE_TYPES } from './conversation-engine.types.js';
import { getBotResponseProfile } from '../modules/bot-prompts/bot-prompts.service.js';
import {
  isConversationPlannerAuthorityEnabled,
  isConversationPlannerShadowEnabled,
  logPlannerAuthorityDecision,
  logPlannerShadowDecision,
  planCommercialConversation
} from './planner/commercial-conversation-planner.js';
import { normalizePlannerState } from './planner/commercial-state.schema.js';
import { currentWaitingField, interpretResponseForWaitingField } from './planner/response-interpreter.js';
import { planAdvisorNotification } from './advisor-notification.js';
import { routeConversationMessage } from './conversation-router.js';

function emptyRetrieval({ commercialReasoning = null } = {}) {
  return {
    company: null,
    services: [],
    products: [],
    categories: [],
    queries: [],
    semantic: { terms: [], matchedVerticals: [] },
    commercialReasoning,
    partialMatches: false,
    contextMatches: { service: null, product: null },
    retrievalMode: 'planner_authority_skipped'
  };
}

function commercialReasoningForPlannerRetrieval(plannerDecision, fallback) {
  if (!plannerDecision) return fallback;
  return {
    ...(fallback ?? {}),
    conversation_goal: plannerDecision.goal,
    conversation_stage: plannerDecision.stage,
    retrieval_strategy: ['business_summary', 'catalog_listing'].includes(plannerDecision.responsePlanType) ? 'business_summary' : 'domain_search',
    recommended_action: ['business_summary', 'catalog_listing'].includes(plannerDecision.responsePlanType) ? 'summarize_business' : 'search_domain',
    need_clarification: false
  };
}

function plannerServiceNeedsHydration(service) {
  if (!service?.id) return false;
  const type = String(service?.tipo_precio ?? '').toUpperCase();
  if (type === 'COTIZACION') return false;
  return service.precio === undefined || service.precio === null || service.precio === '';
}

function mergeHydratedPlannerService(plannerDecision, service) {
  if (!plannerDecision || !service) return plannerDecision;
  const current = plannerDecision.selectedServiceItem ?? plannerDecision.selectedService ?? {};
  const merged = {
    ...service,
    ...current,
    precio: current.precio ?? service.precio,
    tipo_precio: current.tipo_precio ?? service.tipo_precio,
    unidad_medida: current.unidad_medida ?? service.unidad_medida,
    requiere_medidas: current.requiere_medidas ?? service.requiere_medidas,
    requiere_cantidad: current.requiere_cantidad ?? service.requiere_cantidad,
    incluye: current.incluye ?? service.incluye,
    no_incluye: current.no_incluye ?? service.no_incluye,
    notas_cotizacion: current.notas_cotizacion ?? service.notas_cotizacion,
    precio_minimo: current.precio_minimo ?? service.precio_minimo
  };
  return {
    ...plannerDecision,
    selectedServiceItem: merged
  };
}

function stateWithoutActiveSelection(state = {}) {
  return {
    ...state,
    lastServiceId: null,
    lastService: null,
    lastProductId: null,
    lastProduct: null,
    lastServices: [],
    lastProducts: [],
    commercial: {
      ...(state?.commercial ?? {}),
      activeServiceId: null,
      activeServiceName: null,
      activeProductId: null,
      activeProductName: null,
      activeDomain: null,
      lastDomain: null,
      customerGoal: null,
      lastQuoteContext: null,
      lastBotQuestion: null,
      lastQuestion: null
    }
  };
}

function plannerDefersToCurrentNcie(plannerDecision) {
  return plannerDecision?.responsePlanType === 'defer_to_ncie';
}

function needsConfiguredGreeting(responsePlan) {
  return responsePlan?.type === 'neutral_greeting';
}

async function loadConfiguredGreetingContext({ empresaId, mcpClient }) {
  try {
    const result = await mcpClient.callTool('obtener_configuracion_empresa', { empresa_id: empresaId });
    const responseProfile = mcpClient === defaultMcpClient
      ? await getBotResponseProfile(empresaId).catch(() => null)
      : null;
    return {
      ...(result?.empresa ?? {}),
      response_profile: responseProfile
    };
  } catch (error) {
    logger.error('ncie_greeting_context_load_failed', { empresaId, error });
    return null;
  }
}

async function hydratePlannerDecisionService({ empresaId, plannerDecision, mcpClient }) {
  const selected = plannerDecision?.selectedServiceItem ?? plannerDecision?.selectedService ?? null;
  if (!plannerServiceNeedsHydration(selected)) return plannerDecision;

  const hydrated = await loadServiceById({ empresaId, serviceId: selected.id, mcpClient });
  if (!hydrated) return plannerDecision;

  logger.info('ncie_planner_service_hydrated', {
    empresaId,
    serviceId: selected.id,
    serviceName: hydrated.nombre ?? selected.nombre ?? null
  });
  return mergeHydratedPlannerService(plannerDecision, hydrated);
}

async function validateStateAfterSave({
  empresaId,
  phone,
  stateBefore,
  responsePlan,
  plannerDecision,
  contextStore
}) {
  const beforePlannerState = normalizePlannerState({ state: stateBefore, empresaId, conversationId: phone });
  const beforeActiveFlow = beforePlannerState.activeFlowId;
  if (!beforeActiveFlow) return null;

  const after = await loadConversationState({ empresaId, phone, contextStore });
  const afterPlannerState = normalizePlannerState({ state: after, empresaId, conversationId: phone });
  if (afterPlannerState.activeFlowId) return after;

  const allowedReason = responsePlan?.flowCloseReason ?? plannerDecision?.flowCloseReason ?? (
    plannerDecision?.explicitTopicChange || responsePlan?.type === 'catalog_listing' ? 'explicit_topic_change' : null
  );
  if (allowedReason === 'flow_completed' || allowedReason === 'explicit_topic_change') return after;

  logger.error('ncie_state_corruption_prevented', {
    empresaId,
    previousActiveFlow: beforeActiveFlow,
    responsePlanType: responsePlan?.type ?? null,
    reason: 'state_after_save_lost_active_flow'
  });

  const previousContext = stateBefore?.legacyContext;
  if (!previousContext?.datos_json) return after;
  await contextStore.save({
    empresaId,
    phone,
    ultimaIntencion: previousContext.ultima_intencion ?? null,
    ultimoProductoId: previousContext.ultimo_producto_id ?? null,
    ultimoServicioId: previousContext.ultimo_servicio_id ?? null,
    ultimoTextoBusqueda: previousContext.ultimo_texto_busqueda ?? null,
    datos: previousContext.datos_json
  });
  return loadConversationState({ empresaId, phone, contextStore });
}

async function saveConversation({ mcpClient, empresaId, phone, whatsappChatId, whatsappMessageId, contactName, message, response, decision }) {
  return mcpClient.callTool('guardar_conversacion', {
    empresa_id: empresaId,
    telefono: phone,
    whatsapp_id: whatsappChatId,
    whatsapp_message_id: whatsappMessageId,
    contact_name: contactName,
    mensaje: message,
    respuesta: response,
    estado: decision.action === NCIE_ACTIONS.ESCALATE_HUMAN ? 'requires_human' : 'bot_active',
    tipo_mensaje: 'bot'
  });
}

async function maybeCreateLead({ mcpClient, empresaId, phone, whatsappChatId, contactName, nlu, decision, state, response }) {
  if (!decision.shouldCreateLead) return null;

  const result = await mcpClient.callTool('crear_lead', {
    empresa_id: empresaId,
    telefono: phone,
    whatsapp_id: whatsappChatId,
    contact_name: contactName,
    nombre_cliente: contactName,
    interes: decision.needSummary ?? nlu.entities?.service ?? nlu.entities?.product ?? response.summary ?? 'Consulta por WhatsApp',
    producto_id: decision.selectedType === NCIE_TYPES.PRODUCT ? state?.lastProductId ?? undefined : undefined,
    servicio_id: decision.selectedType === NCIE_TYPES.SERVICE ? state?.lastServiceId ?? undefined : undefined
  });

  return result;
}

export async function runConversationEngine({
  empresaId,
  phone,
  message,
  whatsappChatId = null,
  whatsappMessageId = null,
  contactName = null,
  mcpClient = defaultMcpClient,
  contextStore = undefined,
  persist = true
}) {
  logger.info('ncie_message_received', { empresaId, phone });
  const normalizedMessage = normalizeIncomingMessage({ message, contactName, phone });
  const state = await loadConversationState({ empresaId, phone, contextStore });
  logger.info('ncie_conversation_state_loaded', {
    empresaId,
    conversationId: whatsappChatId ?? phone,
    activeFlow: state?.commercial?.plannerState?.activeFlowId ?? null,
    waitingField: state?.commercial?.plannerState?.waitingField ?? null
  });
  const plannerStateForInput = normalizePlannerState({ state, empresaId, conversationId: whatsappChatId ?? phone });
  logger.info('ncie_state_before', {
    empresaId,
    conversationId: whatsappChatId ?? phone,
    activeFlow: plannerStateForInput.activeFlowId ?? null,
    selectedService: plannerStateForInput.selectedService?.nombre ?? null,
    waitingField: plannerStateForInput.waitingField ?? null,
    currentEstimate: plannerStateForInput.currentEstimate ?? null
  });
  const routed = await routeConversationMessage({
    empresaId,
    phone: whatsappChatId ?? phone,
    state,
    normalizedMessage,
    plannerState: plannerStateForInput,
    pendingOptions: state?.commercial?.lastOptionsShown ?? [],
    mcpClient
  });
  if (routed.handled) {
    const nlu = routed.nlu;
    const decision = routed.decision;
    const retrieval = routed.retrieval;
    const responsePlan = routed.responsePlan;
    const plannerAuthorityDecision = routed.plannerDecision;
    const commercialReasoning = {
      conversation_goal: responsePlan?.type === 'service_explanation' ? 'find_solution' : plannerAuthorityDecision?.goal ?? 'cotizar',
      conversation_stage: plannerAuthorityDecision?.stage ?? 'cotizacion',
      retrieval_strategy: 'deterministic_router',
      recommended_action: 'answer_from_context',
      need_clarification: false
    };
    logger.info('ncie_deterministic_router_short_circuit', {
      empresaId,
      reason: routed.reason,
      routeMessage_resolved: true,
      route_conversation_message_handled: true,
      ncie_skipped_retrieval_due_to_waiting_field: true,
      retrievalSkipped: true
    });
    logger.info('ncie_response_planned', { empresaId, type: responsePlan.type });
    const generated = generateResponse({ nlu, retrieval, decision, state, commercialReasoning, responsePlan });
    logger.info('ncie_response_generated', { empresaId, hasResponse: Boolean(generated.respuesta) });
    const advisorNotification = planAdvisorNotification({
      phone,
      conversationId: whatsappChatId ?? phone,
      contactName,
      normalizedMessage,
      state,
      nlu,
      decision,
      plannerDecision: plannerAuthorityDecision,
      responsePlan
    });

    let savedConversation = null;
    let lead = null;
    if (persist) {
      savedConversation = await saveConversation({
        mcpClient,
        empresaId,
        phone,
        whatsappChatId,
        whatsappMessageId,
        contactName,
        message,
        response: generated.respuesta,
        decision
      });
      lead = await maybeCreateLead({
        mcpClient,
        empresaId,
        phone,
        whatsappChatId,
        contactName,
        nlu,
        decision,
        state,
        response: generated
      });
      const savedState = await saveConversationState({
        empresaId,
        phone,
        state,
        nlu,
        decision,
        retrieval,
        response: generated,
        commercialReasoning,
        responsePlan,
        plannerDecision: plannerAuthorityDecision,
        advisorNotification,
        contextStore
      });
      await validateStateAfterSave({
        empresaId,
        phone,
        stateBefore: state,
        responsePlan,
        plannerDecision: plannerAuthorityDecision,
        contextStore
      });
      const savedDatos = savedState?.datos_json ?? savedState?.datos ?? {};
      logger.info('ncie_active_memory_updated', {
        empresaId,
        activeServiceId: savedState?.ultimoServicioId ?? null,
        activeServiceName: savedDatos?.ncie?.active_service_name ?? null,
        activeDomain: savedDatos?.ncie?.active_domain ?? null,
        lastBotQuestion: savedDatos?.ncie?.last_bot_question ?? null
      });
    }

    return {
      respuesta: generated.respuesta,
      medios: generated.medios,
      intencion: nlu.intent,
      tipo: nlu.type,
      herramienta_mcp: null,
      parametros: nlu.entities,
      confianza: nlu.confidence,
      requiere_respuesta_ia: false,
      ncie: {
        nlu,
        commercialReasoning,
        retrieval,
        responsePlan,
        decision,
        advisorNotificationRequired: advisorNotification.advisorNotificationRequired,
        notificationReason: advisorNotification.notificationReason,
        notificationPayload: advisorNotification.notificationPayload,
        notificationHash: advisorNotification.notificationHash,
        advisorNotification,
        plannerShadowDecision: isConversationPlannerShadowEnabled() ? plannerAuthorityDecision : null,
        plannerAuthorityDecision
      },
      mcp_result: retrieval,
      notificacion: null,
      lead_id: lead?.lead_id ?? null,
      conversacion_id: savedConversation?.conversacion_id ?? null
    };
  }
  const waitingField = currentWaitingField(plannerStateForInput);
  const contextualResponse = waitingField
    ? interpretResponseForWaitingField({
      waitingField,
      normalizedMessage,
      plannerState: plannerStateForInput,
      pendingOptions: state?.commercial?.lastOptionsShown ?? []
    })
    : { handled: false };
  let nlu = null;
  if (contextualResponse.handled) {
    logger.info('ncie_waiting_field_detected', { empresaId, waitingField });
    logger.info('ncie_response_interpreted', {
      empresaId,
      waitingField,
      entities: contextualResponse.entities,
      confidence: contextualResponse.confidence
    });
    nlu = {
      intent: contextualResponse.entities?.handoffRequested
        ? 'HABLAR_ASESOR'
        : contextualResponse.entities?.advisorConfirmation === false
          ? 'ASESOR_DECLINADO'
          : contextualResponse.ambiguous ? 'RESPUESTA_AMBIGUA_CONTEXTO' : 'RESPUESTA_CONTEXTO',
      type: 'unknown',
      confidence: contextualResponse.confidence,
      entities: contextualResponse.entities,
      missing_data: []
    };
    if (contextualResponse.entities?.dimensions) {
      logger.info('ncie_dimension_parsed', {
        empresaId,
        dimensions: contextualResponse.entities.dimensions
      });
    }
  } else {
    nlu = await interpretNlu({ normalizedMessage, state });
  }
  logger.info('ncie_nlu_result', { empresaId, intent: nlu.intent, type: nlu.type, confidence: nlu.confidence });
  const plannerAuthorityEnabled = isConversationPlannerAuthorityEnabled();
  const plannerShadowEnabled = isConversationPlannerShadowEnabled();
  let plannerShadowDecision = null;
  let plannerAuthorityDecision = null;
  let plannerAuthorityActive = false;
  if (plannerAuthorityEnabled) {
    logger.info('ncie_planner_authority_enabled', { empresaId });
    try {
      plannerAuthorityDecision = planCommercialConversation({
        empresaId,
        conversationId: whatsappChatId ?? phone,
        normalizedMessage,
        nlu,
        state,
        phase: 'pre_retrieval'
      });
      plannerAuthorityActive = true;
      logPlannerAuthorityDecision({ empresaId, decision: plannerAuthorityDecision });
    } catch (error) {
      logger.error('ncie_planner_authority_error', { empresaId, phase: 'pre_retrieval', error });
      logger.info('ncie_planner_authority_fallback', { empresaId, reason: 'pre_retrieval_error' });
    }
  }
  if (plannerShadowEnabled) {
    try {
      plannerShadowDecision = planCommercialConversation({
        empresaId,
        conversationId: whatsappChatId ?? phone,
        normalizedMessage,
        nlu,
        state,
        phase: 'pre_retrieval'
      });
      logPlannerShadowDecision({ empresaId, decision: plannerShadowDecision });
    } catch (error) {
      logger.error('ncie_planner_shadow_failed', { empresaId, phase: 'pre_retrieval', error });
    }
  }
  const reasoningState = plannerAuthorityActive && plannerDefersToCurrentNcie(plannerAuthorityDecision)
    ? stateWithoutActiveSelection(state)
    : state;
  const commercialReasoning = reasonCommercially({ nlu, normalizedMessage, state: reasoningState });
  logger.info('ncie_commercial_reasoned', {
    empresaId,
    goal: commercialReasoning.conversation_goal,
    stage: commercialReasoning.conversation_stage,
    action: commercialReasoning.recommended_action,
    retrievalStrategy: commercialReasoning.retrieval_strategy
  });

  const effectiveCommercialReasoning = plannerAuthorityActive
    ? commercialReasoningForPlannerRetrieval(plannerAuthorityDecision, commercialReasoning)
    : commercialReasoning;
  const skipRetrievalForDiagnosis = plannerAuthorityActive &&
    plannerAuthorityDecision?.responsePlanType === 'consultative_diagnosis' &&
    !plannerAuthorityDecision?.retrievalNeeded;
  if (skipRetrievalForDiagnosis) {
    logger.info('ncie_retrieval_skipped_for_diagnosis', {
      empresaId,
      reason: plannerAuthorityDecision?.retrievalPolicy?.reason ?? null
    });
  }
  const retrieval = plannerAuthorityActive && !plannerAuthorityDecision?.retrievalNeeded
    ? emptyRetrieval({ commercialReasoning: effectiveCommercialReasoning })
    : await retrieveConversationData({
      empresaId,
      nlu,
      normalizedMessage,
      state,
      commercialReasoning: effectiveCommercialReasoning,
      mcpClient
    });
  logger.info('ncie_retrieval_result', {
    empresaId,
    services: retrieval.services.length,
    products: retrieval.products.length,
    categories: retrieval.categories.length
  });
  if (plannerShadowEnabled) {
    try {
      plannerShadowDecision = planCommercialConversation({
        empresaId,
        conversationId: whatsappChatId ?? phone,
        normalizedMessage,
        nlu,
        state,
        retrieval,
        phase: 'post_retrieval'
      });
      logPlannerShadowDecision({ empresaId, decision: plannerShadowDecision });
    } catch (error) {
      logger.error('ncie_planner_shadow_failed', { empresaId, phase: 'post_retrieval', error });
    }
  }
  if (plannerAuthorityActive) {
    try {
      plannerAuthorityDecision = planCommercialConversation({
        empresaId,
        conversationId: whatsappChatId ?? phone,
        normalizedMessage,
        nlu,
        state,
        retrieval,
        phase: 'post_retrieval'
      });
      plannerAuthorityDecision = await hydratePlannerDecisionService({
        empresaId,
        plannerDecision: plannerAuthorityDecision,
        mcpClient
      });
      logPlannerAuthorityDecision({ empresaId, decision: plannerAuthorityDecision });
      if (plannerAuthorityDecision?.detectedDimensions) {
        logger.info('ncie_dimension_parsed', {
          empresaId,
          dimensions: plannerAuthorityDecision.detectedDimensions
        });
      }
      if (plannerAuthorityDecision?.activeFlow?.currentEstimate) {
        logger.info('ncie_estimate_calculated', {
          empresaId,
          estimate: plannerAuthorityDecision.activeFlow.currentEstimate
        });
      }
      const beforeService = plannerStateForInput.selectedService?.nombre ?? null;
      const afterService = plannerAuthorityDecision?.selectedService?.nombre ?? plannerAuthorityDecision?.activeFlow?.selectedServiceName ?? null;
      if (beforeService && afterService && beforeService === afterService) {
        logger.info('ncie_service_preserved', { empresaId, selectedService: afterService });
      } else if (beforeService && afterService && beforeService !== afterService) {
        logger.info('ncie_service_changed_explicitly', { empresaId, from: beforeService, to: afterService });
      }
    } catch (error) {
      plannerAuthorityActive = false;
      plannerAuthorityDecision = null;
      logger.error('ncie_planner_authority_error', { empresaId, phase: 'post_retrieval', error });
      logger.info('ncie_planner_authority_fallback', { empresaId, reason: 'post_retrieval_error' });
    }
  }

  const responseState = plannerAuthorityActive && plannerDefersToCurrentNcie(plannerAuthorityDecision)
    ? stateWithoutActiveSelection(state)
    : state;
  let decision = commercialReasoning
    ? decisionFromCommercialReasoning({ commercialReasoning, nlu, retrieval, state: responseState })
    : decideNextAction({ nlu, retrieval, state: responseState });
  if (nlu.intent === 'HABLAR_ASESOR') {
    decision = {
      ...decision,
      action: NCIE_ACTIONS.ESCALATE_HUMAN,
      shouldCreateLead: true
    };
  }
  logger.info('ncie_decision', { empresaId, action: decision.action, selectedType: decision.selectedType });
  if (decision.action === NCIE_ACTIONS.ESCALATE_HUMAN) {
    logger.info('ncie_handoff_requested', { empresaId, conversationId: whatsappChatId ?? phone });
  }
  if (decision.action === NCIE_ACTIONS.ASK_CLARIFYING_QUESTION && nlu.confidence < 0.65) {
    logger.info('ncie_low_confidence_clarification', {
      empresaId,
      intent: nlu.intent,
      type: nlu.type,
      confidence: nlu.confidence
    });
  }
  if (decision.falseNegativeRisk || ((retrieval.services.length + retrieval.products.length) === 0 && (nlu.entities?.problem || nlu.entities?.symptom))) {
    logger.info('ncie_false_negative_risk', {
      empresaId,
      problem: nlu.entities?.problem ?? null,
      symptom: nlu.entities?.symptom ?? null,
      action: decision.action
    });
  }

  let responsePlan = planResponse({
    nlu,
    retrieval,
    decision,
    state: responseState,
    commercialReasoning: effectiveCommercialReasoning,
    normalizedMessage,
    plannerDecision: plannerAuthorityActive ? plannerAuthorityDecision : null
  });
  if (needsConfiguredGreeting(responsePlan)) {
    const greetingContext = retrieval.company ?? await loadConfiguredGreetingContext({ empresaId, mcpClient });
    responsePlan = planResponse({
      nlu,
      retrieval: {
        ...retrieval,
        company: greetingContext ?? retrieval.company
      },
      decision,
      state: responseState,
      commercialReasoning: effectiveCommercialReasoning,
      normalizedMessage,
      plannerDecision: plannerAuthorityActive ? plannerAuthorityDecision : null
    });
  }
  logger.info('ncie_response_planned', { empresaId, type: responsePlan.type });
  const generated = generateResponse({ nlu, retrieval, decision, state: responseState, commercialReasoning, responsePlan });
  logger.info('ncie_response_generated', { empresaId, hasResponse: Boolean(generated.respuesta) });
  const advisorNotification = planAdvisorNotification({
    phone,
    conversationId: whatsappChatId ?? phone,
    contactName,
    normalizedMessage,
    state,
    nlu,
    decision,
    plannerDecision: plannerAuthorityActive ? plannerAuthorityDecision : null,
    responsePlan
  });
  if (advisorNotification.advisorNotificationRequired) {
    logger.info('ncie_advisor_notification_required', {
      empresaId,
      reason: advisorNotification.notificationReason,
      selectedService: advisorNotification.notificationPayload?.selectedService ?? null,
      currentEstimate: advisorNotification.notificationPayload?.currentEstimate ?? null
    });
  } else if (advisorNotification.skippedDuplicate) {
    logger.info('ncie_advisor_notification_skipped_duplicate', {
      empresaId,
      reason: advisorNotification.notificationReason
    });
  }

  let savedConversation = null;
  let lead = null;

  if (persist) {
    savedConversation = await saveConversation({
      mcpClient,
      empresaId,
      phone,
      whatsappChatId,
      whatsappMessageId,
      contactName,
      message,
      response: generated.respuesta,
      decision
    });

    lead = await maybeCreateLead({
      mcpClient,
      empresaId,
      phone,
      whatsappChatId,
      contactName,
      nlu,
      decision,
      state,
      response: generated
    });

    const savedState = await saveConversationState({
      empresaId,
      phone,
      state,
      nlu,
      decision,
      retrieval,
      response: generated,
      commercialReasoning,
      responsePlan,
      plannerDecision: plannerAuthorityActive ? plannerAuthorityDecision : null,
      advisorNotification,
      contextStore
    });
    await validateStateAfterSave({
      empresaId,
      phone,
      stateBefore: state,
      responsePlan,
      plannerDecision: plannerAuthorityActive ? plannerAuthorityDecision : null,
      contextStore
    });
    if (plannerAuthorityActive) {
      logger.info('ncie_planner_state_committed', {
        empresaId,
        activeFlow: plannerAuthorityDecision?.activeFlow ?? null,
        responsePlanType: plannerAuthorityDecision?.responsePlanType ?? null
      });
    }
    const savedDatos = savedState?.datos_json ?? savedState?.datos ?? {};
    logger.info('ncie_active_memory_updated', {
      empresaId,
      activeServiceId: savedState?.ultimoServicioId ?? null,
      activeServiceName: savedDatos?.ncie?.active_service_name ?? null,
      activeDomain: savedDatos?.ncie?.active_domain ?? null,
      lastBotQuestion: savedDatos?.ncie?.last_bot_question ?? null
    });
    logger.info('ncie_state_after', {
      empresaId,
      conversationId: whatsappChatId ?? phone,
      activeFlow: savedDatos?.ncie?.planner_state?.activeFlowId ?? null,
      selectedService: savedDatos?.ncie?.active_service_name ?? null,
      waitingField: savedDatos?.ncie?.planner_state?.waitingField ?? null,
      currentEstimate: savedDatos?.ncie?.planner_state?.currentEstimate ?? null
    });
    logger.info('ncie_commercial_stage_updated', {
      empresaId,
      stage: decision.funnelStage,
      previousStage: state.funnelStage
    });
  }

  return {
    respuesta: generated.respuesta,
    medios: generated.medios,
    intencion: nlu.intent,
    tipo: nlu.type,
    herramienta_mcp: null,
    parametros: nlu.entities,
    confianza: nlu.confidence,
    requiere_respuesta_ia: false,
    ncie: {
      nlu,
      commercialReasoning,
      retrieval,
      responsePlan,
      decision,
      advisorNotificationRequired: advisorNotification.advisorNotificationRequired,
      notificationReason: advisorNotification.notificationReason,
      notificationPayload: advisorNotification.notificationPayload,
      notificationHash: advisorNotification.notificationHash,
      advisorNotification,
      plannerShadowDecision,
      plannerAuthorityDecision: plannerAuthorityActive ? plannerAuthorityDecision : null
    },
    mcp_result: retrieval,
    notificacion: null,
    lead_id: lead?.lead_id ?? null,
    conversacion_id: savedConversation?.conversacion_id ?? null
  };
}
