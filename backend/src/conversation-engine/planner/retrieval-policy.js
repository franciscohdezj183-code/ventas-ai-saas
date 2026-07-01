import { COMMERCIAL_PLANNER_GOALS, COMMERCIAL_NEXT_ACTIONS } from './commercial-state.schema.js';
import { normalizeForNcie } from '../message-normalizer.js';

function textTokens(value) {
  return normalizeForNcie(value)
    .split(/\s+/)
    .filter((token) => token.length > 3);
}

function activeFlowMatchesMessage(activeFlow, normalizedMessage) {
  const text = normalizeForNcie(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '');
  const activeText = normalizeForNcie(activeFlow?.selectedServiceName ?? '');
  const tokens = textTokens(text);
  return tokens.some((token) => activeText.includes(token));
}

function looksLikeSpecificCommercialRequest(normalizedMessage) {
  const text = normalizeForNcie(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '');
  const tokens = textTokens(text);
  const usefulTokens = tokens.filter((token) => !['quiero', 'gustaria', 'interesa', 'tambien', 'hacen', 'pueden', 'tienen'].includes(token));
  return usefulTokens.length > 0 && /\b(quiero|gustaria|interesa|tambien|tienen|hacen|cotizar|continuemos|sigamos)\b/.test(text);
}

export function planRetrievalPolicy({ goal, activeFlow = null, missing = [], nlu = null, normalizedMessage = null } = {}) {
  const hasSelectedService = Boolean(activeFlow?.selectedServiceId || activeFlow?.selectedServiceName);

  if (goal === COMMERCIAL_PLANNER_GOALS.FOLLOW_UP_CATALOG) {
    return {
      retrievalNeeded: true,
      reason: 'customer_asked_catalog_follow_up',
      nextAction: COMMERCIAL_NEXT_ACTIONS.FOLLOW_UP_CATALOG
    };
  }

  if (goal === COMMERCIAL_PLANNER_GOALS.EXPLORE_COMPANY || goal === COMMERCIAL_PLANNER_GOALS.KNOW_COMPANY) {
    return {
      retrievalNeeded: true,
      reason: 'customer_wants_company_catalog',
      nextAction: COMMERCIAL_NEXT_ACTIONS.FOLLOW_UP_CATALOG
    };
  }

  if (hasSelectedService && missing.length > 0) {
    if (
      goal === COMMERCIAL_PLANNER_GOALS.QUOTE &&
      looksLikeSpecificCommercialRequest(normalizedMessage) &&
      !activeFlowMatchesMessage(activeFlow, normalizedMessage)
    ) {
      return {
        retrievalNeeded: true,
        reason: 'possible_topic_switch_while_waiting_missing_information',
        nextAction: COMMERCIAL_NEXT_ACTIONS.RETRIEVE_OPTIONS
      };
    }

    return {
      retrievalNeeded: false,
      reason: 'active_flow_missing_information',
      nextAction: COMMERCIAL_NEXT_ACTIONS.ASK_MISSING_INFO
    };
  }

  if (hasSelectedService) {
    if (
      goal === COMMERCIAL_PLANNER_GOALS.QUOTE &&
      looksLikeSpecificCommercialRequest(normalizedMessage) &&
      !activeFlowMatchesMessage(activeFlow, normalizedMessage)
    ) {
      return {
        retrievalNeeded: true,
        reason: 'possible_topic_switch_from_active_flow',
        nextAction: COMMERCIAL_NEXT_ACTIONS.RETRIEVE_OPTIONS
      };
    }

    if (['INTENCION_COMPRA', 'CONSULTAR_PRECIO'].includes(nlu?.intent)) {
      return {
        retrievalNeeded: false,
        reason: 'active_service_can_continue',
        nextAction: COMMERCIAL_NEXT_ACTIONS.ANSWER_FROM_CONTEXT
      };
    }

    return {
      retrievalNeeded: false,
      reason: 'active_flow_can_continue_without_retrieval',
      nextAction: COMMERCIAL_NEXT_ACTIONS.ANSWER_FROM_CONTEXT
    };
  }

  return {
    retrievalNeeded: true,
    reason: 'no_active_service_or_context_change_possible',
    nextAction: COMMERCIAL_NEXT_ACTIONS.RETRIEVE_OPTIONS
  };
}
