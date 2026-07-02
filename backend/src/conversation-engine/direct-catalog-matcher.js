import { normalizeForNcie } from './message-normalizer.js';
import { logLegacyDecisionDetected } from './legacy-decision-warning.js';

/**
 * @deprecated LegacyOnly: catalog matching authority moved to entity-extractor + Unified Planner.
 * Keep temporarily for legacy engine rollback and non-canary companies only.
 */

const SERVICE_ALIASES = [
  { pattern: /\bpromocionales?\b.*\b(corte de vinil|vinil)\b|\bpromcionalesd e corte de vinil\b|\bcorte de vinil\b.*\bpromocionales?\b/, name: 'Promocionales con corte de vinil', score: 0.96 },
  { pattern: /\bvinil impreso\b/, name: 'Vinil impreso', score: 0.95 },
  { pattern: /\brotulacion|rotular\b/, name: 'Vinil de rotulacion de color', score: 0.93 },
  { pattern: /\blona|impresion de lona\b/, name: 'Impresion de lona', score: 0.94 },
  { pattern: /\blogotipo|logo|diseno de logo|diseno de logotipo\b/, name: 'Diseno de logotipo', score: 0.95 }
];

const CATEGORY_ALIASES = [
  { pattern: /^(?:me interesa|quiero|necesito|una|un|\s)*\bimpresion(?:es)?\b\s*$/, category: 'Impresion', score: 0.92 },
  { pattern: /\btextil|playeras?|camisetas?|ropa\b/, category: 'Textil', score: 0.86 },
  { pattern: /\bpromocionales?|promos?\b/, category: 'Promocionales', score: 0.82 },
  { pattern: /\bsenaletica|senalizacion|senales\b/, category: 'Senaletica', score: 0.86 },
  { pattern: /\bbanners?|banner arana|arana\b/, category: 'Banners', score: 0.78 },
  { pattern: /\bdiseno|imagen corporativa|identidad\b/, category: 'Diseno', score: 0.76 }
];

function norm(value) {
  return normalizeForNcie(value ?? '');
}

function tokens(value) {
  return norm(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function similarity(left, right) {
  const a = norm(left);
  const b = norm(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

function tokenScore(message, item) {
  const messageTokens = tokens(message);
  const itemText = norm(`${item?.nombre ?? ''} ${item?.categoria ?? ''}`);
  if (messageTokens.length === 0 || !itemText) return 0;
  const hits = messageTokens.filter((token) => itemText.includes(token)).length;
  return hits / messageTokens.length;
}

function findServiceByAlias(message, services) {
  const text = norm(message);
  for (const alias of SERVICE_ALIASES) {
    if (!alias.pattern.test(text)) continue;
    const target = norm(alias.name);
    const service = services.find((item) => norm(item.nombre) === target)
      ?? services.find((item) => norm(item.nombre).includes(target) || target.includes(norm(item.nombre)));
    if (service) return { service, score: alias.score, alias: alias.name };
  }
  return null;
}

function findCategoryByAlias(message, services, categories = []) {
  const text = norm(message);
  const availableCategories = new Set([
    ...categories.map((category) => norm(category?.nombre ?? category?.name ?? category)).filter(Boolean),
    ...services.map((service) => norm(service?.categoria)).filter(Boolean)
  ]);
  for (const alias of CATEGORY_ALIASES) {
    if (!alias.pattern.test(text)) continue;
    const target = norm(alias.category);
    const category = [...availableCategories].find((candidate) => candidate.includes(target) || target.includes(candidate)) ?? alias.category;
    return { category, score: alias.score, alias: alias.category };
  }
  return null;
}

function bestServiceCandidate(message, services) {
  const candidates = services
    .map((service) => {
      const score = Math.max(
        similarity(message, service?.nombre),
        tokenScore(message, service)
      );
      return { service, score };
    })
    .filter((candidate) => candidate.score > 0.35)
    .sort((left, right) => right.score - left.score);
  return candidates[0] ?? null;
}

function bestCategoryCandidate(message, services, categories = []) {
  const categoryNames = [
    ...new Set([
      ...categories.map((category) => category?.nombre ?? category?.name ?? category).filter(Boolean),
      ...services.map((service) => service?.categoria).filter(Boolean)
    ])
  ];
  const candidates = categoryNames
    .map((category) => ({ category, score: similarity(message, category) }))
    .filter((candidate) => candidate.score > 0.35)
    .sort((left, right) => right.score - left.score);
  return candidates[0] ?? null;
}

export function directCatalogMatcher({
  message,
  services = [],
  products = [],
  categories = [],
  empresaId = null,
  conversationId = null
} = {}) {
  const text = norm(message);
  if (!text) return { type: 'none', score: 0, service: null, product: null, category: null, candidates: [] };

  const aliasService = findServiceByAlias(text, services);
  if (aliasService) {
    logLegacyDecisionDetected({
      module: 'direct-catalog-matcher',
      responsibility: 'service_selection',
      decision: aliasService.service?.nombre ?? aliasService.alias,
      empresaId,
      conversationId,
      reason: 'alias_service_match'
    });
    return {
      type: 'service',
      score: aliasService.score,
      service: aliasService.service,
      product: null,
      category: null,
      candidates: [aliasService]
    };
  }

  const aliasCategory = findCategoryByAlias(text, services, categories);
  if (aliasCategory) {
    logLegacyDecisionDetected({
      module: 'direct-catalog-matcher',
      responsibility: 'category_selection',
      decision: aliasCategory.category,
      empresaId,
      conversationId,
      reason: 'alias_category_match'
    });
    return {
      type: 'category',
      score: aliasCategory.score,
      service: null,
      product: null,
      category: aliasCategory.category,
      candidates: [aliasCategory]
    };
  }

  const serviceCandidate = bestServiceCandidate(text, services);
  if (serviceCandidate?.score >= 0.78) {
    logLegacyDecisionDetected({
      module: 'direct-catalog-matcher',
      responsibility: 'service_selection',
      decision: serviceCandidate.service?.nombre ?? null,
      empresaId,
      conversationId,
      reason: 'best_service_candidate'
    });
    return {
      type: 'service',
      score: serviceCandidate.score,
      service: serviceCandidate.service,
      product: null,
      category: null,
      candidates: [serviceCandidate]
    };
  }

  const categoryCandidate = bestCategoryCandidate(text, services, categories);
  if (categoryCandidate?.score >= 0.70) {
    logLegacyDecisionDetected({
      module: 'direct-catalog-matcher',
      responsibility: 'category_selection',
      decision: categoryCandidate.category,
      empresaId,
      conversationId,
      reason: 'best_category_candidate'
    });
    return {
      type: 'category',
      score: categoryCandidate.score,
      service: null,
      product: null,
      category: categoryCandidate.category,
      candidates: [categoryCandidate]
    };
  }

  return {
    type: 'none',
    score: Math.max(serviceCandidate?.score ?? 0, categoryCandidate?.score ?? 0),
    service: null,
    product: null,
    category: null,
    candidates: [serviceCandidate, categoryCandidate].filter(Boolean)
  };
}
