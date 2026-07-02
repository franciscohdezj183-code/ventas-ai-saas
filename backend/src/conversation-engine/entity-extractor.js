import { normalizeForNcie } from './message-normalizer.js';
import { parseDimensions } from './planner/dimensions.parser.js';
import {
  ENTITY_NAMES,
  createEntity,
  createEntityExtractionResult
} from './conversation-contracts.js';
import {
  detectDesignPreference,
  detectInstallationPreference
} from './planner/missing-information.detector.js';

const SERVICE_SYNONYMS = [
  { canonical: 'Impresion de lona', terms: ['lona', 'lonas', 'manta', 'mantas', 'banner impreso', 'impresion de lona', 'lona impresa'] },
  { canonical: 'Promocionales con corte de vinil', terms: ['promocionales con corte de vinil', 'promocional con corte de vinil', 'promocionales corte vinil', 'promocionales e corte de vinil', 'corte de vinil promocionales', 'promocionales vinil', 'promcionalesd e corte de vinil'] },
  { canonical: 'Diseno web', terms: ['pagina web', 'paginas web', 'sitio web', 'web', 'landing', 'ecommerce', 'tienda en linea', 'diseno web'] },
  { canonical: 'Diseno de logotipo', terms: ['logo', 'logos', 'logotipo', 'marca', 'diseno logo', 'diseno de logo', 'diseno de logotipo', 'imagen corporativa'] },
  { canonical: 'Tarjetas digitales laminado mate 100 pzs', terms: ['tarjetas digitales', 'tarjeta digital', 'tarjetas digitales laminado mate', 'tarjetas laminado mate', 'tarjetas digitales 100 pzs', 'tarjetas digitales 100 piezas'] },
  { canonical: 'Vinil impreso', terms: ['vinil impreso', 'viniles impresos', 'impresion de vinil', 'impresion en vinil', 'vinil'] },
  { canonical: 'Vinil de rotulacion de color', terms: ['rotulacion', 'rotular', 'rotulacion vehicular', 'vinil de rotulacion'] },
  { canonical: 'Marketing digital', terms: ['marketing digital', 'marketing digitales', 'redes sociales', 'campanas digitales', 'anuncios digitales'] }
];

const CATEGORY_SYNONYMS = [
  { canonical: 'Textil', terms: ['textil', 'playera', 'playeras', 'camiseta', 'camisetas', 'ropa', 'uniformes'] },
  { canonical: 'Impresion', terms: ['impresion', 'impresiones', 'gran formato'] },
  { canonical: 'Promocionales', terms: ['promocional', 'promocionales', 'promos'] },
  { canonical: 'Senaletica', terms: ['senaletica', 'senalizacion', 'senales'] },
  { canonical: 'Banners', terms: ['banner', 'banners', 'arana', 'banner arana'] },
  { canonical: 'Diseno', terms: ['diseno', 'branding', 'identidad'] }
];

const NUMBER_WORDS = new Map([
  ['un', 1],
  ['una', 1],
  ['uno', 1],
  ['dos', 2],
  ['tres', 3],
  ['cuatro', 4],
  ['cinco', 5],
  ['seis', 6],
  ['siete', 7],
  ['ocho', 8],
  ['nueve', 9],
  ['diez', 10],
  ['once', 11],
  ['doce', 12],
  ['quince', 15],
  ['veinte', 20],
  ['treinta', 30],
  ['cuarenta', 40],
  ['cincuenta', 50],
  ['cien', 100]
]);

function textOf(message) {
  return normalizeForNcie(message?.normalized ?? message?.raw ?? message?.original ?? message ?? '');
}

function rawTextOf(message) {
  return String(message?.original ?? message?.raw ?? message?.normalized ?? message ?? '').trim();
}

function addEntity(entities, entity) {
  const previous = entities[entity.name];
  if (!previous || entity.confidence >= previous.confidence) {
    entities[entity.name] = entity;
  }
}

function includesTerm(text, term) {
  const normalizedTerm = normalizeForNcie(term);
  if (!normalizedTerm) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}(?=$|[^a-z0-9])`).test(text);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function companySynonymEntries(companySynonyms = {}) {
  const entries = [];
  for (const [canonical, terms] of Object.entries(companySynonyms.services ?? {})) {
    entries.push({ canonical, terms: Array.isArray(terms) ? terms : [terms] });
  }
  return entries;
}

function findSynonym(text, entries) {
  for (const entry of entries) {
    const term = entry.terms.find((candidate) => includesTerm(text, candidate));
    if (term) return { canonical: entry.canonical, term, configurable: Boolean(entry.configurable) };
  }
  return null;
}

function isExactCategoryTerm(text) {
  return CATEGORY_SYNONYMS.some((entry) => entry.terms.some((term) => normalizeForNcie(term) === text));
}

function normalizeCatalogItem(item, { includeCategory = true } = {}) {
  return normalizeForNcie(`${item?.nombre ?? ''} ${includeCategory ? item?.categoria ?? '' : ''} ${item?.descripcion ?? ''}`);
}

function catalogCandidates(text, catalogItems = [], options = {}) {
  return (catalogItems ?? [])
    .map((item) => {
      const haystack = normalizeCatalogItem(item, options);
      const tokens = text.split(/\s+/).filter((token) => token.length > 2);
      const hits = tokens.filter((token) => haystack.includes(token));
      const score = tokens.length ? hits.length / tokens.length : 0;
      return {
        item,
        score: Number(score.toFixed(4)),
        evidence: hits
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
}

function extractQuantity(text) {
  const unitMatch = text.match(/\b(\d{1,6})\s*(piezas|pieza|pzs|unidades|unidad|uds)\b/);
  if (unitMatch) return { value: Number(unitMatch[1]), evidence: unitMatch[0], confidence: 0.98 };

  for (const [word, value] of NUMBER_WORDS.entries()) {
    if (includesTerm(text, word) && /\b(piezas|pieza|pzs|unidades|unidad|uds)\b/.test(text)) {
      return { value, evidence: word, confidence: 0.92 };
    }
  }
  return null;
}

function extractBudget(text) {
  const explicit = text.match(/\$+\s*(\d{2,15}(?:[.,]\d{1,2})?)|\b(\d{2,15}(?:[.,]\d{1,2})?)\s*(pesos|mxn|eur|euro|euros|usd|dolar|dolares|dólar|dólares|dlls|dls)\b/);
  const numberText = explicit?.[1] ?? explicit?.[2] ?? null;
  if (!numberText) return null;
  const value = Number(numberText.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, evidence: explicit[0], confidence: 0.97 };
}

function extractCurrency(text) {
  if (/\b(eur|euro|euros)\b/.test(text)) return { value: 'EUR', evidence: 'euros', confidence: 0.95 };
  if (/\b(usd|dolar|dolares|dólar|dólares|dlls|dls)\b/.test(text)) return { value: 'USD', evidence: 'dolares', confidence: 0.95 };
  if (/\b(mxn|peso|pesos)\b/.test(text) || /\$/.test(text)) return { value: 'MXN', evidence: 'pesos', confidence: 0.9 };
  return null;
}

function extractAmbiguousNumber(text, entities) {
  if (entities[ENTITY_NAMES.QUANTITY] || entities[ENTITY_NAMES.BUDGET] || entities[ENTITY_NAMES.DIMENSIONS]) return null;
  const match = text.match(/^\s*(\d{1,9}(?:[.,]\d{1,2})?)\s*$/);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  return { value, evidence: match[0], confidence: 0.45 };
}

function extractPriority(text) {
  if (/\b(urgente|hoy|ahorita|emergencia|rapido|rapida)\b/.test(text)) {
    return { value: 'alta', evidence: 'urgencia', confidence: 0.9 };
  }
  return null;
}

function extractLocation(text) {
  const match = text.match(/\b(en|para|por)\s+([a-z0-9\s]{3,40})$/);
  if (!match) return null;
  const value = match[2].trim();
  if (/\b(interior|exterior|evento|pesos|mxn)\b/.test(value)) return null;
  return { value, evidence: match[0], confidence: 0.55 };
}

function extractObjective(text) {
  const objectiveTerms = [
    'atraer clientes',
    'atraer mas clientes',
    'vender mas',
    'promocionar mi negocio',
    'promocionar',
    'mejorar mi imagen',
    'mejorar presencia',
    'anunciar mi negocio',
    'necesito publicidad',
    'publicidad',
    'quiero un letrero',
    'quiero imprimir',
    'quiero automatizar',
    'ahorrar tiempo',
    'abrir un negocio',
    'cotizar',
    'tengo un negocio'
  ];
  const term = objectiveTerms.find((candidate) => text.includes(candidate));
  if (!term) return null;
  return { value: term, evidence: term, confidence: 0.88 };
}

function extractBusinessType(text) {
  const patterns = [
    { value: 'papeleria', pattern: /\b(papeleria|papelería)\b/ },
    { value: 'cafeteria', pattern: /\b(cafeteria|cafetería|cafe|café)\b/ },
    { value: 'estetica', pattern: /\b(estetica|estética|salon de belleza|salón de belleza)\b/ },
    { value: 'restaurante', pattern: /\b(restaurante|taqueria|taquería|fonda|comida)\b/ },
    { value: 'dentista', pattern: /\b(dentista|consultorio dental|clinica dental|clínica dental)\b/ },
    { value: 'abogado', pattern: /\b(abogado|despacho juridico|despacho jurídico)\b/ },
    { value: 'imprenta', pattern: /\b(imprenta)\b/ },
    { value: 'ferreteria', pattern: /\b(ferreteria|ferretería)\b/ },
    { value: 'tienda', pattern: /\b(tienda|abarrotes|local)\b/ },
    { value: 'boutique', pattern: /\b(boutique|ropa)\b/ },
    { value: 'veterinaria', pattern: /\b(veterinaria|veterinario)\b/ }
  ];
  const match = patterns.find((entry) => entry.pattern.test(text));
  if (!match) return null;
  return { value: match.value, evidence: text.match(match.pattern)?.[0] ?? match.value, confidence: 0.9 };
}

function neutralMessage(text) {
  if (/^(hola|buen dia|buenos dias|buena tarde|buenas tardes|buenas noches|buenas|que tal|hey)(\b|,|$)/.test(text)) return 'greeting';
  if (/\b(hola|buen dia|buenos dias|buena tarde|buenas tardes|buenas noches)\b/.test(text) && /\b(mi nombre es|soy|me llamo)\b/.test(text)) return 'greeting';
  if (/^(mi nombre es|me llamo)\s+[a-z0-9\s]{2,60}$/.test(text)) return 'greeting';
  if (/^soy\s+[a-z0-9]{2,20}(?:\s+[a-z0-9]{2,20})?$/.test(text) && !/\b(quiero|necesito|busco|tengo|vendo|clientes|presupuesto|pesos|negocio)\b/.test(text)) return 'greeting';
  if (/^(gracias|muchas gracias|ok gracias|perfecto gracias)$/.test(text)) return 'thanks';
  if (/^(ok|okay|va|sale|listo|perfecto|de acuerdo)$/.test(text)) return 'ack';
  return null;
}

function confirmationValue(text) {
  if (/^(si|sí|s|claro|correcto|afirmativo|adelante|por supuesto|desde luego|ok si|va si)(,?\s*(gracias|por favor))?$/.test(text)) return true;
  if (/^(por favor)$/.test(text)) return true;
  if (/^(claro|adelante),?\s*por favor$/.test(text)) return true;
  if (/^(no|nop|negativo|aun no|todavia no)(,?\s*gracias)?$/.test(text)) return false;
  return null;
}

function isCatalogRequest(text) {
  const normalized = normalizeForNcie(text);
  if (/\b(catalogo|menu|lista completa|todos los servicios|que servicios|servicios tienen|servicios manejan|opciones|puedes mostrarme tus servicios|muestrame tus servicios|me muestras tus servicios|servicios disponibles)\b/.test(normalized)) return true;
  if (/^(servicios|catalogo|menu|opciones|catalgo|cstalogo|catalago|servicios disponibles)$/.test(normalized)) return true;
  return false;
}

function extractService(text, services, companySynonyms = {}) {
  const configured = companySynonymEntries(companySynonyms).map((entry) => ({ ...entry, configurable: true }));
  const synonym = findSynonym(text, [...configured, ...SERVICE_SYNONYMS]);
  const candidates = catalogCandidates(text, services, { includeCategory: false });
  const vinilPrintIntent = /\b(impresion|imprimir)\s+(de|en)?\s*vinil\b/.test(text);
  const textilIntent = /\b(textil|playera|playeras|ropa|camiseta|camisetas|dtf)\b/.test(text);
  if (vinilPrintIntent && !textilIntent) {
    const vinilImp = (services ?? []).find((service) => normalizeForNcie(service?.nombre) === 'vinil impreso')
      ?? (services ?? []).find((service) => /\bvinil impreso\b/.test(normalizeForNcie(service?.nombre)));
    if (vinilImp) {
      return {
        entity: {
          value: vinilImp.nombre,
          evidence: text.match(/\b(impresion|imprimir)\s+(de|en)?\s*vinil\b/)?.[0] ?? 'impresion de vinil',
          confidence: 0.96,
          metadata: { preferredVinilPrint: true }
        },
        candidates
      };
    }
  }
  if (isExactCategoryTerm(text) && !synonym) {
    return { entity: null, candidates };
  }
  const top = candidates[0];
  if (top?.score >= 0.7) {
    return {
      entity: {
        value: top.item?.nombre ?? synonym?.canonical,
        evidence: top.evidence.join(' '),
        confidence: Math.max(0.82, Math.min(0.98, top.score))
      },
      candidates
    };
  }
  if (synonym) {
    const catalogMatch = (services ?? []).find((service) => normalizeForNcie(service?.nombre) === normalizeForNcie(synonym.canonical));
    return {
      entity: {
        value: catalogMatch?.nombre ?? synonym.canonical,
        evidence: synonym.term,
        confidence: 0.9,
        metadata: {
          synonymMatched: true,
          synonymTerm: synonym.term,
          configurable: synonym.configurable
        }
      },
      candidates
    };
  }
  return { entity: null, candidates };
}

function extractCategory(text, categories, services) {
  const synonym = findSynonym(text, CATEGORY_SYNONYMS);
  const categoryItems = [
    ...(categories ?? []),
    ...[...new Set((services ?? []).map((service) => service?.categoria).filter(Boolean))].map((nombre) => ({ nombre }))
  ];
  const candidates = catalogCandidates(text, categoryItems);
  const top = candidates[0];
  if (top?.score >= 0.75) {
    return {
      entity: {
        value: top.item?.nombre ?? top.item?.name ?? synonym?.canonical,
        evidence: top.evidence.join(' '),
        confidence: Math.min(0.96, top.score)
      },
      candidates
    };
  }
  if (synonym) {
    return {
      entity: {
        value: synonym.canonical,
        evidence: synonym.term,
        confidence: 0.88
      },
      candidates
    };
  }
  return { entity: null, candidates };
}

export function extractEntities({
  message,
  catalog = {},
  source = 'entity-extractor',
  companyConfig = null
} = {}) {
  const text = textOf(message);
  const rawText = rawTextOf(message);
  const entities = {};
  const candidates = {};

  const dimensions = parseDimensions(rawText);
  if (dimensions && dimensions.area) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.DIMENSIONS,
      value: dimensions,
      confidence: 0.96,
      source,
      evidence: dimensions.text ?? rawText
    }));
  }

  const quantity = extractQuantity(text);
  if (quantity) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.QUANTITY,
      value: quantity.value,
      confidence: quantity.confidence,
      source,
      evidence: quantity.evidence
    }));
  }

  const budget = extractBudget(text);
  if (budget) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.BUDGET,
      value: budget.value,
      confidence: budget.confidence,
      source,
      evidence: budget.evidence
    }));
  }

  const currency = extractCurrency(text);
  if (currency) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.CURRENCY,
      value: currency.value,
      confidence: currency.confidence,
      source,
      evidence: currency.evidence
    }));
  }

  const companySynonyms = companyConfig?.synonyms ?? companyConfig?.sinonimos ?? {};
  const service = extractService(text, catalog.services ?? [], companySynonyms);
  candidates.services = service.candidates;
  if (service.entity) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.SERVICE,
      value: service.entity.value,
      confidence: service.entity.confidence,
      source,
      evidence: service.entity.evidence,
      metadata: service.entity.metadata ?? {}
    }));
  }

  const category = extractCategory(text, catalog.categories ?? [], catalog.services ?? []);
  candidates.categories = category.candidates;
  if (category.entity && !entities[ENTITY_NAMES.SERVICE]) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.CATEGORY,
      value: category.entity.value,
      confidence: category.entity.confidence,
      source,
      evidence: category.entity.evidence
    }));
  }

  const design = detectDesignPreference(text);
  if (design !== null) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.DESIGN,
      value: design,
      confidence: 0.92,
      source,
      evidence: text
    }));
  }

  const installation = detectInstallationPreference(text);
  if (installation !== null || /^instalacion$/.test(text)) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.INSTALLATION,
      value: installation ?? true,
      confidence: installation === null ? 0.72 : 0.92,
      source,
      evidence: text
    }));
  }

  const objective = extractObjective(text);
  if (objective) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.OBJECTIVE,
      value: objective.value,
      confidence: objective.confidence,
      source,
      evidence: objective.evidence
    }));
  }

  const businessType = extractBusinessType(text);
  if (businessType) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.BUSINESS_TYPE,
      value: businessType.value,
      confidence: businessType.confidence,
      source,
      evidence: businessType.evidence
    }));
  }

  const location = extractLocation(text);
  if (location) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.LOCATION,
      value: location.value,
      confidence: location.confidence,
      source,
      evidence: location.evidence
    }));
  }

  const priority = extractPriority(text);
  if (priority) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.PRIORITY,
      value: priority.value,
      confidence: priority.confidence,
      source,
      evidence: priority.evidence
    }));
  }

  if (/\b(asesor|ejecutivo|vendedor|humano|persona|hablar con alguien|atencion humana)\b/.test(text)) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.ADVISOR_REQUEST,
      value: true,
      confidence: 0.96,
      source,
      evidence: text
    }));
  }

  if (/^(seguimos|continuar|seguimos con eso|si seguimos|sí seguimos|continuemos|sigamos)$/.test(text)) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.CONTINUE_REQUEST,
      value: true,
      confidence: 0.94,
      source,
      evidence: text
    }));
  }

  if (isCatalogRequest(text)) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.CATALOG_REQUEST,
      value: true,
      confidence: 0.94,
      source,
      evidence: text
    }));
  }

  if (/\b(presupuesto|cuanto cuesta|cuanto sale|precio|costos?)\b/.test(text)) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.PRICE_REQUEST,
      value: true,
      confidence: 0.9,
      source,
      evidence: text
    }));
  }

  const confirmation = confirmationValue(text);
  if (confirmation !== null) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.CONFIRMATION,
      value: confirmation,
      confidence: 0.94,
      source,
      evidence: text
    }));
  }

  if (/\b(ya te lo dije|ya lo dije|ya te dije|te lo dije|eso ya te lo pase)\b/.test(text)) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.REPEATED_INFO_REFERENCE,
      value: true,
      confidence: 0.92,
      source,
      evidence: text
    }));
  }

  if (/\b(que me recomiendas|que recomiendas|recomiendame|me recomiendas|orientame|no se que necesito|no tengo idea|no se cual elegir|no se que me conviene|necesito publicidad|tengo un negocio|que mas necesito|que me falta|que sigue|que mas recomiendas)\b/.test(text) || objective || (businessType && !service.entity)) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.RECOMMENDATION_REQUEST,
      value: true,
      confidence: 0.93,
      source,
      evidence: text
    }));
  }

  const neutral = neutralMessage(text);
  if (neutral) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.NEUTRAL_MESSAGE,
      value: neutral,
      confidence: 0.95,
      source,
      evidence: text
    }));
  }

  const ambiguousNumber = extractAmbiguousNumber(text, entities);
  if (ambiguousNumber) {
    addEntity(entities, createEntity({
      name: ENTITY_NAMES.AMBIGUOUS_NUMBER,
      value: ambiguousNumber.value,
      confidence: ambiguousNumber.confidence,
      source,
      evidence: ambiguousNumber.evidence
    }));
  }

  return createEntityExtractionResult({
    message,
    entities,
    candidates
  });
}
