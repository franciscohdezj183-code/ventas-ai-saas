import { NCIE_ACTIONS, NCIE_FUNNEL_STAGES, NCIE_TYPES } from './conversation-engine.types.js';

function hasResults(retrieval, type) {
  if (type === NCIE_TYPES.SERVICE) return (retrieval?.services?.length ?? 0) > 0;
  if (type === NCIE_TYPES.PRODUCT) return (retrieval?.products?.length ?? 0) > 0;
  return (retrieval?.services?.length ?? 0) > 0 || (retrieval?.products?.length ?? 0) > 0;
}

function selectedTypeFromResults(nlu, retrieval, state) {
  if (nlu.type === NCIE_TYPES.SERVICE && (retrieval?.services?.length || state?.lastServiceId)) return NCIE_TYPES.SERVICE;
  if (nlu.type === NCIE_TYPES.PRODUCT && (retrieval?.products?.length || state?.lastProductId)) return NCIE_TYPES.PRODUCT;
  if (retrieval?.services?.length) return NCIE_TYPES.SERVICE;
  if (retrieval?.products?.length) return NCIE_TYPES.PRODUCT;
  return nlu.type;
}

function topScore(retrieval, type) {
  if (type === NCIE_TYPES.SERVICE) return Number(retrieval?.services?.[0]?.score ?? 0);
  if (type === NCIE_TYPES.PRODUCT) return Number(retrieval?.products?.[0]?.score ?? 0);
  return Math.max(Number(retrieval?.services?.[0]?.score ?? 0), Number(retrieval?.products?.[0]?.score ?? 0));
}

export function decideNextAction({ nlu, retrieval, state }) {
  const selectedType = selectedTypeFromResults(nlu, retrieval, state);
  const missingData = [...(nlu.missing_data ?? [])];
  const score = topScore(retrieval, selectedType);

  if (nlu.type === NCIE_TYPES.HUMAN) {
    return {
      action: NCIE_ACTIONS.ESCALATE_HUMAN,
      selectedType,
      missingData: [],
      funnelStage: NCIE_FUNNEL_STAGES.HUMAN,
      confidence: nlu.confidence,
      shouldCreateLead: true,
      needSummary: nlu.reasoning_summary
    };
  }

  if (nlu.intent === 'INTENCION_COMPRA' && (state?.lastProductId || state?.lastServiceId)) {
    return {
      action: NCIE_ACTIONS.CREATE_LEAD,
      selectedType: state.lastServiceId ? NCIE_TYPES.SERVICE : NCIE_TYPES.PRODUCT,
      missingData: [],
      funnelStage: NCIE_FUNNEL_STAGES.INTERESTED,
      confidence: nlu.confidence,
      shouldCreateLead: true,
      needSummary: state.needSummary ?? state.lastSearchText ?? 'Cliente interesado'
    };
  }

  if ((nlu.intent === 'LISTAR_SERVICIOS' || nlu.intent === 'LISTAR_PRODUCTOS') && hasResults(retrieval, selectedType)) {
    return {
      action: NCIE_ACTIONS.ANSWER_WITH_RESULTS,
      selectedType,
      missingData: [],
      funnelStage: NCIE_FUNNEL_STAGES.EXPLORING,
      confidence: nlu.confidence,
      score,
      shouldCreateLead: false,
      needSummary: nlu.intent === 'LISTAR_SERVICIOS' ? 'Catalogo de servicios' : 'Catalogo de productos'
    };
  }

  if (hasResults(retrieval, selectedType)) {
    if (nlu.type === NCIE_TYPES.UNKNOWN && score < 7) {
      return {
        action: NCIE_ACTIONS.ASK_CLARIFYING_QUESTION,
        selectedType: NCIE_TYPES.UNKNOWN,
        missingData: missingData.length ? missingData : ['necesidad'],
        funnelStage: NCIE_FUNNEL_STAGES.EXPLORING,
        confidence: nlu.confidence,
        score,
        shouldCreateLead: false,
        needSummary: state?.needSummary ?? null
      };
    }

    const action = missingData.length > 0 && nlu.confidence < 0.7
      ? NCIE_ACTIONS.OFFER_SIMILAR_OPTIONS
      : score >= 16
      ? NCIE_ACTIONS.ANSWER_WITH_RESULTS
      : score >= 7
        ? NCIE_ACTIONS.OFFER_SIMILAR_OPTIONS
        : NCIE_ACTIONS.ASK_CLARIFYING_QUESTION;
    return {
      action: nlu.confidence < 0.55 && action === NCIE_ACTIONS.ANSWER_WITH_RESULTS
        ? NCIE_ACTIONS.OFFER_SIMILAR_OPTIONS
        : action,
      selectedType,
      missingData: action === NCIE_ACTIONS.ASK_CLARIFYING_QUESTION && missingData.length === 0 ? ['detalle'] : missingData,
      funnelStage: nlu.entities?.problem
        ? NCIE_FUNNEL_STAGES.DIAGNOSTIC
        : nlu.intent === 'CONSULTAR_PRECIO'
          ? NCIE_FUNNEL_STAGES.QUOTING
          : NCIE_FUNNEL_STAGES.EXPLORING,
      confidence: nlu.confidence,
      score,
      shouldCreateLead: false,
      needSummary: nlu.entities?.problem ?? nlu.entities?.service ?? nlu.entities?.product ?? state?.needSummary
    };
  }

  if (
    nlu.confidence < 0.65
    || nlu.entities?.problem
    || nlu.entities?.symptom
    || missingData.length > 0
  ) {
    return {
      action: NCIE_ACTIONS.ASK_CLARIFYING_QUESTION,
      selectedType,
      missingData: missingData.length ? missingData : ['detalle'],
      funnelStage: NCIE_FUNNEL_STAGES.EXPLORING,
      confidence: nlu.confidence,
      score,
      shouldCreateLead: false,
      falseNegativeRisk: Boolean(nlu.entities?.problem || nlu.entities?.symptom),
      needSummary: nlu.entities?.problem ?? state?.needSummary ?? null
    };
  }

  return {
    action: NCIE_ACTIONS.GENERAL_REPLY,
    selectedType,
    missingData,
    funnelStage: NCIE_FUNNEL_STAGES.EXPLORING,
    confidence: nlu.confidence,
    score,
    shouldCreateLead: false,
    needSummary: state?.needSummary ?? null
  };
}
