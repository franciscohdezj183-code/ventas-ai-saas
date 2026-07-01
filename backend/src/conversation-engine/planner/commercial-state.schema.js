export const PLANNER_STATE_VERSION = 2;

export const COMMERCIAL_PLANNER_GOALS = Object.freeze({
  EXPLORE_COMPANY: 'explorar_empresa',
  KNOW_COMPANY: 'conocer_empresa',
  QUOTE: 'cotizar',
  IMPROVE_BUSINESS: 'mejorar_negocio',
  INCREASE_SALES: 'aumentar_ventas',
  FOLLOW_UP_CATALOG: 'follow_up_catalog',
  CONTINUE_FLOW: 'continuar_flujo',
  GENERAL: 'general'
});

export const COMMERCIAL_PLANNER_STAGES = Object.freeze({
  EXPLORING: 'explorando',
  SELECTING_SERVICE: 'seleccionando_servicio',
  WAITING_MEASUREMENTS: 'esperando_medidas',
  WAITING_WEB_TYPE: 'esperando_tipo_web',
  COLLECTING_REQUIREMENTS: 'recolectando_requisitos',
  READY_TO_QUOTE: 'listo_para_cotizar',
  FOLLOW_UP: 'seguimiento'
});

export const COMMERCIAL_NEXT_ACTIONS = Object.freeze({
  ASK_MISSING_INFO: 'ask_missing_info',
  RETRIEVE_OPTIONS: 'retrieve_options',
  ANSWER_FROM_CONTEXT: 'answer_from_context',
  FOLLOW_UP_CATALOG: 'follow_up_catalog',
  SWITCH_TOPIC: 'switch_topic',
  RESUME_FLOW: 'resume_flow',
  EXPLAIN_SELECTED_SERVICE: 'explain_selected_service'
});

export function emptyPlannerState({ empresaId = null, conversationId = null } = {}) {
  return {
    version: PLANNER_STATE_VERSION,
    empresaId,
    conversationId,
    activeFlowId: null,
    flows: [],
    lastBotQuestion: null
  };
}

export function normalizePlannerState({ state = null, empresaId = null, conversationId = null } = {}) {
  const existing = state?.commercial?.plannerState ?? state?.plannerState ?? null;
  if (existing?.version === PLANNER_STATE_VERSION && Array.isArray(existing.flows)) {
    return {
      ...emptyPlannerState({ empresaId, conversationId }),
      ...existing,
      empresaId: existing.empresaId ?? empresaId,
      conversationId: existing.conversationId ?? conversationId
    };
  }

  const serviceId = state?.lastService?.id ?? state?.lastServiceId ?? state?.commercial?.activeServiceId ?? null;
  const serviceName = state?.lastService?.nombre ?? state?.commercial?.activeServiceName ?? null;
  const category = state?.lastService?.categoria ?? state?.commercial?.activeDomain ?? state?.commercial?.lastCategory ?? null;
  const quoteContext = state?.commercial?.lastQuoteContext ?? null;
  const hasService = Boolean(serviceId || serviceName);
  const flow = hasService
    ? {
      id: `flow_service_${serviceId ?? String(serviceName).toLowerCase().replace(/\s+/g, '_')}`,
      goal: COMMERCIAL_PLANNER_GOALS.QUOTE,
      stage: quoteContext?.dimensions ? COMMERCIAL_PLANNER_STAGES.COLLECTING_REQUIREMENTS : COMMERCIAL_PLANNER_STAGES.WAITING_MEASUREMENTS,
      selectedServiceId: serviceId,
      selectedServiceName: serviceName,
      selectedCategory: category,
      servicePriceType: state?.lastService?.tipo_precio ?? null,
      servicePrice: state?.lastService?.precio ?? null,
      unitMeasure: state?.lastService?.unidad_medida ?? null,
      requiresMeasurements: state?.lastService?.requiere_medidas ?? null,
      requiresQuantity: state?.lastService?.requiere_cantidad ?? null,
      includes: state?.lastService?.incluye ?? null,
      excludes: state?.lastService?.no_incluye ?? null,
      quoteNotes: state?.lastService?.notas_cotizacion ?? null,
      minimumPrice: state?.lastService?.precio_minimo ?? null,
      entities: {
        dimensions: quoteContext?.dimensions ?? null,
        webType: null,
        quantity: quoteContext?.quantity ?? null,
        installation: quoteContext?.installation ?? null,
        design: quoteContext?.design_support ?? null
      },
      missing: [],
      lastQuestion: state?.commercial?.lastBotQuestion ?? state?.lastBotQuestion ?? null,
      status: 'active'
    }
    : null;

  return {
    ...emptyPlannerState({ empresaId, conversationId }),
    activeFlowId: flow?.id ?? null,
    flows: flow ? [flow] : [],
    lastBotQuestion: state?.commercial?.lastBotQuestion ?? state?.lastBotQuestion ?? null
  };
}

export function activeFlow(plannerState) {
  return (plannerState?.flows ?? []).find((flow) => flow.id === plannerState?.activeFlowId)
    ?? (plannerState?.flows ?? []).find((flow) => flow.status === 'active')
    ?? null;
}

export function flowSummary(flow = null) {
  if (!flow) return null;
  return {
    id: flow.id,
    goal: flow.goal,
    stage: flow.stage,
    selectedServiceId: flow.selectedServiceId ?? null,
    selectedServiceName: flow.selectedServiceName ?? null,
    selectedCategory: flow.selectedCategory ?? null,
    entities: flow.entities ?? {},
    missing: flow.missing ?? [],
    lastQuestion: flow.lastQuestion ?? null
  };
}
