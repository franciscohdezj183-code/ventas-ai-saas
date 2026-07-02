import { NCIE_ACTIONS, NCIE_FUNNEL_STAGES, NCIE_TYPES } from './conversation-engine.types.js';
import { logLegacyDecisionDetected } from './legacy-decision-warning.js';

/**
 * @deprecated LegacyOnly: action selection authority moved to Unified Planner ExecutionPlan.
 * Keep temporarily for legacy engine rollback and non-canary companies only.
 */

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
  const decisionContext = {
    module: 'decision-engine',
    responsibility: 'next_action_selection',
    empresaId: state?.empresaId ?? null,
    conversationId: state?.conversationId ?? null
  };

  if (nlu.type === NCIE_TYPES.HUMAN) {
    logLegacyDecisionDetected({ ...decisionContext, decision: NCIE_ACTIONS.ESCALATE_HUMAN, reason: 'human_type' });
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
    logLegacyDecisionDetected({ ...decisionContext, decision: NCIE_ACTIONS.CREATE_LEAD, reason: 'purchase_with_active_memory' });
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
    logLegacyDecisionDetected({ ...decisionContext, decision: NCIE_ACTIONS.ANSWER_WITH_RESULTS, reason: 'list_intent_with_results' });
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
    logLegacyDecisionDetected({ ...decisionContext, decision: action, reason: 'retrieval_results_scored' });
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
    logLegacyDecisionDetected({ ...decisionContext, decision: NCIE_ACTIONS.ASK_CLARIFYING_QUESTION, reason: 'low_confidence_or_missing_data' });
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

  logLegacyDecisionDetected({ ...decisionContext, decision: NCIE_ACTIONS.GENERAL_REPLY, reason: 'default_general_reply' });
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
