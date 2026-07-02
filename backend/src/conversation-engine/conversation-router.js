import { logger } from '../utils/logger.js';
import { normalizeForNcie } from './message-normalizer.js';
import { NCIE_ACTIONS, NCIE_FUNNEL_STAGES, NCIE_TYPES } from './conversation-engine.types.js';
import { loadFullServiceCatalog } from './retrieval.service.js';
import {
  COMMERCIAL_NEXT_ACTIONS,
  COMMERCIAL_PLANNER_GOALS,
  COMMERCIAL_PLANNER_STAGES,
  activeFlow,
  emptyPlannerState,
  flowSummary,
  normalizePlannerState
} from './planner/commercial-state.schema.js';
import { parseDimensions } from './planner/dimensions.parser.js';
import { currentWaitingField, interpretResponseForWaitingField } from './planner/response-interpreter.js';
import { detectDesignPreference, detectInstallationPreference } from './planner/missing-information.detector.js';

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function normalizedText(normalizedMessage = null) {
  return normalizeForNcie(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? normalizedMessage?.original ?? '');
}

function quantityFromText(text) {
  const normalized = normalizeForNcie(text);
  const digit = normalized.match(/\b(\d{1,6})\b/);
  if (digit) {
    const value = Number(digit[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const words = new Map([
    ['un', 1], ['una', 1], ['uno', 1], ['dos', 2], ['tres', 3], ['cuatro', 4], ['cinco', 5],
    ['seis', 6], ['siete', 7], ['ocho', 8], ['nueve', 9], ['diez', 10], ['once', 11],
    ['doce', 12], ['quince', 15], ['veinte', 20], ['treinta', 30], ['cuarenta', 40],
    ['cincuenta', 50], ['cien', 100]
  ]);
  for (const token of normalized.split(/\s+/)) {
    if (words.has(token)) return words.get(token);
  }
  return null;
}

function budgetFromText(text) {
  const match = normalizeForNcie(text).match(/\$?\s*(\d{2,7}(?:[.,]\d{1,2})?)\s*(?:pesos|mxn)?\b/);
  if (!match) return null;
  const budget = Number(match[1].replace(',', '.'));
  return Number.isFinite(budget) && budget > 0 ? budget : null;
}

function usageFromText(text) {
  const normalized = normalizeForNcie(text);
  if (/\b(interior|interiores|adentro|dentro)\b/.test(normalized)) return 'interior';
  if (/\b(exterior|exteriores|afuera|intemperie)\b/.test(normalized)) return 'exterior';
  if (/\b(evento|eventos|expo|exposicion|feria)\b/.test(normalized)) return 'evento';
  return null;
}

function isServiceCatalogRequest(text, { waitingField = null, hasShownOptions = false } = {}) {
  const normalized = normalizeForNcie(text);
  if (/\b(que servicios|servicios tienen|servicios tienes|servicios manejan|servicios manejas|catalogo de servicios|lista de servicios|menu de servicios|todos los servicios|tus servicios|sus servicios)\b/.test(normalized)) {
    return true;
  }
  if (/\b(catalogo|menu|opciones)\b/.test(normalized) && /\b(servicio|servicios)\b/.test(normalized)) {
    return true;
  }
  if (/^(catalogo|menu|opciones|servicios)$/.test(normalized)) return true;
  if (/\binformes\b/.test(normalized) && /\b(servicio|servicios)\b/.test(normalized)) return true;
  return /^(quiero informes|informes|informacion)$/.test(normalized) && (waitingField === 'catalog_selection' || hasShownOptions);
}

function objectiveFromText(text) {
  const normalized = normalizeForNcie(text);
  if (/\b(atraer|clientes|vender|ventas|promocionar|promocion|imagen|negocio|marca)\b/.test(normalized)) return normalized;
  return null;
}

function categoryName(value) {
  return normalizeForNcie(value);
}

function genericCategoryFromText(text) {
  const normalized = normalizeForNcie(text);
  const compact = normalized.replace(/\b(me interesa|quiero|una|un|de|del|la|el|para|cotizar|informes?)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const categories = [
    { category: 'Impresion', match: /\bimpresion|impresiones\b/ },
    { category: 'Textil', match: /\btextil|playeras?|camisetas?|ropa\b/ },
    { category: 'Promocionales', match: /\bpromocionales?|promos?\b/ },
    { category: 'Senaletica', match: /\bsenaletica|senalizacion|senales\b/ },
    { category: 'Banners', match: /\bbanners?|banner arana|arana\b/ },
    { category: 'Diseno', match: /\bdiseno|imagen corporativa|identidad\b/ }
  ];
  if (/\b(lona|vinil impreso|rotulacion|rotular|logo|logotipo|corte de vinil)\b/.test(normalized)) return null;
  for (const item of categories) {
    if (item.match.test(compact)) return item.category;
  }
  return null;
}

function serviceNeedsQuantity(service = null) {
  return Boolean(service?.requiere_cantidad);
}

function serviceNeedsMeasurements(service = null) {
  const type = normalizeForNcie(service?.tipo_precio);
  const unit = normalizeForNcie(service?.unidad_medida);
  return Boolean(service?.requiere_medidas) || type === 'por_m2' || unit === 'm2';
}

function serviceNeedsBudget(service = null) {
  return normalizeForNcie(service?.tipo_precio) === 'cotizacion';
}

function serviceOffersInstallation(service = null) {
  return !/\binstalacion\b/.test(normalizeForNcie(service?.no_incluye ?? service?.excludes ?? ''));
}

function serviceFromFlow(flow = null) {
  if (!flow) return null;
  return {
    id: flow.selectedServiceId ?? null,
    nombre: flow.selectedServiceName ?? null,
    categoria: flow.selectedCategory ?? null,
    precio: flow.servicePrice ?? null,
    tipo_precio: flow.servicePriceType ?? null,
    unidad_medida: flow.unitMeasure ?? null,
    requiere_medidas: flow.requiresMeasurements ?? null,
    requiere_cantidad: flow.requiresQuantity ?? null,
    incluye: flow.includes ?? null,
    no_incluye: flow.excludes ?? null,
    notas_cotizacion: flow.quoteNotes ?? null,
    precio_minimo: flow.minimumPrice ?? null
  };
}

function flowIdForService(service) {
  return `flow_service_${service?.id ?? normalizeForNcie(service?.nombre ?? 'unknown').replace(/\s+/g, '_')}`;
}

function nextWaitingFieldFor({ service, entities = {}, preferred = null } = {}) {
  if (preferred) return preferred;
  if (serviceNeedsQuantity(service) && !entities.quantity) return 'quantity';
  if (serviceNeedsMeasurements(service) && (!entities.dimensions || entities.dimensions?.incomplete)) return 'dimensions';
  if (serviceNeedsBudget(service) && !entities.budget) return 'budget';
  if (!entities.usageContext && !entities.use) return 'usage_context';
  return 'advisor_confirmation';
}

function stageForWaitingField(waitingField) {
  if (waitingField === 'quantity') return COMMERCIAL_PLANNER_STAGES.WAITING_QUANTITY;
  if (waitingField === 'dimensions') return COMMERCIAL_PLANNER_STAGES.WAITING_MEASUREMENTS;
  if (waitingField === 'budget') return COMMERCIAL_PLANNER_STAGES.WAITING_BUDGET;
  if (waitingField === 'advisor_confirmation') return COMMERCIAL_PLANNER_STAGES.WAITING_ADVISOR_CONFIRMATION;
  return COMMERCIAL_PLANNER_STAGES.COLLECTING_REQUIREMENTS;
}

function missingForWaitingField(waitingField) {
  if (waitingField === 'dimensions') return 'medidas';
  if (waitingField === 'quantity') return 'cantidad';
  if (waitingField === 'budget') return 'presupuesto';
  if (waitingField === 'installation') return 'instalacion';
  if (waitingField === 'advisor_confirmation') return 'asesor';
  return waitingField;
}

function questionForWaitingField(waitingField, service = null) {
  if (waitingField === 'quantity') return '¿Cuántas piezas necesitas?';
  if (waitingField === 'dimensions') return '¿Tienes medidas, diseño o algún detalle especial?';
  if (waitingField === 'budget') return '¿Con qué presupuesto aproximado quieres empezar?';
  if (waitingField === 'usage_context') return 'Perfecto, ¿sería para interior, exterior o evento?';
  if (waitingField === 'installation') return '¿Quieres instalación o solo impresión?';
  if (waitingField === 'advisor_confirmation') return '¿Quieres que te comunique con un asesor para confirmar tiempo y precio final?';
  return service?.nombre ? `¿Qué detalle quieres agregar para ${service.nombre}?` : '¿Qué detalle quieres agregar?';
}

function makePlannerState({ state, empresaId, conversationId, service, previousFlow = null, entities = {}, waitingField = null, lastQuestion = null }) {
  const base = normalizePlannerState({ state, empresaId, conversationId });
  const id = previousFlow?.id ?? flowIdForService(service);
  const nextFlow = {
    ...(previousFlow ?? {}),
    id,
    goal: COMMERCIAL_PLANNER_GOALS.QUOTE,
    stage: stageForWaitingField(waitingField),
    selectedServiceId: service?.id ?? previousFlow?.selectedServiceId ?? null,
    selectedServiceName: service?.nombre ?? previousFlow?.selectedServiceName ?? null,
    selectedCategory: service?.categoria ?? previousFlow?.selectedCategory ?? null,
    servicePriceType: service?.tipo_precio ?? previousFlow?.servicePriceType ?? null,
    servicePrice: service?.precio ?? previousFlow?.servicePrice ?? null,
    unitMeasure: service?.unidad_medida ?? previousFlow?.unitMeasure ?? null,
    requiresMeasurements: service?.requiere_medidas ?? previousFlow?.requiresMeasurements ?? null,
    requiresQuantity: service?.requiere_cantidad ?? previousFlow?.requiresQuantity ?? null,
    includes: service?.incluye ?? previousFlow?.includes ?? null,
    excludes: service?.no_incluye ?? previousFlow?.excludes ?? null,
    quoteNotes: service?.notas_cotizacion ?? previousFlow?.quoteNotes ?? null,
    minimumPrice: service?.precio_minimo ?? previousFlow?.minimumPrice ?? null,
    entities: {
      ...(previousFlow?.entities ?? {}),
      ...entities
    },
    quotationDraft: {
      ...(previousFlow?.quotationDraft ?? {}),
      service_id: service?.id ?? previousFlow?.selectedServiceId ?? null,
      service_name: service?.nombre ?? previousFlow?.selectedServiceName ?? null,
      quantity: entities.quantity ?? previousFlow?.entities?.quantity ?? previousFlow?.quotationDraft?.quantity ?? null,
      dimensions: entities.dimensions ?? previousFlow?.entities?.dimensions ?? previousFlow?.quotationDraft?.dimensions ?? null,
      budget: entities.budget ?? previousFlow?.entities?.budget ?? previousFlow?.quotationDraft?.budget ?? null,
      usage_context: entities.usageContext ?? previousFlow?.entities?.usageContext ?? previousFlow?.quotationDraft?.usage_context ?? null,
      design_support: entities.designSupport ?? entities.design ?? previousFlow?.quotationDraft?.design_support ?? null,
      installation: entities.installation ?? previousFlow?.quotationDraft?.installation ?? null
    },
    waitingField,
    missing: waitingField && waitingField !== 'advisor_confirmation' ? [missingForWaitingField(waitingField)] : [],
    lastQuestion,
    status: 'active'
  };
  return {
    ...base,
    goal: COMMERCIAL_PLANNER_GOALS.QUOTE,
    currentStage: nextFlow.stage,
    activeFlowId: id,
    selectedCategory: nextFlow.selectedCategory,
    selectedService: {
      id: nextFlow.selectedServiceId,
      nombre: nextFlow.selectedServiceName,
      categoria: nextFlow.selectedCategory
    },
    collectedEntities: nextFlow.entities,
    missingEntities: nextFlow.missing,
    quotationDraft: nextFlow.quotationDraft,
    waitingField,
    lastBotQuestion: lastQuestion,
    flows: [
      ...(base.flows ?? []).filter((flow) => flow.id !== id),
      nextFlow
    ]
  };
}

function quoteContextFromEntities(service, entities = {}) {
  const unitPrice = Number(service?.precio);
  const total = entities.dimensions?.area && Number.isFinite(unitPrice)
    ? Number((unitPrice * entities.dimensions.area).toFixed(2))
    : null;
  return {
    service_id: service?.id ?? null,
    service_name: service?.nombre ?? null,
    dimensions: entities.dimensions ?? null,
    quantity: entities.quantity ?? null,
    budget: entities.budget ?? null,
    unit_price: Number.isFinite(unitPrice) ? unitPrice : null,
    total,
    use: entities.usageContext ?? entities.use ?? null,
    designSupport: entities.designSupport ?? entities.design ?? null,
    installation: entities.installation ?? null
  };
}

function makeResolved({ empresaId, reason, nlu, decision, responsePlan, plannerDecision, retrieval = null }) {
  logger.info('routeMessage_resolved', {
    empresaId,
    routeMessage_resolved: true,
    route_conversation_message_handled: true,
    reason,
    waitingField: plannerDecision?.waitingField ?? null,
    selectedService: plannerDecision?.selectedService?.nombre ?? null
  });
  return {
    resolved: true,
    reason,
    nlu,
    decision,
    responsePlan,
    plannerDecision,
    retrieval: retrieval ?? {
      company: null,
      services: [],
      products: [],
      categories: [],
      queries: [],
      semantic: { terms: [], matchedVerticals: [] },
      commercialReasoning: null,
      retrievalMode: 'deterministic_router'
    }
  };
}

function nluForRoute(intent, entities = {}) {
  return {
    intent,
    type: entities.handoffRequested ? NCIE_TYPES.HUMAN : NCIE_TYPES.SERVICE,
    confidence: 1,
    entities,
    missing_data: [],
    reasoning_summary: 'Resolved by deterministic conversation router'
  };
}

function decisionForRoute({ handoff = false } = {}) {
  return {
    action: handoff ? NCIE_ACTIONS.ESCALATE_HUMAN : NCIE_ACTIONS.USE_CONTEXT,
    selectedType: NCIE_TYPES.SERVICE,
    missingData: [],
    funnelStage: handoff ? NCIE_FUNNEL_STAGES.HUMAN : NCIE_FUNNEL_STAGES.QUOTING,
    confidence: 1,
    shouldCreateLead: handoff
  };
}

function plannerDecisionForRoute({ stateUpdatePreview, selectedService, responsePlanType, entities = {}, waitingField = null, nextAction = COMMERCIAL_NEXT_ACTIONS.ANSWER_FROM_CONTEXT }) {
  return {
    enabled: true,
    deterministicRouter: true,
    phase: 'deterministic_router',
    goal: COMMERCIAL_PLANNER_GOALS.QUOTE,
    stage: stateUpdatePreview?.currentStage ?? null,
    selectedService: selectedService ? {
      id: selectedService.id ?? null,
      nombre: selectedService.nombre ?? null,
      categoria: selectedService.categoria ?? null
    } : null,
    selectedServiceItem: selectedService ?? null,
    missing: stateUpdatePreview?.missingEntities ?? [],
    detectedDimensions: entities.dimensions ?? null,
    detectedQuantity: entities.quantity ?? null,
    detectedBudget: entities.budget ?? null,
    detectedUse: entities.usageContext ?? entities.use ?? null,
    detectedDesignPreference: entities.designSupport ?? entities.design,
    detectedInstallationPreference: entities.installation,
    waitingField,
    interpretedResponse: { handled: true, entities, confidence: 1 },
    nextAction,
    retrievalNeeded: false,
    retrievalPolicy: { retrievalNeeded: false, reason: 'deterministic_router', nextAction },
    responsePlanType,
    explicitTopicChange: false,
    topicSwitch: { changed: false, resumeFlow: null, newService: null },
    activeFlow: flowSummary(activeFlow(stateUpdatePreview)),
    stateUpdatePreview
  };
}

function responsePlanForQuestion({ selectedService, text, quoteContext = {}, type = 'quote_from_memory' }) {
  return {
    type,
    deterministicRouter: true,
    selectedType: NCIE_TYPES.SERVICE,
    selected: selectedService,
    summary: selectedService?.nombre ?? 'Flujo actual',
    quoteContext,
    question: text
  };
}

function canQuoteByArea(service = null) {
  return normalizeForNcie(service?.tipo_precio) === 'por_m2' || normalizeForNcie(service?.unidad_medida) === 'm2';
}

function quoteEstimatePlan({ service, dimensions }) {
  const unitPrice = Number(service?.precio);
  const total = dimensions?.area && Number.isFinite(unitPrice) ? Number((unitPrice * dimensions.area).toFixed(2)) : null;
  return {
    type: 'quote_estimate',
    deterministicRouter: true,
    selectedType: NCIE_TYPES.SERVICE,
    selected: service,
    dimensions,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
    total,
    priceText: total ? money(total) : null,
    summary: service?.nombre ?? 'Cotizacion',
    question: '¿Ya tienes el diseño o quieres que también te apoyemos con eso?'
  };
}

function hasExplicitDimensionUnit(raw = '') {
  return /\b(cm|centimetros?|m|metros?)\b/i.test(String(raw));
}

function dimensionsNeedUnitConfirmation(service = null, dimensions = null, raw = '') {
  if (!canQuoteByArea(service) || !dimensions?.area || hasExplicitDimensionUnit(raw)) return false;
  return Number(dimensions.area) >= 50;
}

function withCleanDimensionsText(dimensions = null) {
  if (!dimensions) return null;
  const width = dimensions.width ?? dimensions.ancho;
  const height = dimensions.height ?? dimensions.alto;
  if (Number.isFinite(Number(width)) && Number.isFinite(Number(height))) {
    return {
      ...dimensions,
      text: `${width} x ${height}${dimensions.unit ? ` ${dimensions.unit}` : ''}`.trim()
    };
  }
  return dimensions;
}

function resolvePendingDimensionUnit(existingDimensions = null, text = '') {
  if (!existingDimensions?.needsUnitConfirmation) return null;
  const normalized = normalizeForNcie(text);
  const wantsCm = /\b(cm|centimetro|centimetros)\b/.test(normalized);
  const wantsM = /\b(m|metro|metros)\b/.test(normalized);
  if (!wantsCm && !wantsM) return null;
  const width = Number(existingDimensions.rawWidth ?? existingDimensions.width ?? existingDimensions.ancho);
  const height = Number(existingDimensions.rawHeight ?? existingDimensions.height ?? existingDimensions.alto);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const factor = wantsCm ? 0.01 : 1;
  const widthMeters = Number((width * factor).toFixed(4));
  const heightMeters = Number((height * factor).toFixed(4));
  return {
    width: widthMeters,
    height: heightMeters,
    ancho: widthMeters,
    alto: heightMeters,
    area: Number((widthMeters * heightMeters).toFixed(4)),
    unit: 'm',
    originalUnit: wantsCm ? 'cm' : 'm',
    text: `${width} x ${height} ${wantsCm ? 'cm' : 'm'}`
  };
}

function completePartialDimensions(existingDimensions = null, dimensions = null, text = '') {
  if (!existingDimensions?.incomplete || !dimensions?.incomplete) return dimensions;
  if (!/\b(alto|altura|de alto)\b/.test(normalizeForNcie(text))) return dimensions;
  const width = Number(existingDimensions.length ?? existingDimensions.width ?? existingDimensions.ancho);
  const height = Number(dimensions.length ?? dimensions.height ?? dimensions.alto);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return dimensions;
  return {
    width,
    height,
    area: Number((width * height).toFixed(2)),
    unit: 'm',
    text: `${width}x${height}`
  };
}

function findCategoryServices(services, category) {
  const normalizedCategory = normalizeForNcie(category);
  return (services ?? []).filter((service) => categoryName(service.categoria).includes(normalizedCategory));
}

function exactServiceForText(text, services = []) {
  const normalized = normalizeForNcie(text);
  const priority = [
    { when: /\bpromocionales?\b.*\b(corte de vinil|vinil)\b|\bcorte de vinil\b.*\bpromocionales?\b/, name: 'Promocionales con corte de vinil' },
    { when: /\bvinil impreso\b/, name: 'Vinil impreso' },
    { when: /\brotulacion|rotular\b/, name: 'Vinil de rotulacion de color' },
    { when: /\blona|impresion de lona\b/, name: 'Impresion de lona' },
    { when: /\blogotipo|logo|diseno de logo|diseno de logotipo\b/, name: 'Diseno de logotipo' }
  ];
  for (const rule of priority) {
    if (!rule.when.test(normalized)) continue;
    const target = normalizeForNcie(rule.name);
    const found = services.find((service) => normalizeForNcie(service.nombre) === target) ??
      services.find((service) => normalizeForNcie(service.nombre).includes(target) || target.includes(normalizeForNcie(service.nombre)));
    if (found) return found;
  }
  return null;
}

function renderCategoryOptions(category, services) {
  const lines = services.map((service, index) => `${index + 1}. ${service.nombre}`);
  return `Claro, en ${category.toLowerCase()} manejamos:\n${lines.join('\n')}\n¿Cuál te interesa cotizar?`;
}

function categoryResolved({ empresaId, plannerState, fullCatalog, category, reason = 'generic_category_request' }) {
  const categoryServices = findCategoryServices(fullCatalog.services ?? [], category);
  if (categoryServices.length === 0) return null;
  const question = renderCategoryOptions(category, categoryServices);
  const stateUpdatePreview = {
    ...plannerState,
    goal: COMMERCIAL_PLANNER_GOALS.LIST_CATALOG,
    currentStage: COMMERCIAL_PLANNER_STAGES.VIEWING_CATALOG,
    waitingField: 'category_selection',
    selectedCategory: category,
    catalogShown: true,
    activeFlowId: null,
    selectedService: null,
    collectedEntities: {},
    missingEntities: ['category_selection'],
    lastBotQuestion: question
  };
  const responsePlan = {
    type: 'catalog_listing',
    deterministicRouter: true,
    selectedType: NCIE_TYPES.SERVICE,
    services: categoryServices,
    products: [],
    categories: fullCatalog.categories ?? [],
    categoryFiltered: true,
    category,
    summary: `Opciones de ${category}`,
    question
  };
  const plannerDecision = plannerDecisionForRoute({
    stateUpdatePreview,
    selectedService: null,
    responsePlanType: 'catalog_listing',
    entities: {},
    waitingField: 'category_selection',
    nextAction: COMMERCIAL_NEXT_ACTIONS.FOLLOW_UP_CATALOG
  });
  return makeResolved({
    empresaId,
    reason,
    nlu: nluForRoute('LISTAR_SERVICIOS', { category }),
    decision: decisionForRoute(),
    responsePlan,
    plannerDecision,
    retrieval: {
      company: null,
      services: categoryServices,
      products: [],
      categories: fullCatalog.categories ?? [],
      queries: [normalizeForNcie(category)],
      semantic: { terms: [], matchedVerticals: [] },
      retrievalMode: 'deterministic_router_category'
    }
  });
}

function fullCatalogResolved({ empresaId, plannerState, fullCatalog, reason = 'service_catalog_request' }) {
  const services = fullCatalog.services ?? [];
  const products = fullCatalog.products ?? [];
  const question = '¿Cuál te gustaría cotizar?';
  const stateUpdatePreview = {
    ...plannerState,
    goal: COMMERCIAL_PLANNER_GOALS.LIST_CATALOG,
    currentStage: COMMERCIAL_PLANNER_STAGES.VIEWING_CATALOG,
    waitingField: 'catalog_selection',
    selectedCategory: null,
    catalogShown: true,
    activeFlowId: null,
    selectedService: null,
    collectedEntities: {},
    missingEntities: ['catalogo'],
    lastBotQuestion: question
  };
  const responsePlan = {
    type: 'catalog_listing',
    deterministicRouter: true,
    selectedType: NCIE_TYPES.SERVICE,
    services,
    products,
    categories: fullCatalog.categories ?? [],
    summary: 'Catalogo de servicios',
    question
  };
  const plannerDecision = plannerDecisionForRoute({
    stateUpdatePreview,
    selectedService: null,
    responsePlanType: 'catalog_listing',
    entities: {},
    waitingField: 'catalog_selection',
    nextAction: COMMERCIAL_NEXT_ACTIONS.FOLLOW_UP_CATALOG
  });
  return makeResolved({
    empresaId,
    reason,
    nlu: nluForRoute('LISTAR_SERVICIOS', { catalogRequest: true }),
    decision: decisionForRoute(),
    responsePlan,
    plannerDecision,
    retrieval: {
      company: null,
      services,
      products,
      categories: fullCatalog.categories ?? [],
      queries: ['catalogo_servicios'],
      semantic: { terms: [], matchedVerticals: [] },
      retrievalMode: 'deterministic_router_catalog'
    }
  });
}

function renderSummary(service, entities = {}) {
  const lines = [`Servicio: ${service?.nombre ?? 'por confirmar'}`];
  if (entities.quantity) lines.push(`Cantidad: ${entities.quantity} piezas`);
  if (entities.dimensions?.text) lines.push(`Medidas: ${entities.dimensions.text}`);
  if (canQuoteByArea(service) && entities.dimensions?.area) {
    lines.push(`Area: ${entities.dimensions.area} m2`);
    const unitPrice = Number(service?.precio);
    if (Number.isFinite(unitPrice)) lines.push(`Estimado: ${money(unitPrice * entities.dimensions.area)}`);
  }
  if (entities.budget) lines.push(`Presupuesto aproximado: ${money(entities.budget)}`);
  if (entities.usageContext) lines.push(`Uso: ${entities.usageContext}`);
  if (entities.objective) lines.push(`Objetivo: ${entities.objective}`);
  if (entities.designSupport !== undefined && entities.designSupport !== null) lines.push(`Diseño: ${entities.designSupport ? 'requiere apoyo' : 'ya lo tiene'}`);
  if (entities.installation !== undefined && entities.installation !== null) lines.push(`Instalación: ${entities.installation ? 'solicitada' : 'no incluida'}`);
  else if (!serviceOffersInstallation(service)) lines.push('Instalación: no incluida');
  return `Perfecto, dejo el resumen:\n${lines.join('\n')}\n\n¿Quieres que te comunique con un asesor para confirmar tiempo y precio final?`;
}

async function catalog(empresaId, mcpClient) {
  return await loadFullServiceCatalog({ empresaId, mcpClient }) ?? { services: [], categories: [] };
}

export async function routeMessage({ empresaId, conversationId, state, normalizedMessage, mcpClient }) {
  const text = normalizedText(normalizedMessage);
  const plannerState = normalizePlannerState({ state, empresaId, conversationId });
  const flow = activeFlow(plannerState);
  const waitingField = currentWaitingField(plannerState);
  const serviceFromState = serviceFromFlow(flow);
  const hasShownOptions = Boolean(
    (state?.commercial?.lastOptionsShown ?? []).length ||
    (state?.commercial?.lastShownList ?? []).length ||
    (plannerState?.waitingField === 'catalog_selection') ||
    /cotizar|catalogo|servicios que manejamos/i.test(String(state?.commercial?.lastBotQuestion ?? state?.lastBotQuestion ?? ''))
  );

  if (isServiceCatalogRequest(text, { waitingField, hasShownOptions })) {
    const fullCatalog = await catalog(empresaId, mcpClient);
    return fullCatalogResolved({
      empresaId,
      plannerState,
      fullCatalog,
      reason: flow || waitingField ? 'service_catalog_request_over_active_flow' : 'service_catalog_request'
    });
  }

  if (!flow && !waitingField && /^(gracias|muchas gracias|ok gracias|perfecto gracias)$/.test(text)) {
    return makeResolved({
      empresaId,
      reason: 'neutral_thanks_no_active_flow',
      nlu: {
        intent: 'MENSAJE_GENERAL',
        type: NCIE_TYPES.UNKNOWN,
        confidence: 1,
        entities: {},
        missing_data: [],
        reasoning_summary: 'Resolved by deterministic conversation router'
      },
      decision: decisionForRoute(),
      responsePlan: {
        type: 'neutral_thanks',
        deterministicRouter: true,
        summary: 'Agradecimiento',
        question: 'Cuando gustes te ayudo a cotizar.'
      },
      plannerDecision: plannerDecisionForRoute({
        stateUpdatePreview: plannerState,
        selectedService: null,
        responsePlanType: 'neutral_thanks',
        entities: {},
        waitingField: null
      })
    });
  }

  if (flow || waitingField) {
    const service = serviceFromState;
    const existing = flow?.entities ?? {};
    const raw = normalizedMessage?.original ?? normalizedMessage?.raw ?? normalizedMessage?.normalized ?? '';
    const interpreted = waitingField
      ? interpretResponseForWaitingField({
        waitingField,
        normalizedMessage,
        plannerState,
        pendingOptions: state?.commercial?.lastOptionsShown ?? []
      })
      : { handled: false, entities: {} };
    const repeatedGenericCategory = (waitingField === 'catalog_selection' || waitingField === 'category_selection')
      ? genericCategoryFromText(text)
      : null;
    if (repeatedGenericCategory) {
      const fullCatalogForCategory = await catalog(empresaId, mcpClient);
      const routedCategory = categoryResolved({
        empresaId,
        plannerState,
        fullCatalog: fullCatalogForCategory,
        category: repeatedGenericCategory,
        reason: 'generic_category_request'
      });
      if (routedCategory) return routedCategory;
    }
    const dimensions = resolvePendingDimensionUnit(existing.dimensions, raw) ?? interpreted.entities?.dimensions ?? parseDimensions(raw);
    const quantity = interpreted.entities?.quantity ?? quantityFromText(raw);
    const budget = interpreted.entities?.budget ?? budgetFromText(raw);
    const usageContext = usageFromText(raw);
    const objective = objectiveFromText(raw);
    const design = interpreted.entities?.design ?? detectDesignPreference(text);
    const installation = interpreted.entities?.installation ?? detectInstallationPreference(text) ?? (/^instalacion$/.test(text) ? true : null);
    const advisorYes = /^(si|si por favor|claro|claro que si|por favor|adelante|va|sale)$/.test(text);

    let entities = null;
    let nextWaiting = null;
    let responseText = null;
    let responseType = 'quote_from_memory';
    let intent = 'RESPUESTA_CONTEXTO';
    let handoff = false;

    if ((waitingField === 'catalog_selection' || waitingField === 'category_selection') && interpreted.entities?.catalogSelection?.selectedService) {
      const selected = interpreted.entities.catalogSelection.selectedService;
      const nextWaiting = nextWaitingFieldFor({ service: selected, entities: {} });
      const question = questionForWaitingField(nextWaiting, selected);
      const stateUpdatePreview = makePlannerState({
        state,
        empresaId,
        conversationId,
        service: selected,
        entities: {},
        waitingField: nextWaiting,
        lastQuestion: question
      });
      const plannerDecision = plannerDecisionForRoute({
        stateUpdatePreview,
        selectedService: selected,
        responsePlanType: 'service_explanation',
        waitingField: nextWaiting
      });
      const responsePlan = {
        type: 'service_explanation',
        deterministicRouter: true,
        selectedType: NCIE_TYPES.SERVICE,
        selected,
        priceText: 'requiere algunos detalles para cotizarse bien',
        summary: selected.nombre,
        question
      };
      return makeResolved({
        empresaId,
        reason: 'catalog_selection',
        nlu: nluForRoute('SELECCION_CATALOGO', { catalogSelection: { selectedService: selected } }),
        decision: decisionForRoute(),
        responsePlan,
        plannerDecision
      });
    }

    if (/^(gracias|muchas gracias|ok gracias|perfecto gracias)$/.test(text)) {
      const plannerDecision = plannerDecisionForRoute({
        stateUpdatePreview: plannerState,
        selectedService: service,
        responsePlanType: 'neutral_thanks',
        entities: existing,
        waitingField
      });
      const responsePlan = {
        type: 'neutral_thanks',
        deterministicRouter: true,
        summary: 'Agradecimiento',
        question: service?.nombre ? `¿Seguimos con ${service.nombre} o lo dejamos pendiente?` : 'Cuando gustes te ayudo a cotizar.'
      };
      return makeResolved({
        empresaId,
        reason: 'neutral_thanks_active_flow',
        nlu: {
          intent: 'MENSAJE_GENERAL',
          type: NCIE_TYPES.UNKNOWN,
          confidence: 1,
          entities: {},
          missing_data: [],
          reasoning_summary: 'Resolved by deterministic conversation router'
        },
        decision: decisionForRoute(),
        responsePlan,
        plannerDecision
      });
    }

    if (waitingField === 'advisor_confirmation' && advisorYes) {
      entities = { ...existing, advisorConfirmation: true, handoffRequested: true };
      nextWaiting = 'advisor_confirmation';
      responseText = 'Perfecto, te comunico con un asesor para confirmar tiempo y precio final.';
      responseType = 'quote_requirements_followup';
      intent = 'HABLAR_ASESOR';
      handoff = true;
    } else if ((waitingField === 'dimensions' || (waitingField !== 'quantity' && dimensions)) && dimensions) {
      const completedDimensions = completePartialDimensions(existing.dimensions, dimensions, raw);
      let dimensionsForState = canQuoteByArea(service) ? withCleanDimensionsText(completedDimensions) : completedDimensions;
      if (!canQuoteByArea(service) && dimensionsForState?.area) {
        const pair = String(raw).match(/(\d+(?:[.,]\d+)?|\.\d+)\s*(?:cm|centimetros?|m|metros?)?\s*(?:x|×|por|\*)\s*(\d+(?:[.,]\d+)?|\.\d+)/i);
        if (pair) dimensionsForState = { ...dimensionsForState, text: `${pair[1]}x${pair[2]}` };
      }
      if (dimensionsNeedUnitConfirmation(service, dimensionsForState, raw)) {
        dimensionsForState = {
          ...dimensionsForState,
          area: null,
          needsUnitConfirmation: true,
          rawWidth: dimensionsForState.width ?? dimensionsForState.ancho,
          rawHeight: dimensionsForState.height ?? dimensionsForState.alto,
          text: `${dimensionsForState.width ?? dimensionsForState.ancho} x ${dimensionsForState.height ?? dimensionsForState.alto}`
        };
      }
      entities = { ...existing, dimensions: dimensionsForState };
      const hasArea = Number.isFinite(Number(dimensionsForState.area)) && Number(dimensionsForState.area) > 0;
      nextWaiting = canQuoteByArea(service) && hasArea ? 'design' : serviceNeedsBudget(service) && !existing.budget ? 'budget' : 'dimensions';
      responseText = canQuoteByArea(service) && hasArea
        ? '¿Ya tienes el diseño o quieres que también te apoyemos con eso?'
        : dimensionsForState.needsUnitConfirmation
          ? `Perfecto, anoto ${dimensionsForState.text}. ¿Esas medidas son en centímetros o en metros?`
        : dimensionsForState.incomplete && dimensionsForState.length
          ? `Perfecto, tengo ${dimensionsForState.length} m de largo. ¿Qué alto aproximado tendrá?`
          : `Perfecto, anoto las medidas ${dimensionsForState.text ?? raw}. ${questionForWaitingField(nextWaiting, service)}`;
      responseType = canQuoteByArea(service) && hasArea ? 'quote_estimate' : responseType;
    } else if ((waitingField === 'budget' || (waitingField !== 'quantity' && budget)) && budget) {
      entities = { ...existing, budget };
      nextWaiting = 'usage_context';
      responseText = 'Perfecto, ¿sería para interior, exterior o evento?';
    } else if ((waitingField === 'quantity' || (quantity && /\b(pieza|piezas|pzs|unidades)\b/.test(text))) && quantity) {
      entities = { ...existing, quantity, cantidad: quantity };
      nextWaiting = 'dimensions';
      responseText = `Perfecto, anoto ${quantity} piezas. ¿Tienes medidas, diseño o algún detalle especial?`;
    } else if ((waitingField === 'usage_context' || usageContext) && usageContext) {
      entities = { ...existing, usageContext, use: usageContext };
      nextWaiting = 'advisor_confirmation';
      responseText = renderSummary(service, entities);
      responseType = 'quote_requirements_followup';
    } else if ((waitingField === 'installation' || installation !== null) && installation !== null) {
      entities = { ...existing, installation };
      nextWaiting = 'advisor_confirmation';
      responseText = renderSummary(service, entities);
      responseType = 'quote_requirements_followup';
    } else if (waitingField === 'design' && design !== null) {
      entities = { ...existing, design, designSupport: design };
      if (!serviceOffersInstallation(service)) {
        nextWaiting = 'advisor_confirmation';
        responseText = renderSummary(service, entities);
        responseType = 'quote_requirements_followup';
      } else {
        nextWaiting = 'installation';
        responseText = questionForWaitingField(nextWaiting, service);
        responseType = 'quote_design_followup';
      }
    } else if ((waitingField === 'advisor_confirmation' || flow) && design !== null) {
      entities = { ...existing, design, designSupport: design };
      nextWaiting = !entities.usageContext && !entities.use ? 'usage_context' : 'advisor_confirmation';
      responseText = nextWaiting === 'usage_context'
        ? 'Perfecto, lo tomo en cuenta. ¿Sería para interior, exterior o evento?'
        : renderSummary(service, entities);
      responseType = nextWaiting === 'usage_context' ? 'quote_from_memory' : 'quote_requirements_followup';
    } else if ((waitingField === 'advisor_confirmation' || flow) && objective) {
      entities = { ...existing, objective };
      nextWaiting = !entities.usageContext && !entities.use ? 'usage_context' : 'advisor_confirmation';
      responseText = nextWaiting === 'usage_context'
        ? 'Perfecto, lo tomo como objetivo. ¿Sería para interior, exterior o evento?'
        : renderSummary(service, entities);
      responseType = nextWaiting === 'usage_context' ? 'quote_from_memory' : 'quote_requirements_followup';
    }

    if (entities && service) {
      const quoteContext = quoteContextFromEntities(service, entities);
      const stateUpdatePreview = makePlannerState({
        state,
        empresaId,
        conversationId,
        service,
        previousFlow: flow,
        entities,
        waitingField: nextWaiting,
        lastQuestion: responseText
      });
      const plannerDecision = plannerDecisionForRoute({
        stateUpdatePreview,
        selectedService: service,
        responsePlanType: responseType,
        entities,
        waitingField: nextWaiting
      });
      const responsePlan = responseType === 'quote_estimate'
        ? quoteEstimatePlan({ service, dimensions: entities.dimensions })
        : responseType === 'quote_design_followup'
          ? {
            type: 'quote_design_followup',
            deterministicRouter: true,
            selectedType: NCIE_TYPES.SERVICE,
            selected: service,
            quoteContext,
            summary: service?.nombre ?? 'Cotizacion',
            customerAnswer: entities.designSupport ? 'requiere_apoyo_diseno' : 'ya_tiene_diseno',
            isShortAnswer: /^si|no$/.test(text),
            question: responseText
          }
        : responsePlanForQuestion({
          selectedService: service,
          text: responseText,
          quoteContext,
          type: responseType
        });
      if (responseType === 'quote_requirements_followup') {
        responsePlan.installation = entities.installation ?? false;
      }
      return makeResolved({
        empresaId,
        reason: `waiting_field_${waitingField ?? 'active_flow'}`,
        nlu: nluForRoute(intent, entities),
        decision: decisionForRoute({ handoff }),
        responsePlan,
        plannerDecision
      });
    }
  }

  const genericCategory = genericCategoryFromText(text);
  if (genericCategory) {
    const fullCatalogForCategory = await catalog(empresaId, mcpClient);
    const routedCategory = categoryResolved({
      empresaId,
      plannerState,
      fullCatalog: fullCatalogForCategory,
      category: genericCategory,
      reason: 'generic_category_request'
    });
    if (routedCategory) return routedCategory;
  }

  const fullCatalog = await catalog(empresaId, mcpClient);
  const services = fullCatalog.services ?? [];

  const pendingOptions = state?.commercial?.lastOptionsShown ?? [];
  if ((waitingField === 'catalog_selection' || waitingField === 'category_selection') && /^\d{1,3}$/.test(text)) {
    const index = Number(text) - 1;
    const selected = pendingOptions[index] ?? null;
    if (selected) {
      const nextWaiting = nextWaitingFieldFor({ service: selected, entities: {} });
      const question = questionForWaitingField(nextWaiting, selected);
      const stateUpdatePreview = makePlannerState({
        state,
        empresaId,
        conversationId,
        service: selected,
        entities: {},
        waitingField: nextWaiting,
        lastQuestion: question
      });
      const plannerDecision = plannerDecisionForRoute({
        stateUpdatePreview,
        selectedService: selected,
        responsePlanType: 'service_explanation',
        waitingField: nextWaiting
      });
      const responsePlan = {
        type: 'service_explanation',
        selectedType: NCIE_TYPES.SERVICE,
        selected,
        priceText: 'requiere algunos detalles para cotizarse bien',
        summary: selected.nombre,
        question
      };
      return makeResolved({
        empresaId,
        reason: 'catalog_selection',
        nlu: nluForRoute('SELECCION_CATALOGO', { catalogSelection: { selectedService: selected } }),
        decision: decisionForRoute(),
        responsePlan,
        plannerDecision
      });
    }
  }

  const selectedByText = exactServiceForText(text, services);
  if (selectedByText) {
    const quantity = /\b(pieza|piezas|pzs|unidades)\b/.test(text) ? quantityFromText(text) : null;
    const dimensions = parseDimensions(normalizedMessage?.original ?? text);
    const budget = budgetFromText(text);
    const entities = {
      ...(quantity ? { quantity, cantidad: quantity } : {}),
      ...(dimensions ? { dimensions } : {}),
      ...(budget ? { budget } : {})
    };
    const nextWaiting = nextWaitingFieldFor({ service: selectedByText, entities, preferred: quantity ? 'dimensions' : null });
    const question = quantity
      ? `Perfecto, anoto ${quantity} piezas. ¿Tienes medidas, diseño o algún detalle especial?`
      : questionForWaitingField(nextWaiting, selectedByText);
    const plannerType = nextWaiting === 'dimensions' ? 'ask_measurements' : 'service_explanation';
    const stateUpdatePreview = makePlannerState({
      state,
      empresaId,
      conversationId,
      service: selectedByText,
      entities,
      waitingField: nextWaiting,
      lastQuestion: question
    });
    const plannerDecision = plannerDecisionForRoute({
      stateUpdatePreview,
      selectedService: selectedByText,
      responsePlanType: plannerType,
      entities,
      waitingField: nextWaiting
    });
    const responsePlan = quantity
      ? responsePlanForQuestion({
        selectedService: selectedByText,
        text: question,
        quoteContext: quoteContextFromEntities(selectedByText, entities)
      })
      : {
        type: 'service_explanation',
        deterministicRouter: true,
        selectedType: NCIE_TYPES.SERVICE,
        selected: selectedByText,
        priceText: 'requiere algunos detalles para cotizarse bien',
        summary: selectedByText.nombre,
        question
      };
    return makeResolved({
      empresaId,
      reason: 'exact_fuzzy_service',
      nlu: nluForRoute('BUSCAR_SERVICIO', { service: selectedByText.nombre, ...entities }),
      decision: decisionForRoute(),
      responsePlan,
      plannerDecision
    });
  }

  logger.info('routeMessage_resolved', {
    empresaId,
    routeMessage_resolved: false,
    route_conversation_message_handled: false,
    activeFlow: flow?.id ?? null,
    waitingField: waitingField ?? null
  });
  return { resolved: false };
}

export async function routeConversationMessage({
  empresaId,
  phone = null,
  normalizedMessage,
  state,
  plannerState = null,
  pendingOptions = null,
  mcpClient
} = {}) {
  const routed = await routeMessage({
    empresaId,
    conversationId: phone,
    state,
    normalizedMessage,
    mcpClient
  });
  return {
    ...routed,
    handled: Boolean(routed.resolved),
    updatedPlannerState: routed.plannerDecision?.stateUpdatePreview ?? plannerState ?? null,
    advisorNotification: null,
    response: routed.responsePlan?.question ?? null,
    pendingOptions
  };
}
