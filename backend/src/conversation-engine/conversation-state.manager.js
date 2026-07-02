import {
  findConversationContext,
  saveConversationContext
} from '../bot/conversationContext.service.js';
import { logger } from '../utils/logger.js';
import { logLegacyDecisionDetected } from './legacy-decision-warning.js';
import { NCIE_FUNNEL_STAGES } from './conversation-engine.types.js';
import {
  COMMERCIAL_PLANNER_GOALS,
  COMMERCIAL_PLANNER_STAGES,
  activeFlow,
  emptyPlannerState,
  waitingFieldFromMissing
} from './planner/commercial-state.schema.js';

/**
 * Legacy compatibility boundary.
 *
 * @deprecated LegacyOnly state fields (`activeFlow`, `waitingField`, `active_service_*`)
 * remain for rollback/non-canary compatibility. Unified Planner persists canonical
 * state under `datos_json.ncie.unified` and must not use these fields as authority.
 */

function parseData(context) {
  return context?.datos_json && typeof context.datos_json === 'object'
    ? context.datos_json
    : {};
}

function serviceFromFlow(flow = null, fallback = null) {
  if (!flow?.selectedServiceName && !flow?.selectedServiceId) return null;
  return {
    ...(fallback ?? {}),
    id: flow.selectedServiceId ?? fallback?.id ?? null,
    nombre: flow.selectedServiceName ?? fallback?.nombre ?? null,
    categoria: flow.selectedCategory ?? fallback?.categoria ?? null,
    tipo_precio: flow.servicePriceType ?? fallback?.tipo_precio ?? null,
    precio: flow.servicePrice ?? fallback?.precio ?? null,
    unidad_medida: flow.unitMeasure ?? fallback?.unidad_medida ?? null,
    requiere_medidas: flow.requiresMeasurements ?? fallback?.requiere_medidas ?? null,
    requiere_cantidad: flow.requiresQuantity ?? fallback?.requiere_cantidad ?? null
  };
}

function quoteContextFromFlow(flow = null, previousQuoteContext = null) {
  if (!flow) return previousQuoteContext ?? null;
  const estimate = flow.currentEstimate ?? null;
  return {
    ...(previousQuoteContext ?? {}),
    ...(flow.quotationDraft ?? {}),
    service_id: flow.selectedServiceId ?? previousQuoteContext?.service_id ?? null,
    service_name: flow.selectedServiceName ?? previousQuoteContext?.service_name ?? null,
    dimensions: flow.entities?.dimensions ?? estimate?.dimensions ?? previousQuoteContext?.dimensions ?? null,
    quantity: flow.entities?.quantity ?? previousQuoteContext?.quantity ?? null,
    unit_price: estimate?.unitPrice ?? previousQuoteContext?.unit_price ?? null,
    total: estimate?.total ?? previousQuoteContext?.total ?? null,
    design_support: flow.entities?.designSupport ?? flow.entities?.design ?? previousQuoteContext?.design_support ?? null,
    installation: flow.entities?.installation ?? previousQuoteContext?.installation ?? null
  };
}

function guardPlannerStateIntegrity({
  empresaId,
  previousPlannerState = null,
  nextPlannerState = null,
  responsePlan = null
}) {
  const previousFlow = activeFlow(previousPlannerState);
  if (!nextPlannerState) return nextPlannerState;
  const nextFlow = activeFlow(nextPlannerState);
  const explicitReset = [
    'clarify_need',
    'consultative_diagnosis',
    'economic_category_question',
    'recommendation_goal_question',
    'personalized_products_summary',
    'catalog_listing'
  ].includes(responsePlan?.type) && !responsePlan?.selected;
  if (previousFlow && !nextFlow && !explicitReset) {
    logLegacyDecisionDetected({
      module: 'conversation-state.manager',
      responsibility: 'active_flow_integrity_guard',
      decision: previousFlow.id,
      empresaId,
      reason: 'active_flow_would_be_cleared'
    });
    logger.error('ncie_state_corruption_prevented', {
      empresaId,
      previousActiveFlow: previousFlow.id,
      responsePlanType: responsePlan?.type ?? null,
      reason: 'active_flow_would_be_cleared'
    });
    return {
      ...nextPlannerState,
      activeFlowId: previousFlow.id,
      flows: [
        ...(nextPlannerState.flows ?? []).filter((flow) => flow.id !== previousFlow.id),
        previousFlow
      ],
      selectedCategory: nextPlannerState.selectedCategory ?? previousFlow.selectedCategory ?? null,
      selectedService: nextPlannerState.selectedService ?? serviceFromFlow(previousFlow, null),
      currentEstimate: nextPlannerState.currentEstimate ?? previousFlow.currentEstimate ?? null,
      waitingField: nextPlannerState.waitingField ?? previousFlow.waitingField ?? waitingFieldFromMissing(previousFlow.missing ?? [])
    };
  }

  if (!nextFlow) return nextPlannerState;
  const guardedWaitingField = nextFlow.waitingField ?? waitingFieldFromMissing(nextFlow.missing ?? []);
  return {
    ...nextPlannerState,
    selectedCategory: nextPlannerState.selectedCategory ?? nextFlow.selectedCategory ?? null,
    selectedService: nextPlannerState.selectedService ?? serviceFromFlow(nextFlow, null),
    currentEstimate: nextPlannerState.currentEstimate ?? nextFlow.currentEstimate ?? null,
    waitingField: nextPlannerState.waitingField ?? guardedWaitingField ?? null,
    flows: (nextPlannerState.flows ?? []).map((flow) => (
      flow.id === nextPlannerState.activeFlowId
        ? {
          ...flow,
          waitingField: flow.waitingField ?? guardedWaitingField ?? null,
          currentEstimate: flow.currentEstimate ?? nextPlannerState.currentEstimate ?? null
        }
        : flow
    ))
  };
}

export async function loadConversationState({
  empresaId,
  phone,
  contextStore = {
    find: findConversationContext,
    save: saveConversationContext
  }
}) {
  const legacyContext = await contextStore.find({ empresaId, phone });
  const data = parseData(legacyContext);
  const ncie = data.ncie && typeof data.ncie === 'object' ? data.ncie : {};
  const unified = ncie.unified && typeof ncie.unified === 'object' ? ncie.unified : null;

  return {
    legacyContext,
    unified,
    lastProductId: legacyContext?.ultimo_producto_id ?? null,
    lastServiceId: legacyContext?.ultimo_servicio_id ?? ncie.active_service_id ?? null,
    lastSearchText: legacyContext?.ultimo_texto_busqueda ?? null,
    lastProduct: data.producto ?? null,
    lastService: data.servicio ?? (ncie.active_service_id ? {
      id: ncie.active_service_id,
      nombre: ncie.active_service_name,
      categoria: ncie.active_domain
    } : null),
    lastProducts: data.ultima_lista_productos ?? data.productos_mostrados ?? [],
    lastServices: data.ultima_lista_servicios ?? [],
    detectedProblem: ncie.problem ?? null,
    currentNeed: ncie.necesidad_actual ?? ncie.need_summary ?? null,
    probableService: ncie.servicio_probable ?? null,
    probableProduct: ncie.producto_probable ?? null,
    lastBotQuestion: ncie.ultima_pregunta_bot ?? null,
    collectedData: ncie.datos_recolectados && typeof ncie.datos_recolectados === 'object' ? ncie.datos_recolectados : {},
    missingData: Array.isArray(ncie.missing_data) ? ncie.missing_data : [],
    funnelStage: ncie.etapa_comercial ?? ncie.funnel_stage ?? NCIE_FUNNEL_STAGES.EXPLORING,
    needSummary: ncie.need_summary ?? legacyContext?.ultimo_texto_busqueda ?? null,
    commercial: {
      lastDomain: ncie.ultimo_dominio ?? null,
      lastService: ncie.ultimo_servicio ?? null,
      activeServiceId: ncie.active_service_id ?? null,
      activeServiceName: ncie.active_service_name ?? null,
      activeDomain: ncie.active_domain ?? ncie.ultimo_dominio ?? null,
      lastQuoteContext: ncie.last_quote_context ?? null,
      lastAdvisorNotificationAt: ncie.last_advisor_notification_at ?? null,
      lastAdvisorNotificationHash: ncie.last_advisor_notification_hash ?? null,
      lastBotQuestion: ncie.last_bot_question ?? ncie.ultima_pregunta_bot ?? null,
      lastOptionsShown: ncie.last_options_shown ?? ncie.ultima_lista_mostrada ?? [],
      lastCategory: ncie.ultima_categoria ?? null,
      lastQuestion: ncie.ultima_pregunta ?? ncie.ultima_pregunta_bot ?? null,
      lastShownList: ncie.ultima_lista_mostrada ?? [],
      lastSelection: ncie.ultima_seleccion ?? null,
      commercialStage: ncie.etapa_comercial ?? ncie.funnel_stage ?? NCIE_FUNNEL_STAGES.EXPLORING,
      customerGoal: ncie.objetivo_cliente ?? ncie.need_summary ?? null,
      plannerState: ncie.planner_state ?? null
    }
  };
}

export async function saveConversationState({
  empresaId,
  phone,
  state,
  nlu,
  decision,
  retrieval,
  response,
  commercialReasoning = null,
  responsePlan = null,
  plannerDecision = null,
  advisorNotification = null,
  contextStore = {
    find: findConversationContext,
    save: saveConversationContext
  }
}) {
  const selectedType = responsePlan?.selectedType ?? decision?.selectedType ?? nlu?.type;
  const serviceSelectionPlans = new Set([
    'service_explanation',
    'quote_from_memory',
    'quote_estimate',
    'quote_design_followup',
    'quote_requirements_followup',
    'marketing_goal_followup'
  ]);
  const productSelectionPlans = new Set(['product_explanation']);
  const rawPlanSelectedService = selectedType === 'service' && serviceSelectionPlans.has(responsePlan?.type)
    ? responsePlan?.selected ?? state?.lastService ?? null
    : null;
  const planSelectedProduct = selectedType === 'product' && productSelectionPlans.has(responsePlan?.type)
    ? responsePlan?.selected ?? state?.lastProduct ?? null
    : null;
  const clearsActiveSelection = [
    'clarify_need',
    'consultative_diagnosis',
    'economic_category_question',
    'recommendation_goal_question',
    'personalized_products_summary',
    'catalog_listing'
  ].includes(responsePlan?.type);
  const shouldClearActiveSelection = clearsActiveSelection && !responsePlan?.selected;
  const plannerActiveFlow = plannerDecision
    ? (plannerDecision.activeFlow ?? activeFlow(plannerDecision.stateUpdatePreview) ?? null)
    : activeFlow(state?.commercial?.plannerState) ?? null;
  const hasPlannerActiveFlow = Boolean(plannerActiveFlow) && !shouldClearActiveSelection;
  const preventsStaleActiveMemory = responsePlan?.type === 'quote_requirements_followup'
    && decision?.action === 'escalate_human'
    && !hasPlannerActiveFlow
    && !responsePlan?.selected;
  const planSelectedService = preventsStaleActiveMemory ? null : rawPlanSelectedService;
  if (preventsStaleActiveMemory && (state?.lastService || state?.commercial?.activeServiceName || state?.commercial?.activeServiceId)) {
    logger.info('active_memory_ignored_stale', {
      empresaId,
      phone,
      reason: 'handoff_without_valid_active_flow',
      activeServiceId: state?.commercial?.activeServiceId ?? state?.lastServiceId ?? null,
      activeServiceName: state?.commercial?.activeServiceName ?? state?.lastService?.nombre ?? null
    });
  }
  const plannerActiveService = hasPlannerActiveFlow && (plannerActiveFlow?.selectedServiceName || plannerActiveFlow?.selectedServiceId)
    ? {
      ...(state?.lastService ?? {}),
      id: plannerActiveFlow.selectedServiceId ?? null,
      nombre: plannerActiveFlow.selectedServiceName ?? null,
      categoria: plannerActiveFlow.selectedCategory ?? null,
      tipo_precio: plannerActiveFlow.servicePriceType ?? state?.lastService?.tipo_precio ?? null,
      precio: plannerActiveFlow.servicePrice ?? state?.lastService?.precio ?? null,
      unidad_medida: plannerActiveFlow.unitMeasure ?? state?.lastService?.unidad_medida ?? null,
      requiere_medidas: plannerActiveFlow.requiresMeasurements ?? state?.lastService?.requiere_medidas ?? null,
      requiere_cantidad: plannerActiveFlow.requiresQuantity ?? state?.lastService?.requiere_cantidad ?? null
    }
    : null;
  const bestService = planSelectedService ?? plannerActiveService ?? (preventsStaleActiveMemory || (shouldClearActiveSelection && !hasPlannerActiveFlow) ? null : state?.lastService ?? null);
  const bestProduct = planSelectedProduct ?? (preventsStaleActiveMemory || (shouldClearActiveSelection && !hasPlannerActiveFlow) ? null : state?.lastProduct ?? null);
  const lastServiceId = planSelectedProduct
    ? null
    : planSelectedService
      ? planSelectedService?.id ?? state?.lastServiceId ?? null
      : bestService?.id ?? (preventsStaleActiveMemory || (shouldClearActiveSelection && !hasPlannerActiveFlow) ? null : state?.lastServiceId ?? null);
  const lastProductId = planSelectedService
    ? null
    : planSelectedProduct
      ? planSelectedProduct?.id ?? state?.lastProductId ?? null
      : bestProduct?.id ?? (preventsStaleActiveMemory || (shouldClearActiveSelection && !hasPlannerActiveFlow) ? null : state?.lastProductId ?? null);
  const previousData = state?.legacyContext?.datos_json ?? {};
  const missingData = decision?.missingData ?? nlu?.missing_data ?? [];
  const needSummary = decision?.needSummary ?? response?.summary ?? state?.needSummary ?? null;
  const lastCategory = bestService?.categoria ?? bestProduct?.categoria ?? (shouldClearActiveSelection && !hasPlannerActiveFlow ? null : state?.commercial?.lastCategory ?? null);
  const isListPlan = ['business_summary', 'recommend_options', 'compare_options', 'consultative_options', 'catalog_listing'].includes(responsePlan?.type);
  const catalogList = responsePlan?.type === 'catalog_listing'
    ? [
      ...(responsePlan.services ?? []).map((item) => ({ ...item, tipo: 'servicio' })),
      ...(responsePlan.products ?? []).map((item) => ({ ...item, tipo: 'producto' }))
    ]
    : null;
  const lastShownList = responsePlan?.options
    ?? catalogList
    ?? responsePlan?.families
    ?? (isListPlan ? retrieval?.services ?? retrieval?.products ?? [] : state?.commercial?.lastOptionsShown ?? state?.commercial?.lastShownList ?? []);
  const lastSelection = planSelectedService ?? planSelectedProduct ?? (preventsStaleActiveMemory || shouldClearActiveSelection ? null : state?.commercial?.lastSelection ?? null);
  let quoteContext = responsePlan?.type === 'quote_estimate'
    ? {
      service_id: bestService?.id ?? null,
      service_name: bestService?.nombre ?? null,
      dimensions: responsePlan.dimensions,
      unit_price: responsePlan.unitPrice ?? null,
      total: responsePlan.total ?? null,
      design_support: state?.commercial?.lastQuoteContext?.design_support ?? null,
      installation: state?.commercial?.lastQuoteContext?.installation ?? null
    }
    : responsePlan?.type === 'quote_from_memory' || responsePlan?.type === 'quote_design_followup' || responsePlan?.type === 'quote_requirements_followup'
      ? {
        ...(state?.commercial?.lastQuoteContext ?? {}),
        ...(responsePlan?.quoteContext ?? {}),
        service_id: bestService?.id ?? (preventsStaleActiveMemory ? null : state?.commercial?.lastQuoteContext?.service_id ?? null),
        service_name: bestService?.nombre ?? (preventsStaleActiveMemory ? null : state?.commercial?.lastQuoteContext?.service_name ?? null),
        question: response?.question ?? null,
        design_support: responsePlan?.type === 'quote_design_followup'
          ? responsePlan.customerAnswer !== 'ya_tiene_diseno'
          : responsePlan?.quoteContext?.designSupport ?? state?.commercial?.lastQuoteContext?.design_support ?? null,
        installation: responsePlan?.type === 'quote_requirements_followup'
          ? responsePlan.installation
          : state?.commercial?.lastQuoteContext?.installation ?? null
      }
      : state?.commercial?.lastQuoteContext ?? null;
  const collectedData = {
    ...(state?.collectedData ?? {}),
      budget: nlu?.entities?.budget ?? state?.collectedData?.budget ?? null,
      date: nlu?.entities?.date ?? state?.collectedData?.date ?? null,
      location: nlu?.entities?.location ?? state?.collectedData?.location ?? null,
      urgency: nlu?.entities?.urgency ?? state?.collectedData?.urgency ?? null,
      businessContext: responsePlan?.businessContext ?? state?.collectedData?.businessContext ?? null,
      marketingGoal: plannerDecision?.detectedMarketingGoal ?? state?.collectedData?.marketingGoal ?? null
    };
  const preservePlannerQuestion = ['neutral_greeting', 'neutral_thanks', 'neutral_resume', 'neutral_ack'].includes(responsePlan?.type);
  const nextWaitingFieldFromResponse = responsePlan?.type === 'quote_estimate'
    ? 'design'
    : responsePlan?.type === 'quote_design_followup'
      ? 'installation'
      : responsePlan?.type === 'quote_requirements_followup'
        ? 'advisor_confirmation'
        : responsePlan?.type === 'quote_from_memory' && /\basesor\b/i.test(String(responsePlan?.question ?? ''))
          ? 'advisor_confirmation'
          : null;
  const shouldClearWaitingField = ['advisor_declined', 'escalate', 'budget_followup'].includes(responsePlan?.type);
  let plannerState = plannerDecision?.stateUpdatePreview
    ? {
      ...plannerDecision.stateUpdatePreview,
      waitingField: shouldClearWaitingField
        ? null
        : nextWaitingFieldFromResponse ?? plannerDecision.stateUpdatePreview.waitingField ?? null,
      lastBotQuestion: preservePlannerQuestion
        ? plannerDecision.stateUpdatePreview.lastBotQuestion ?? null
        : response?.question ?? plannerDecision.stateUpdatePreview.lastBotQuestion ?? null,
      flows: (plannerDecision.stateUpdatePreview.flows ?? []).map((flow) => (
        flow.id === plannerDecision.stateUpdatePreview.activeFlowId
          ? {
            ...flow,
            waitingField: shouldClearWaitingField
              ? null
              : nextWaitingFieldFromResponse ?? flow.waitingField ?? null,
            lastQuestion: preservePlannerQuestion
              ? flow.lastQuestion ?? null
              : response?.question ?? flow.lastQuestion ?? null
          }
          : flow
      ))
    }
    : responsePlan?.type === 'catalog_listing'
      ? {
        ...(state?.commercial?.plannerState ?? emptyPlannerState({ empresaId, conversationId: phone })),
        activeFlowId: null,
        goal: COMMERCIAL_PLANNER_GOALS.LIST_CATALOG,
        currentStage: COMMERCIAL_PLANNER_STAGES.VIEWING_CATALOG,
        waitingField: 'catalog_selection',
        selectedCategory: null,
        selectedService: null,
        collectedEntities: {},
        missingEntities: ['catalogo'],
        lastBotQuestion: response?.question ?? state?.commercial?.lastBotQuestion ?? null
      }
    : state?.commercial?.plannerState ?? null;

  if (shouldClearActiveSelection && plannerState) {
    plannerState = {
      ...plannerState,
      activeFlowId: null,
      selectedService: null,
      currentEstimate: null,
      waitingField: responsePlan?.type === 'catalog_listing' ? 'catalog_selection' : null,
      selectedCategory: responsePlan?.type === 'catalog_listing' ? plannerState.selectedCategory ?? null : null,
      missingEntities: responsePlan?.type === 'catalog_listing' ? plannerState.missingEntities ?? ['catalogo'] : [],
      flows: plannerState.flows ?? []
    };
  }

  plannerState = guardPlannerStateIntegrity({
    empresaId,
    previousPlannerState: state?.commercial?.plannerState ?? null,
    nextPlannerState: plannerState,
    responsePlan
  });
  quoteContext = preventsStaleActiveMemory
    ? null
    : quoteContext ?? quoteContextFromFlow(activeFlow(plannerState), state?.commercial?.lastQuoteContext ?? null);

  const savedDatos = {
    ...previousData,
    producto: bestProduct ?? (preventsStaleActiveMemory || shouldClearActiveSelection ? null : previousData.producto ?? null),
    servicio: bestService ?? (preventsStaleActiveMemory || shouldClearActiveSelection ? null : previousData.servicio ?? null),
    ultima_lista_productos: retrieval?.products ?? previousData.ultima_lista_productos ?? [],
    ultima_lista_servicios: retrieval?.services ?? previousData.ultima_lista_servicios ?? [],
    ncie: {
      problem: nlu?.entities?.problem ?? state?.detectedProblem ?? null,
      symptom: nlu?.entities?.symptom ?? null,
      necesidad_actual: needSummary,
      problema_detectado: nlu?.entities?.problem ?? state?.detectedProblem ?? null,
      servicio_probable: bestService?.nombre ?? (preventsStaleActiveMemory || shouldClearActiveSelection ? null : nlu?.entities?.service ?? state?.probableService ?? null),
      producto_probable: bestProduct?.nombre ?? (preventsStaleActiveMemory || shouldClearActiveSelection ? null : nlu?.entities?.product ?? state?.probableProduct ?? null),
      ultima_pregunta_bot: response?.question ?? null,
      datos_recolectados: collectedData,
      datos_faltantes: missingData,
      missing_data: missingData,
      etapa_comercial: decision?.funnelStage ?? state?.funnelStage ?? NCIE_FUNNEL_STAGES.EXPLORING,
      funnel_stage: decision?.funnelStage ?? state?.funnelStage ?? NCIE_FUNNEL_STAGES.EXPLORING,
      need_summary: needSummary,
      last_decision: decision?.action ?? null,
      ultimo_dominio: preventsStaleActiveMemory || shouldClearActiveSelection ? null : commercialReasoning?.domain ?? lastCategory ?? state?.commercial?.lastDomain ?? null,
      ultimo_servicio: bestService?.nombre ?? (preventsStaleActiveMemory || shouldClearActiveSelection ? null : state?.commercial?.lastService ?? null),
      ultima_categoria: lastCategory,
      ultima_pregunta: response?.question ?? state?.commercial?.lastQuestion ?? null,
      ultima_lista_mostrada: lastShownList,
      ultima_seleccion: lastSelection,
      active_service_id: bestService?.id ?? null,
      active_service_name: bestService?.nombre ?? null,
      active_domain: bestService?.categoria ?? (preventsStaleActiveMemory || shouldClearActiveSelection ? null : commercialReasoning?.domain ?? state?.commercial?.activeDomain ?? null),
      last_quote_context: quoteContext,
      last_advisor_notification_at: advisorNotification?.advisorNotificationRequired
        ? new Date().toISOString()
        : state?.commercial?.lastAdvisorNotificationAt ?? null,
      last_advisor_notification_hash: advisorNotification?.advisorNotificationRequired
        ? advisorNotification.notificationHash ?? state?.commercial?.lastAdvisorNotificationHash ?? null
        : state?.commercial?.lastAdvisorNotificationHash ?? null,
      last_bot_question: response?.question ?? state?.commercial?.lastBotQuestion ?? null,
      last_options_shown: lastShownList,
      objetivo_cliente: plannerDecision?.detectedMarketingGoal ?? commercialReasoning?.conversation_goal ?? state?.commercial?.customerGoal ?? null,
      commercial_reasoning: commercialReasoning,
      response_plan: responsePlan,
      planner_state: plannerState
    }
  };

  const saved = await contextStore.save({
    empresaId,
    phone,
    ultimaIntencion: nlu?.intent ?? 'MENSAJE_GENERAL',
    ultimoProductoId: lastProductId,
    ultimoServicioId: lastServiceId,
    ultimoTextoBusqueda: nlu?.entities?.service
      ?? nlu?.entities?.product
      ?? nlu?.entities?.problem
      ?? state?.lastSearchText,
    datos: savedDatos
  });

  logger.info('ncie_conversation_state_saved', {
    empresaId,
    activeFlow: plannerState?.activeFlowId ?? null,
    waitingField: plannerState?.waitingField ?? null,
    missingEntities: plannerState?.missingEntities ?? [],
    activeServiceId: saved?.ultimoServicioId ?? null,
    activeServiceName: (saved?.datos_json ?? saved?.datos)?.ncie?.active_service_name ?? null
  });

  const realDatos = saved?.datos_json ?? saved?.datos ?? savedDatos;
  return {
    ...saved,
    ultimoServicioId: saved?.ultimoServicioId ?? lastServiceId,
    ultimoProductoId: saved?.ultimoProductoId ?? lastProductId,
    datos_json: realDatos,
    datos: realDatos
  };
}
