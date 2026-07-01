import { mcpClient as defaultMcpClient } from '../mcp/mcpClient.js';
import { query as dbQuery } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { normalizeForNcie } from './message-normalizer.js';
import { NCIE_TYPES } from './conversation-engine.types.js';
import { semanticHaystack, semanticTermsForText } from './semantic-lexicon.js';

const QUERY_EXPANSIONS = [
  {
    when: /\b(refrigerador|nevera|congelador|no enfria|linea blanca)\b/,
    terms: ['refrigerador', 'refri', 'refrigeracion', 'linea blanca', 'reparacion', 'tecnico', 'diagnostico', 'no enfria', 'falla de enfriamiento']
  },
  {
    when: /\b(fuga|lavabo|tuberia|gotea|drenaje)\b/,
    terms: ['plomeria', 'fuga', 'lavabo', 'tuberia', 'reparacion', 'bano', 'instalacion hidraulica']
  },
  {
    when: /\b(muela|diente|dental|dentista|dolor)\b/,
    terms: ['consulta dental', 'dentista', 'dolor muela']
  },
  {
    when: /\b(impuestos|declarar|declaracion|sat|contador|facturas)\b/,
    terms: ['contabilidad', 'impuestos', 'declaracion', 'asesoria fiscal', 'contador']
  },
  {
    when: /\b(compu|computadora|laptop|pc|lenta|virus)\b/,
    terms: ['mantenimiento computadoras', 'reparacion computadoras', 'soporte tecnico']
  },
  {
    when: /\b(camaras|cctv|videovigilancia|seguridad)\b/,
    terms: ['instalacion camaras', 'cctv', 'seguridad']
  },
  {
    when: /\b(pagina web|paginas web|sitio web|web|landing|ecommerce|tienda en linea|tienda online|desarrollo web|diseno web|marketing digital)\b/,
    terms: ['pagina web', 'sitio web', 'desarrollo web', 'diseno web', 'landing page', 'ecommerce', 'tienda en linea', 'marketing digital']
  }
];

function unique(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function itemTokens(item) {
  return unique(semanticHaystack(item).split(/\s+/).filter((token) => token.length > 2));
}

function tokenSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length > 3 && left.endsWith('s') && left.slice(0, -1) === right) return 0.95;
  if (right.length > 3 && right.endsWith('s') && right.slice(0, -1) === left) return 0.95;
  if (left.length >= 5 && right.length >= 5 && left.slice(0, 5) === right.slice(0, 5)) return 0.9;

  const leftPairs = new Set();
  const rightPairs = new Set();

  for (let index = 0; index < left.length - 1; index += 1) leftPairs.add(left.slice(index, index + 2));
  for (let index = 0; index < right.length - 1; index += 1) rightPairs.add(right.slice(index, index + 2));

  const intersection = [...leftPairs].filter((pair) => rightPairs.has(pair)).length;
  const union = new Set([...leftPairs, ...rightPairs]).size;
  return union ? intersection / union : 0;
}

function bestTokenSimilarity(token, candidates) {
  return Math.max(0, ...candidates.map((candidate) => tokenSimilarity(token, candidate)));
}

function scoreItem(item, queries, semantic) {
  const haystack = semanticHaystack(item);
  const candidates = itemTokens(item);
  const name = normalizeForNcie(item?.nombre);
  const category = normalizeForNcie(item?.categoria);
  const description = normalizeForNcie(item?.descripcion);
  const queryTokens = unique([
    ...queries.flatMap((query) => normalizeForNcie(query).split(/\s+/)),
    ...(semantic?.terms ?? [])
  ]).filter((token) => token.length > 2);
  const razones = [];
  let score = 0;

  for (const token of queryTokens) {
    if (name.includes(token)) {
      score += 5;
      razones.push(`coincide con nombre:${token}`);
    } else if (category.includes(token)) {
      score += 4;
      razones.push(`coincide con categoria:${token}`);
    } else if (description.includes(token)) {
      score += 2;
      razones.push(`coincide con descripcion:${token}`);
    } else if (haystack.includes(token)) {
      score += 1;
      razones.push(`coincide con sinonimo:${token}`);
    } else {
      const similarity = bestTokenSimilarity(token, candidates);
      if (similarity >= 0.86) {
        score += 3;
        razones.push(`coincide por similitud:${token}`);
      } else if (similarity >= 0.72) {
        score += 1;
        razones.push(`coincidencia cercana:${token}`);
      }
    }
  }

  for (const vertical of semantic?.matchedVerticals ?? []) {
    if (haystack.includes(normalizeForNcie(vertical))) {
      score += 6;
      razones.push(`coincide con sintoma:${vertical}`);
    }
  }

  for (const focus of semantic?.focusTerms ?? []) {
    const normalizedFocus = normalizeForNcie(focus);
    if (normalizedFocus && haystack.includes(normalizedFocus)) {
      score += 18;
      razones.push(`coincide con dominio:${normalizedFocus}`);
    }
  }

  if (queries.some((query) => name.includes(normalizeForNcie(query)))) {
    score += 8;
    razones.push('coincide con nombre exacto');
  }

  return {
    score,
    razones: unique(razones).slice(0, 8)
  };
}

function rankItems(items, queries, semantic, tipo) {
  return [...(items ?? [])]
    .map((item, index) => {
      const scored = scoreItem(item, queries, semantic);
      return {
        item: {
          ...item,
          tipo,
          score: scored.score,
          razones: scored.razones
        },
        index,
        score: scored.score
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.item);
}

function queriesFromNlu({ nlu, normalizedMessage }) {
  const base = [
    nlu?.entities?.service,
    nlu?.entities?.product,
    nlu?.entities?.problem,
    nlu?.entities?.symptom,
    normalizedMessage?.normalized
  ];
  const text = normalizeForNcie(base.join(' '));
  const expanded = QUERY_EXPANSIONS
    .filter((entry) => entry.when.test(text))
    .flatMap((entry) => entry.terms);
  const semantic = semanticTermsForText(text);

  return unique([...base, ...expanded, ...semantic.terms]);
}

async function safeCallTool(mcpClient, toolName, args) {
  try {
    return await mcpClient.callTool(toolName, args);
  } catch {
    return null;
  }
}

async function loadFullServiceCatalog({ empresaId, mcpClient }) {
  if (typeof mcpClient.loadFullServiceCatalog === 'function') {
    return mcpClient.loadFullServiceCatalog({ empresaId });
  }

  if (mcpClient !== defaultMcpClient) return null;

  try {
    const [serviceRows] = await dbQuery(
      `SELECT
         s.id,
         s.nombre,
         s.descripcion,
         s.precio,
         s.tipo_precio,
         s.unidad_medida,
         s.duracion_minutos,
         s.requiere_medidas,
         s.requiere_cantidad,
         s.incluye,
         s.no_incluye,
         s.notas_cotizacion,
         s.precio_minimo,
         c.nombre AS categoria
       FROM servicios s
       LEFT JOIN categorias c ON c.empresa_id = s.empresa_id AND c.id = s.categoria_id
       WHERE s.empresa_id = ? AND s.estado = 'ACTIVO'
       ORDER BY COALESCE(c.nombre, 'Servicios') ASC, s.nombre ASC`,
      [empresaId]
    );
    const [categoryRows] = await dbQuery(
      `SELECT id, nombre, descripcion, tipo
       FROM categorias
       WHERE empresa_id = ? AND estado = 'ACTIVA' AND tipo = 'SERVICIO'
       ORDER BY nombre ASC`,
      [empresaId]
    );

    return {
      services: serviceRows,
      categories: categoryRows
    };
  } catch (error) {
    logger.error('ncie_full_catalog_load_failed', { empresaId, error });
    return null;
  }
}

export async function loadServiceById({ empresaId, serviceId, mcpClient = defaultMcpClient } = {}) {
  if (!serviceId) return null;

  const catalog = await loadFullServiceCatalog({ empresaId, mcpClient });
  const catalogMatch = (catalog?.services ?? []).find((service) => String(service.id) === String(serviceId));
  if (catalogMatch) return catalogMatch;

  if (mcpClient !== defaultMcpClient) return null;

  try {
    const [rows] = await dbQuery(
      `SELECT
         s.id,
         s.nombre,
         s.descripcion,
         s.precio,
         s.tipo_precio,
         s.unidad_medida,
         s.duracion_minutos,
         s.requiere_medidas,
         s.requiere_cantidad,
         s.incluye,
         s.no_incluye,
         s.notas_cotizacion,
         s.precio_minimo,
         c.nombre AS categoria
       FROM servicios s
       LEFT JOIN categorias c ON c.empresa_id = s.empresa_id AND c.id = s.categoria_id
       WHERE s.empresa_id = ? AND s.id = ? AND s.estado = 'ACTIVO'
       LIMIT 1`,
      [empresaId, serviceId]
    );
    return rows?.[0] ?? null;
  } catch (error) {
    logger.error('ncie_service_hydration_failed', { empresaId, serviceId, error });
    return null;
  }
}

export async function retrieveConversationData({
  empresaId,
  nlu,
  normalizedMessage,
  state,
  commercialReasoning = null,
  mcpClient = defaultMcpClient
}) {
  const queries = queriesFromNlu({ nlu, normalizedMessage });
  const semantic = semanticTermsForText([
    normalizedMessage?.normalized,
    nlu?.entities?.service,
    nlu?.entities?.product,
    nlu?.entities?.problem,
    nlu?.entities?.symptom
  ].join(' '));
  semantic.focusTerms = [nlu?.entities?.problem, nlu?.entities?.service, nlu?.entities?.product].filter(Boolean);
  logger.info('ncie_semantic_terms_generated', {
    empresaId,
    terms: semantic.terms.slice(0, 20),
    matchedVerticals: semantic.matchedVerticals
  });
  const shouldSearchServices = nlu.type === NCIE_TYPES.SERVICE || nlu.type === NCIE_TYPES.UNKNOWN || nlu.type === NCIE_TYPES.SCHEDULE;
  const shouldSearchProducts = nlu.type === NCIE_TYPES.PRODUCT || nlu.type === NCIE_TYPES.UNKNOWN;
  const isServiceCatalog = nlu.intent === 'LISTAR_SERVICIOS';
  const isProductCatalog = nlu.intent === 'LISTAR_PRODUCTOS';
  const isFullCatalog = nlu.intent === 'LISTAR_CATALOGO';
  const isBusinessSummary = commercialReasoning?.retrieval_strategy === 'business_summary';
  const isMemoryOnly = commercialReasoning?.retrieval_strategy === 'memory';
  const isNoRetrieval = commercialReasoning?.retrieval_strategy === 'none';
  const services = [];
  const products = [];
  let company = null;
  let categories = [];

  company = (await safeCallTool(mcpClient, 'obtener_configuracion_empresa', { empresa_id: empresaId }))?.empresa ?? null;

  const effectiveSearchServices = isFullCatalog ||
    isServiceCatalog ||
    (isBusinessSummary && !isProductCatalog) ||
    shouldSearchServices ||
    commercialReasoning?.conversation_goal === 'find_solution';
  const effectiveSearchProducts = isFullCatalog || isProductCatalog || (!isBusinessSummary && shouldSearchProducts);

  if (!isNoRetrieval && !isMemoryOnly && isBusinessSummary && !isProductCatalog) {
    const fullCatalog = await loadFullServiceCatalog({ empresaId, mcpClient });
    if (fullCatalog) {
      services.push(...(fullCatalog.services ?? []));
      categories = fullCatalog.categories ?? [];
    }
  }

  if (!isNoRetrieval && !isMemoryOnly && effectiveSearchServices && services.length === 0) {
    const serviceQueries = isServiceCatalog || isBusinessSummary ? [''] : queries.slice(0, 5);
    for (const query of serviceQueries) {
      const result = await safeCallTool(mcpClient, 'buscar_servicios', {
        empresa_id: empresaId,
        texto: query
      });
      services.push(...(result?.servicios ?? []));
    }
  }

  if (!isNoRetrieval && !isMemoryOnly && effectiveSearchProducts) {
    const productQueries = isProductCatalog || isFullCatalog ? [''] : queries.slice(0, 4);
    for (const query of productQueries) {
      const result = await safeCallTool(mcpClient, 'buscar_productos', {
        empresa_id: empresaId,
        texto: query,
        presupuesto: nlu?.entities?.budget ?? undefined
      });
      products.push(...(result?.productos ?? []));
    }
  }

  if (!isNoRetrieval && !isMemoryOnly && !isBusinessSummary && effectiveSearchServices && services.length === 0 && commercialReasoning?.retrieval_strategy === 'domain_search') {
    const result = await safeCallTool(mcpClient, 'buscar_servicios', {
      empresa_id: empresaId,
      texto: ''
    });
    services.push(...(result?.servicios ?? []));
  }

  if (!isNoRetrieval && !isMemoryOnly && effectiveSearchServices && services.length === 0) {
    const fullCatalog = await loadFullServiceCatalog({ empresaId, mcpClient });
    if (fullCatalog?.services?.length) {
      services.push(...fullCatalog.services);
      categories = fullCatalog.categories?.length ? fullCatalog.categories : categories;
      logger.info('ncie_retrieval_full_catalog_fallback', {
        empresaId,
        reason: 'service_search_returned_zero',
        services: services.length,
        categories: categories.length
      });
    }
  }

  if (!isNoRetrieval && !isMemoryOnly && !isBusinessSummary && effectiveSearchProducts && products.length === 0 && commercialReasoning?.retrieval_strategy === 'domain_search') {
    const result = await safeCallTool(mcpClient, 'buscar_productos', {
      empresa_id: empresaId,
      texto: '',
      presupuesto: nlu?.entities?.budget ?? undefined
    });
    products.push(...(result?.productos ?? []));
  }

  if ((isBusinessSummary && categories.length === 0) || nlu.type === NCIE_TYPES.UNKNOWN || (!services.length && !products.length)) {
    categories = (await safeCallTool(mcpClient, 'obtener_categorias', { empresa_id: empresaId }))?.categorias ?? [];
  }

  const dedupeById = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = Number(item?.id);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  let rankedServices = rankItems(dedupeById(services), queries, semantic, 'servicio');
  let rankedProducts = rankItems(dedupeById(products), queries, semantic, 'producto');
  if (
    !isBusinessSummary &&
    !isNoRetrieval &&
    !isMemoryOnly &&
    nlu.type === NCIE_TYPES.UNKNOWN &&
    Number(nlu.confidence ?? 0) < 0.5 &&
    Number(rankedServices[0]?.score ?? 0) === 0 &&
    Number(rankedProducts[0]?.score ?? 0) === 0
  ) {
    const fullCatalog = await loadFullServiceCatalog({ empresaId, mcpClient });
    if (fullCatalog?.services?.length) {
      services.splice(0, services.length, ...(fullCatalog.services ?? []));
      categories = fullCatalog.categories?.length ? fullCatalog.categories : categories;
      rankedServices = rankItems(dedupeById(services), queries, semantic, 'servicio');
      rankedProducts = rankItems(dedupeById(products), queries, semantic, 'producto');
    }
  }
  const result = {
    company,
    services: isBusinessSummary || isServiceCatalog || isFullCatalog || (nlu.type === NCIE_TYPES.UNKNOWN && Number(rankedServices[0]?.score ?? 0) === 0)
      ? rankedServices
      : rankedServices.slice(0, 5),
    products: isProductCatalog || isFullCatalog ? rankedProducts : rankedProducts.slice(0, 5),
    categories,
    queries,
    semantic,
    commercialReasoning,
    partialMatches: services.length > 0 || products.length > 0,
    contextMatches: {
      service: state?.lastService ?? null,
      product: state?.lastProduct ?? null
    },
    retrievalMode: 'semantic_textual_hybrid_v2'
  };

  logger.info('ncie_retrieval_scored', {
    empresaId,
    rawServices: services.length,
    rawProducts: products.length,
    categories: categories.length,
    topServiceScore: result.services[0]?.score ?? 0,
    topProductScore: result.products[0]?.score ?? 0,
    returnedServices: result.services.length,
    returnedProducts: result.products.length
  });

  return result;
}
