import {
  findConversationContext,
  saveConversationContext
} from '../bot/conversationContext.service.js';
import { NCIE_FUNNEL_STAGES } from './conversation-engine.types.js';

function parseData(context) {
  return context?.datos_json && typeof context.datos_json === 'object'
    ? context.datos_json
    : {};
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

  return {
    legacyContext,
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
  contextStore = {
    find: findConversationContext,
    save: saveConversationContext
  }
}) {
  const selectedType = responsePlan?.selectedType ?? decision?.selectedType ?? nlu?.type;
  const serviceSelectionPlans = new Set(['service_explanation', 'quote_from_memory', 'quote_estimate', 'quote_design_followup']);
  const productSelectionPlans = new Set(['product_explanation']);
  const planSelectedService = selectedType === 'service' && serviceSelectionPlans.has(responsePlan?.type)
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
    'personalized_products_summary'
  ].includes(responsePlan?.type);
  const bestService = planSelectedService ?? (clearsActiveSelection ? null : state?.lastService ?? null);
  const bestProduct = planSelectedProduct ?? (clearsActiveSelection ? null : state?.lastProduct ?? null);
  const lastServiceId = planSelectedProduct
    ? null
    : planSelectedService
      ? planSelectedService?.id ?? state?.lastServiceId ?? null
      : clearsActiveSelection ? null : state?.lastServiceId ?? null;
  const lastProductId = planSelectedService
    ? null
    : planSelectedProduct
      ? planSelectedProduct?.id ?? state?.lastProductId ?? null
      : clearsActiveSelection ? null : state?.lastProductId ?? null;
  const previousData = state?.legacyContext?.datos_json ?? {};
  const missingData = decision?.missingData ?? nlu?.missing_data ?? [];
  const needSummary = decision?.needSummary ?? response?.summary ?? state?.needSummary ?? null;
  const lastCategory = bestService?.categoria ?? bestProduct?.categoria ?? (clearsActiveSelection ? null : state?.commercial?.lastCategory ?? null);
  const isListPlan = ['business_summary', 'recommend_options', 'compare_options', 'consultative_options'].includes(responsePlan?.type);
  const lastShownList = responsePlan?.options
    ?? responsePlan?.families
    ?? (isListPlan ? retrieval?.services ?? retrieval?.products ?? [] : state?.commercial?.lastOptionsShown ?? state?.commercial?.lastShownList ?? []);
  const lastSelection = planSelectedService ?? planSelectedProduct ?? (clearsActiveSelection ? null : state?.commercial?.lastSelection ?? null);
  const quoteContext = responsePlan?.type === 'quote_estimate'
    ? {
      service_id: bestService?.id ?? null,
      service_name: bestService?.nombre ?? null,
      dimensions: responsePlan.dimensions,
      unit_price: responsePlan.unitPrice ?? null,
      total: responsePlan.total ?? null
    }
    : responsePlan?.type === 'quote_from_memory' || responsePlan?.type === 'quote_design_followup'
      ? {
        ...(state?.commercial?.lastQuoteContext ?? {}),
        service_id: bestService?.id ?? state?.commercial?.lastQuoteContext?.service_id ?? null,
        service_name: bestService?.nombre ?? state?.commercial?.lastQuoteContext?.service_name ?? null,
        question: response?.question ?? null,
        design_support: responsePlan?.type === 'quote_design_followup'
          ? responsePlan.customerAnswer !== 'ya_tiene_diseno'
          : state?.commercial?.lastQuoteContext?.design_support ?? null
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
  const plannerState = plannerDecision?.stateUpdatePreview
    ? {
      ...plannerDecision.stateUpdatePreview,
      lastBotQuestion: preservePlannerQuestion
        ? plannerDecision.stateUpdatePreview.lastBotQuestion ?? null
        : response?.question ?? plannerDecision.stateUpdatePreview.lastBotQuestion ?? null,
      flows: (plannerDecision.stateUpdatePreview.flows ?? []).map((flow) => (
        flow.id === plannerDecision.stateUpdatePreview.activeFlowId
          ? {
            ...flow,
            lastQuestion: preservePlannerQuestion
              ? flow.lastQuestion ?? null
              : response?.question ?? flow.lastQuestion ?? null
          }
          : flow
      ))
    }
    : state?.commercial?.plannerState ?? null;

  return contextStore.save({
    empresaId,
    phone,
    ultimaIntencion: nlu?.intent ?? 'MENSAJE_GENERAL',
    ultimoProductoId: lastProductId,
    ultimoServicioId: lastServiceId,
    ultimoTextoBusqueda: nlu?.entities?.service
      ?? nlu?.entities?.product
      ?? nlu?.entities?.problem
      ?? state?.lastSearchText,
    datos: {
      ...previousData,
      producto: bestProduct ?? (clearsActiveSelection ? null : previousData.producto ?? null),
      servicio: bestService ?? (clearsActiveSelection ? null : previousData.servicio ?? null),
      ultima_lista_productos: retrieval?.products ?? previousData.ultima_lista_productos ?? [],
      ultima_lista_servicios: retrieval?.services ?? previousData.ultima_lista_servicios ?? [],
      ncie: {
        problem: nlu?.entities?.problem ?? state?.detectedProblem ?? null,
        symptom: nlu?.entities?.symptom ?? null,
        necesidad_actual: needSummary,
        problema_detectado: nlu?.entities?.problem ?? state?.detectedProblem ?? null,
        servicio_probable: bestService?.nombre ?? (clearsActiveSelection ? null : nlu?.entities?.service ?? state?.probableService ?? null),
        producto_probable: bestProduct?.nombre ?? (clearsActiveSelection ? null : nlu?.entities?.product ?? state?.probableProduct ?? null),
        ultima_pregunta_bot: response?.question ?? null,
        datos_recolectados: collectedData,
        datos_faltantes: missingData,
        missing_data: missingData,
        etapa_comercial: decision?.funnelStage ?? state?.funnelStage ?? NCIE_FUNNEL_STAGES.EXPLORING,
        funnel_stage: decision?.funnelStage ?? state?.funnelStage ?? NCIE_FUNNEL_STAGES.EXPLORING,
        need_summary: needSummary,
        last_decision: decision?.action ?? null,
        ultimo_dominio: clearsActiveSelection ? null : commercialReasoning?.domain ?? lastCategory ?? state?.commercial?.lastDomain ?? null,
        ultimo_servicio: bestService?.nombre ?? (clearsActiveSelection ? null : state?.commercial?.lastService ?? null),
        ultima_categoria: lastCategory,
        ultima_pregunta: response?.question ?? state?.commercial?.lastQuestion ?? null,
        ultima_lista_mostrada: lastShownList,
        ultima_seleccion: lastSelection,
        active_service_id: bestService?.id ?? null,
        active_service_name: bestService?.nombre ?? null,
        active_domain: bestService?.categoria ?? (clearsActiveSelection ? null : commercialReasoning?.domain ?? state?.commercial?.activeDomain ?? null),
        last_quote_context: quoteContext,
        last_bot_question: response?.question ?? state?.commercial?.lastBotQuestion ?? null,
        last_options_shown: lastShownList,
        objetivo_cliente: plannerDecision?.detectedMarketingGoal ?? commercialReasoning?.conversation_goal ?? state?.commercial?.customerGoal ?? null,
        commercial_reasoning: commercialReasoning,
        response_plan: responsePlan,
        planner_state: plannerState
      }
    }
  });
}
