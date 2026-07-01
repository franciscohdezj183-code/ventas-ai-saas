import { NCIE_ACTIONS, NCIE_FUNNEL_STAGES, NCIE_TYPES } from './conversation-engine.types.js';

export const COMMERCIAL_GOALS = Object.freeze({
  EXPLORE_COMPANY: 'explore_company',
  FIND_SOLUTION: 'find_solution',
  QUOTE: 'quote',
  COMPARE: 'compare',
  FOLLOW_UP: 'follow_up',
  CONVERSATION: 'conversation'
});

export const COMMERCIAL_ACTIONS = Object.freeze({
  SUMMARIZE_BUSINESS: 'summarize_business',
  SEARCH_DOMAIN: 'search_domain',
  USE_MEMORY: 'use_memory',
  ASK_CLARIFYING_QUESTION: 'ask_clarifying_question',
  COMPARE_OPTIONS: 'compare_options',
  CONTINUE_CONVERSATION: 'continue_conversation',
  ESCALATE_HUMAN: 'escalate_human'
});

function hasCommercialMemory(state) {
  return Boolean(
    state?.lastServiceId ||
    state?.lastProductId ||
    state?.lastService ||
    state?.lastProduct ||
    state?.lastServices?.length ||
    state?.lastProducts?.length ||
    state?.commercial?.lastDomain ||
    state?.commercial?.customerGoal
  );
}

function normalizeNeed({ nlu, normalizedMessage, state }) {
  return nlu?.entities?.service
    || nlu?.entities?.product
    || nlu?.entities?.problem
    || normalizedMessage?.normalized
    || state?.currentNeed
    || state?.needSummary
    || null;
}

function lastSelected(state) {
  if (state?.lastService) return { type: NCIE_TYPES.SERVICE, item: state.lastService };
  if (state?.lastProduct) return { type: NCIE_TYPES.PRODUCT, item: state.lastProduct };
  return null;
}

function hasMeasurementInput(normalizedMessage) {
  const text = normalizedMessage?.normalized ?? '';
  return /\b\d+(?:[.,]\d+)?\s*(?:x|por)\s*\d+(?:[.,]\d+)?\b/.test(text);
}

function respondsToLastBotQuestion({ normalizedMessage, state }) {
  if (!hasCommercialMemory(state)) return false;
  const text = normalizedMessage?.normalized ?? '';
  const question = [
    state?.lastBotQuestion,
    state?.commercial?.lastBotQuestion,
    state?.commercial?.lastQuestion
  ].filter(Boolean).join(' ');
  const normalizedQuestion = String(question).toLowerCase();
  if (!question) return false;

  const isShortAnswer = /^(si|sí|no|claro|ok|va|sale)$/.test(text);
  if (isShortAnswer && state?.commercial?.lastQuoteContext) return true;

  const ignoredTokens = new Set(['tambien', 'quieres', 'quiero', 'puedes', 'puedo', 'tienes', 'hacen', 'para', 'con', 'que', 'esto', 'este', 'esta', 'como']);
  const messageTokens = new Set((normalizedMessage?.tokens ?? []).filter((token) => token.length > 3 && !ignoredTokens.has(token)));
  const questionTokens = new Set(normalizedQuestion
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 3 && !ignoredTokens.has(token)));
  return [...messageTokens].some((token) => questionTokens.has(token));
}

function hasSpecificCurrentNeed({ nlu, normalizedMessage }) {
  if (nlu?.entities?.service || nlu?.entities?.product || nlu?.entities?.problem || nlu?.entities?.symptom) return true;
  if (nlu?.intent !== 'INTENCION_COMPRA') return false;
  return (normalizedMessage?.tokens ?? []).length > 2;
}

function goalFromNlu({ nlu, normalizedMessage, state }) {
  if (nlu.type === NCIE_TYPES.HUMAN) return COMMERCIAL_GOALS.FOLLOW_UP;
  if (nlu.intent === 'LISTAR_SERVICIOS' || nlu.intent === 'LISTAR_PRODUCTOS' || nlu.intent === 'LISTAR_CATALOGO') {
    return COMMERCIAL_GOALS.EXPLORE_COMPANY;
  }
  if (hasCommercialMemory(state) && hasMeasurementInput(normalizedMessage)) return COMMERCIAL_GOALS.QUOTE;
  if (respondsToLastBotQuestion({ normalizedMessage, state })) return COMMERCIAL_GOALS.QUOTE;
  if (
    (nlu.intent === 'CONSULTAR_PRECIO' || nlu.intent === 'INTENCION_COMPRA') &&
    hasSpecificCurrentNeed({ nlu, normalizedMessage })
  ) {
    return COMMERCIAL_GOALS.FIND_SOLUTION;
  }
  if (nlu.intent === 'CONSULTAR_PRECIO' || nlu.intent === 'INTENCION_COMPRA') return COMMERCIAL_GOALS.QUOTE;
  if (nlu.intent === 'ACLARACION_CLIENTE') return COMMERCIAL_GOALS.FOLLOW_UP;
  if (hasCommercialMemory(state) && nlu.intent === 'MENSAJE_GENERAL' && Number(nlu.confidence ?? 0) < 0.5) {
    return COMMERCIAL_GOALS.FOLLOW_UP;
  }
  if (nlu.intent === 'BUSCAR_PRODUCTO' && hasCommercialMemory(state)) return COMMERCIAL_GOALS.COMPARE;
  if (nlu.type === NCIE_TYPES.SERVICE || nlu.type === NCIE_TYPES.PRODUCT) return COMMERCIAL_GOALS.FIND_SOLUTION;

  const tokens = normalizedMessage?.tokens ?? [];
  if (tokens.length <= 1) return COMMERCIAL_GOALS.CONVERSATION;
  return COMMERCIAL_GOALS.FIND_SOLUTION;
}

function actionForGoal({ goal, nlu, state }) {
  if (nlu.type === NCIE_TYPES.HUMAN) return COMMERCIAL_ACTIONS.ESCALATE_HUMAN;
  if (goal === COMMERCIAL_GOALS.EXPLORE_COMPANY) return COMMERCIAL_ACTIONS.SUMMARIZE_BUSINESS;
  if (goal === COMMERCIAL_GOALS.FOLLOW_UP && hasCommercialMemory(state)) return COMMERCIAL_ACTIONS.SUMMARIZE_BUSINESS;
  if (goal === COMMERCIAL_GOALS.QUOTE && hasCommercialMemory(state)) return COMMERCIAL_ACTIONS.USE_MEMORY;
  if (goal === COMMERCIAL_GOALS.QUOTE) return COMMERCIAL_ACTIONS.ASK_CLARIFYING_QUESTION;
  if (goal === COMMERCIAL_GOALS.COMPARE) return COMMERCIAL_ACTIONS.COMPARE_OPTIONS;
  if (goal === COMMERCIAL_GOALS.CONVERSATION) return COMMERCIAL_ACTIONS.CONTINUE_CONVERSATION;
  return COMMERCIAL_ACTIONS.SEARCH_DOMAIN;
}

function stageForGoal(goal, nlu, state) {
  if (goal === COMMERCIAL_GOALS.QUOTE) return NCIE_FUNNEL_STAGES.QUOTING;
  if (goal === COMMERCIAL_GOALS.FIND_SOLUTION && (nlu.entities?.problem || state?.detectedProblem)) {
    return NCIE_FUNNEL_STAGES.DIAGNOSTIC;
  }
  if (goal === COMMERCIAL_GOALS.FOLLOW_UP) return state?.funnelStage ?? NCIE_FUNNEL_STAGES.EXPLORING;
  return NCIE_FUNNEL_STAGES.EXPLORING;
}

export function reasonCommercially({ nlu, normalizedMessage, state }) {
  const conversationGoal = goalFromNlu({ nlu, normalizedMessage, state });
  const recommendedAction = actionForGoal({ goal: conversationGoal, nlu, state });
  const customerNeed = normalizeNeed({ nlu, normalizedMessage, state });
  const selected = lastSelected(state);
  const domain = nlu?.entities?.problem
    || state?.commercial?.lastDomain
    || state?.detectedProblem
    || state?.probableService
    || state?.probableProduct
    || null;

  return {
    conversation_goal: conversationGoal,
    conversation_stage: stageForGoal(conversationGoal, nlu, state),
    customer_need: customerNeed,
    domain,
    last_selected: selected,
    need_clarification: recommendedAction === COMMERCIAL_ACTIONS.ASK_CLARIFYING_QUESTION,
    recommended_action: recommendedAction,
    retrieval_strategy: recommendedAction === COMMERCIAL_ACTIONS.SUMMARIZE_BUSINESS
      ? 'business_summary'
      : recommendedAction === COMMERCIAL_ACTIONS.USE_MEMORY
        ? 'memory'
        : recommendedAction === COMMERCIAL_ACTIONS.CONTINUE_CONVERSATION
          ? 'none'
          : 'domain_search',
    target_type: nlu.type === NCIE_TYPES.UNKNOWN ? null : nlu.type,
    reasoning_summary: 'Commercial Reasoner determino objetivo, etapa y siguiente accion antes de recuperar datos.'
  };
}

export function decisionFromCommercialReasoning({ commercialReasoning, nlu, retrieval, state }) {
  if (commercialReasoning.recommended_action === COMMERCIAL_ACTIONS.ESCALATE_HUMAN) {
    return {
      action: NCIE_ACTIONS.ESCALATE_HUMAN,
      selectedType: nlu.type,
      missingData: [],
      funnelStage: NCIE_FUNNEL_STAGES.HUMAN,
      confidence: nlu.confidence,
      score: 0,
      shouldCreateLead: true,
      needSummary: commercialReasoning.customer_need
    };
  }

  if (commercialReasoning.recommended_action === COMMERCIAL_ACTIONS.USE_MEMORY && (state?.lastServiceId || state?.lastProductId)) {
    return {
      action: NCIE_ACTIONS.ASK_CLARIFYING_QUESTION,
      selectedType: state.lastServiceId ? NCIE_TYPES.SERVICE : NCIE_TYPES.PRODUCT,
      missingData: ['detalle_cotizacion'],
      funnelStage: NCIE_FUNNEL_STAGES.QUOTING,
      confidence: nlu.confidence,
      score: 0,
      shouldCreateLead: false,
      needSummary: commercialReasoning.customer_need ?? state?.needSummary
    };
  }

  const topServiceScore = Number(retrieval?.services?.[0]?.score ?? 0);
  const topProductScore = Number(retrieval?.products?.[0]?.score ?? 0);
  const topScore = Math.max(topServiceScore, topProductScore);
  const selectedType = topServiceScore >= topProductScore && retrieval?.services?.length
    ? NCIE_TYPES.SERVICE
    : retrieval?.products?.length
      ? NCIE_TYPES.PRODUCT
      : commercialReasoning.target_type ?? NCIE_TYPES.UNKNOWN;

  return {
    action: (nlu.missing_data ?? []).length > 0 && topScore < 8
      ? NCIE_ACTIONS.ASK_CLARIFYING_QUESTION
      : commercialReasoning.recommended_action === COMMERCIAL_ACTIONS.SUMMARIZE_BUSINESS
      ? NCIE_ACTIONS.ANSWER_WITH_RESULTS
      : commercialReasoning.need_clarification
        ? NCIE_ACTIONS.ASK_CLARIFYING_QUESTION
        : NCIE_ACTIONS.ANSWER_WITH_RESULTS,
    selectedType,
    missingData: commercialReasoning.need_clarification ? ['detalle'] : [],
    funnelStage: commercialReasoning.conversation_stage,
    confidence: nlu.confidence,
    score: topScore,
    shouldCreateLead: false,
    needSummary: commercialReasoning.customer_need
  };
}
