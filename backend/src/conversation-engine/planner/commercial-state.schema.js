export const PLANNER_STATE_VERSION = 2;

export const COMMERCIAL_PLANNER_GOALS = Object.freeze({
  EXPLORE_COMPANY: 'explorar_empresa',
  KNOW_COMPANY: 'conocer_empresa',
  QUOTE: 'cotizar',
  IMPROVE_BUSINESS: 'mejorar_negocio',
  INCREASE_SALES: 'aumentar_ventas',
  FOLLOW_UP_CATALOG: 'follow_up_catalog',
  LIST_CATALOG: 'listar_catalogo',
  CONTINUE_FLOW: 'continuar_flujo',
  GENERAL: 'general'
});

export const COMMERCIAL_PLANNER_STAGES = Object.freeze({
  EXPLORING: 'explorando',
  SELECTING_SERVICE: 'seleccionando_servicio',
  WAITING_MEASUREMENTS: 'esperando_medidas',
  WAITING_QUANTITY: 'esperando_cantidad',
  WAITING_BUDGET: 'esperando_presupuesto',
  WAITING_WEB_TYPE: 'esperando_tipo_web',
  WAITING_ADVISOR_CONFIRMATION: 'esperando_confirmacion_asesor',
  COLLECTING_REQUIREMENTS: 'recolectando_requisitos',
  READY_TO_QUOTE: 'listo_para_cotizar',
  FOLLOW_UP: 'seguimiento',
  VIEWING_CATALOG: 'viendo_catalogo'
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
    goal: null,
    currentStage: COMMERCIAL_PLANNER_STAGES.EXPLORING,
    waitingField: null,
    selectedCategory: null,
    selectedService: null,
    collectedEntities: {},
    missingEntities: [],
    quotationDraft: null,
    currentEstimate: null,
    installationRequested: null,
    designIncluded: null,
    needsAdvisor: false,
    catalogShown: false,
    lastUserIntent: null,
    confidence: null,
    lastInteraction: null,
    contextHistory: [],
    followUpCounter: 0,
    activeFlowId: null,
    flows: [],
    lastBotQuestion: null
  };
}

export function waitingFieldFromMissing(missing = []) {
  const [field] = missing ?? [];
  if (field === 'medidas') return 'dimensions';
  if (field === 'tipo_web') return 'webType';
  if (field === 'cantidad') return 'quantity';
  if (field === 'presupuesto') return 'budget';
  if (field === 'diseno') return 'design';
  if (field === 'instalacion') return 'installation';
  if (field === 'asesor') return 'advisor_confirmation';
  if (field === 'acabado') return 'finish';
  if (field === 'material') return 'material';
  if (field === 'catalogo') return 'catalog_selection';
  return null;
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
      quotationDraft: quoteContext ?? null,
      currentEstimate: quoteContext?.total ? {
        total: quoteContext.total,
        area: quoteContext?.dimensions?.area ?? null,
        unitPrice: quoteContext?.unit_price ?? null
      } : null,
      installationRequested: quoteContext?.installation ?? null,
      designIncluded: quoteContext?.design_support ?? null,
      missing: [],
      waitingField: waitingFieldFromMissing([]),
      lastQuestion: state?.commercial?.lastBotQuestion ?? state?.lastBotQuestion ?? null,
      status: 'active'
    }
    : null;

  return {
    ...emptyPlannerState({ empresaId, conversationId }),
    activeFlowId: flow?.id ?? null,
    flows: flow ? [flow] : [],
    goal: flow?.goal ?? null,
    currentStage: flow?.stage ?? COMMERCIAL_PLANNER_STAGES.EXPLORING,
    waitingField: flow?.waitingField ?? null,
    selectedCategory: category,
    selectedService: flow ? { id: serviceId, nombre: serviceName, categoria: category } : null,
    collectedEntities: flow?.entities ?? {},
    missingEntities: flow?.missing ?? [],
    quotationDraft: flow?.quotationDraft ?? quoteContext ?? null,
    currentEstimate: flow?.currentEstimate ?? null,
    installationRequested: flow?.installationRequested ?? null,
    designIncluded: flow?.designIncluded ?? null,
    needsAdvisor: false,
    catalogShown: false,
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
    quotationDraft: flow.quotationDraft ?? null,
    currentEstimate: flow.currentEstimate ?? null,
    installationRequested: flow.installationRequested ?? null,
    designIncluded: flow.designIncluded ?? null,
    needsAdvisor: flow.needsAdvisor ?? false,
    catalogShown: flow.catalogShown ?? false,
    waitingField: flow.waitingField ?? waitingFieldFromMissing(flow.missing ?? []),
    lastQuestion: flow.lastQuestion ?? null
  };
}
