export const NCIE_TYPES = Object.freeze({
  PRODUCT: 'product',
  SERVICE: 'service',
  SUPPORT: 'support',
  PURCHASE: 'purchase',
  SCHEDULE: 'schedule',
  PAYMENT: 'payment',
  HUMAN: 'human',
  UNKNOWN: 'unknown'
});

export const NCIE_FUNNEL_STAGES = Object.freeze({
  EXPLORING: 'exploracion',
  DIAGNOSTIC: 'diagnostico',
  INTERESTED: 'interesado',
  QUOTING: 'cotizacion',
  PURCHASE: 'compra',
  HUMAN: 'humano'
});

export const NCIE_ACTIONS = Object.freeze({
  ANSWER_WITH_RESULTS: 'answer_with_results',
  ASK_CLARIFYING_QUESTION: 'ask_clarifying_question',
  OFFER_SIMILAR_OPTIONS: 'offer_similar_options',
  USE_CONTEXT: 'use_context',
  CREATE_LEAD: 'create_lead',
  ESCALATE_HUMAN: 'escalate_human',
  GENERAL_REPLY: 'general_reply'
});

export function buildEmptyNluResult() {
  return {
    intent: 'MENSAJE_GENERAL',
    type: NCIE_TYPES.UNKNOWN,
    confidence: 0,
    entities: {
      product: null,
      service: null,
      problem: null,
      symptom: null,
      urgency: null,
      budget: null,
      date: null,
      location: null
    },
    missing_data: [],
    recommended_action: NCIE_ACTIONS.ASK_CLARIFYING_QUESTION,
    reasoning_summary: ''
  };
}

export function normalizeNcieType(value) {
  const type = String(value ?? '').trim().toLowerCase();
  return Object.values(NCIE_TYPES).includes(type) ? type : NCIE_TYPES.UNKNOWN;
}
