export const PLAN_KEYS = Object.freeze({
  STARTER: 'starter',
  BUSINESS: 'business',
  ENTERPRISE: 'enterprise'
});

export const PLAN_ALIASES = Object.freeze({
  STARTER: PLAN_KEYS.STARTER,
  starter: PLAN_KEYS.STARTER,
  BASICO: PLAN_KEYS.STARTER,
  basico: PLAN_KEYS.STARTER,
  BUSINESS: PLAN_KEYS.BUSINESS,
  business: PLAN_KEYS.BUSINESS,
  PRO: PLAN_KEYS.BUSINESS,
  pro: PLAN_KEYS.BUSINESS,
  ENTERPRISE: PLAN_KEYS.ENTERPRISE,
  enterprise: PLAN_KEYS.ENTERPRISE
});

export const PLAN_CONFIG = Object.freeze({
  [PLAN_KEYS.STARTER]: {
    key: PLAN_KEYS.STARTER,
    label: 'Starter',
    legacyPlan: 'BASICO',
    limits: {
      whatsapp: 1,
      users: 1,
      aiMessagesMonthly: 500,
      products: 100
    },
    features: [
      'basic_conversations',
      'basic_orders'
    ],
    estimatedMonthlyPrice: 499
  },
  [PLAN_KEYS.BUSINESS]: {
    key: PLAN_KEYS.BUSINESS,
    label: 'Business',
    legacyPlan: 'PRO',
    limits: {
      whatsapp: 3,
      users: 10,
      aiMessagesMonthly: 5000,
      products: null
    },
    features: [
      'crm',
      'leads',
      'orders',
      'reports',
      'ai_config'
    ],
    estimatedMonthlyPrice: 1499
  },
  [PLAN_KEYS.ENTERPRISE]: {
    key: PLAN_KEYS.ENTERPRISE,
    label: 'Enterprise',
    legacyPlan: 'ENTERPRISE',
    limits: {
      whatsapp: null,
      users: null,
      aiMessagesMonthly: 20000,
      products: null
    },
    features: [
      'custom_ai',
      'advanced_reports',
      'multi_branch',
      'api',
      'priority_support'
    ],
    estimatedMonthlyPrice: 4999
  }
});

export function normalizePlan(plan) {
  return PLAN_ALIASES[String(plan ?? '').trim()] ?? PLAN_KEYS.STARTER;
}

export function getPlanConfig(plan) {
  return PLAN_CONFIG[normalizePlan(plan)];
}

export function isUnlimitedLimit(limit) {
  return limit === null || limit === undefined;
}
