import { NCIE_ACTIONS, NCIE_TYPES, buildEmptyNluResult } from './conversation-engine.types.js';

const SERVICE_PROBLEM_PATTERNS = [
  {
    type: 'refrigeracion',
    service: 'reparacion de refrigeradores refrigeracion linea blanca',
    patterns: [/\brefrigerador\b/, /\bnevera\b/, /\bcongelador\b/, /\bno enfria\b/, /\benfria\b/, /\blinea blanca\b/],
    symptoms: [/\bno enfria\b/, /\bno congela\b/, /\btira agua\b/, /\bhace ruido\b/]
  },
  {
    type: 'plomeria',
    service: 'plomeria fuga lavabo tuberia reparacion',
    patterns: [/\bfuga\b/, /\blavabo\b/, /\btuberia\b/, /\bplomeria\b/, /\bgotea\b/, /\bdrenaje\b/],
    symptoms: [/\bfuga\b/, /\bgotea\b/, /\btapado\b/]
  },
  {
    type: 'dental',
    service: 'consulta dental dentista dolor muela odontologia',
    patterns: [/\bmuela\b/, /\bdiente\b/, /\bdental\b/, /\bdentista\b/, /\bodonto/, /\bencia\b/],
    symptoms: [/\bduele\b/, /\bdolor\b/, /\binflamad/]
  },
  {
    type: 'computadoras',
    service: 'mantenimiento reparacion computadoras laptop soporte tecnico',
    patterns: [/\bcompu\b/, /\bcomputadora\b/, /\blaptop\b/, /\bpc\b/, /\blenta\b/, /\bvirus\b/],
    symptoms: [/\blenta\b/, /\bno prende\b/, /\bse traba\b/, /\bvirus\b/]
  },
  {
    type: 'camaras',
    service: 'instalacion camaras seguridad cctv videovigilancia',
    patterns: [/\bcamaras\b/, /\bcctv\b/, /\bseguridad\b/, /\bvideovigilancia\b/],
    symptoms: [/\bponer\b/, /\binstalar\b/, /\binstalacion\b/]
  },
  {
    type: 'contabilidad',
    service: 'contabilidad impuestos declaracion asesoria fiscal contador',
    patterns: [/\bimpuestos\b/, /\bdeclarar\b/, /\bdeclaracion\b/, /\bsat\b/, /\bcontador\b/, /\bfacturas\b/],
    symptoms: [/\bdeclarar impuestos\b/, /\bdeclaracion\b/, /\bfacturas\b/]
  },
  {
    type: 'instalacion',
    service: 'revision instalacion mantenimiento diagnostico tecnico',
    patterns: [/\binstalacion\b/, /\binstalar\b/, /\brevisar\b/, /\brevision\b/, /\bvengan\b/, /\btecnico\b/],
    symptoms: [/\brevisar\b/, /\bvengan\b/, /\binstalacion\b/]
  }
];

const HUMAN_PATTERN = /\b(asesor|humano|persona|vendedor|ejecutivo|atiendeme|atiendame|atencion humana|atencion personalizada|quiero hablar con alguien|hablar con alguien|me comunicas con un asesor|comunicas con un asesor|cotizar con asesor)\b/;
const PURCHASE_PATTERN = /\b(me interesa|lo quiero|la quiero|quiero comprar|contratar|agendar|apartar|me lo llevo|ese|esa|la segunda opcion|el segundo|la segunda)\b/;
const PRICE_PATTERN = /\b(cuanto sale|cuanto cuesta|cuanto cobran|cuanto seria|precio|costo|vale|cotizar\w*|cotizame|cotizacion|presupuesto)\b/;
const PAYMENT_PATTERN = /\b(pago|pagos|tarjeta|transferencia|efectivo|deposito)\b/;
const SCHEDULE_PATTERN = /\b(horario|abren|cierran|cita|agenda|agendar|cuando|manana|mañana|hoy|fecha)\b/;
const LOW_COST_PATTERN = /\b(barato|economico|económico|bajo costo|mas barato|más barato)\b/;
const FRUSTRATION_PATTERN = /\b(no entendiste|no me entendiste|estas mal|eso no|incorrecto)\b/;
const URGENCY_PATTERN = /\b(urgente|hoy|ahorita|emergencia|rapido|rápido)\b/;
const AVAILABILITY_PATTERN = /\b(disponible|disponibilidad|stock|existencia|lo tienen)\b/;
const PRODUCT_SEARCH_PATTERN = /\b(comedor|comedores|silla|sillas|mesa|mesas|regalo|producto|productos|parecido|similar)\b/;
const SERVICE_CATALOG_PATTERN = /\b(que servicios|qué servicios|servicios tienen|servicios tienes|servicios manejas|que servicios tienen|qué servicios tienen|me das informes de sus servicios|informes de sus servicios|informes de tus servicios|informacion de sus servicios|informacion de tus servicios|todos los servicios|son los unicos servicios|son los únicos servicios|unicos servicios|únicos servicios|otros servicios|mas servicios|más servicios|lista de servicios|menu de servicios|menú de servicios|catalogo de servicios|catálogo de servicios|que mas servicios|opciones de servicios)\b|^(servicios|todos los servicios)$/;
const PRODUCT_CATALOG_PATTERN = /\b(manejas productos|manejan productos|tienes productos|tienen productos|venden productos|que productos|qué productos|productos manejas|productos manejan|todos los productos|catalogo de productos|catálogo de productos|lista de productos|menu de productos|menú de productos)\b|^(productos|todos los productos)$/;
const GENERAL_CATALOG_PATTERN = /\b(cual es tu catalogo|cuál es tu catálogo|tu catalogo|tu catálogo|ver catalogo|ver catálogo|mandame catalogo|mándame catálogo|lista completa|todo el catalogo|todo el catálogo|opciones|menu|menú)\b|^(catalogo|catálogo|opciones|menu|menú)$/;
const WEBSITE_SERVICE_PATTERN = /\b(pagina web|paginas web|sitio web|web|landing|landing page|ecommerce|tienda en linea|tienda online|desarrollo web|diseno web)\b/;
const PRINT_SERVICE_PATTERN = /\b(lona|lonas|vinil|viniles|banner|banners|tarjeta|tarjetas|senaletica|rotulacion|impresion gran formato)\b/;

function matchAny(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}

function detectServiceProblem(text) {
  return SERVICE_PROBLEM_PATTERNS.find((entry) => matchAny(entry.patterns, text)) ?? null;
}

function extractBudget(text) {
  const match = text.match(/\$?\s*(\d{2,7})(?:\s*(?:pesos|mxn))?/);
  return match ? Number(match[1]) : null;
}

function baseEntities() {
  return buildEmptyNluResult().entities;
}

export async function interpretNlu({ normalizedMessage, state = null } = {}) {
  const text = normalizedMessage?.normalized ?? String(normalizedMessage ?? '').trim();
  const result = buildEmptyNluResult();
  result.entities = baseEntities();
  result.entities.budget = extractBudget(text);
  result.entities.urgency = URGENCY_PATTERN.test(text) ? 'alta' : null;

  const serviceProblem = detectServiceProblem(text);
  const lastQuestion = String(
    state?.commercial?.lastBotQuestion
      ?? state?.commercial?.lastQuestion
      ?? state?.lastBotQuestion
      ?? ''
  ).toLowerCase();

  if (/^(si|s[ií]|claro|adelante|por favor)$/.test(text) && /\b(asesor|comunic|contactar|seguimiento)\b/.test(lastQuestion)) {
    return {
      ...result,
      intent: 'HABLAR_ASESOR',
      type: NCIE_TYPES.HUMAN,
      confidence: 0.95,
      recommended_action: NCIE_ACTIONS.ESCALATE_HUMAN,
      reasoning_summary: 'El cliente confirmo que quiere comunicarse con un asesor.'
    };
  }

  if (FRUSTRATION_PATTERN.test(text)) {
    return {
      ...result,
      intent: 'ACLARACION_CLIENTE',
      type: NCIE_TYPES.SUPPORT,
      confidence: 0.85,
      entities: {
        ...result.entities,
        problem: 'cliente confundido o frustrado',
        symptom: text
      },
      missing_data: ['necesidad'],
      recommended_action: NCIE_ACTIONS.ASK_CLARIFYING_QUESTION,
      reasoning_summary: 'El cliente expresa que la respuesta anterior no resolvio su necesidad.'
    };
  }

  if (HUMAN_PATTERN.test(text)) {
    return {
      ...result,
      intent: 'HABLAR_ASESOR',
      type: NCIE_TYPES.HUMAN,
      confidence: 0.95,
      recommended_action: NCIE_ACTIONS.ESCALATE_HUMAN,
      reasoning_summary: 'El cliente pidio atencion humana.'
    };
  }

  if (PRINT_SERVICE_PATTERN.test(text)) {
    return {
      ...result,
      intent: PRICE_PATTERN.test(text) ? 'CONSULTAR_PRECIO' : 'BUSCAR_SERVICIO',
      type: NCIE_TYPES.SERVICE,
      confidence: 0.84,
      entities: {
        ...result.entities,
        service: text
      },
      missing_data: PRICE_PATTERN.test(text) ? ['detalle_servicio'] : [],
      recommended_action: NCIE_ACTIONS.ANSWER_WITH_RESULTS,
      reasoning_summary: 'El cliente menciona un servicio concreto de impresion o rotulacion.'
    };
  }
  if (/^(si|sí|ese|esa|el primero|la primera|el segundo|la segunda|la segunda opcion|\d{1,2})$/.test(text) || PURCHASE_PATTERN.test(text)) {
    const contextType = state?.lastServiceId ? NCIE_TYPES.SERVICE : state?.lastProductId ? NCIE_TYPES.PRODUCT : NCIE_TYPES.PURCHASE;
    return {
      ...result,
      intent: 'INTENCION_COMPRA',
      type: contextType,
      confidence: 0.82,
      recommended_action: NCIE_ACTIONS.USE_CONTEXT,
      reasoning_summary: 'El cliente muestra interes por una opcion previa o quiere avanzar.'
    };
  }

  if (serviceProblem) {
    const symptomPattern = serviceProblem.symptoms.find((pattern) => pattern.test(text));
    return {
      ...result,
      intent: PRICE_PATTERN.test(text) ? 'CONSULTAR_PRECIO' : 'BUSCAR_SERVICIO',
      type: NCIE_TYPES.SERVICE,
      confidence: 0.86,
      entities: {
        ...result.entities,
        service: serviceProblem.service,
        problem: serviceProblem.type,
        symptom: symptomPattern ? symptomPattern.source.replace(/\\b/g, '') : text
      },
      missing_data: PRICE_PATTERN.test(text) ? ['detalle_servicio'] : [],
      recommended_action: NCIE_ACTIONS.ANSWER_WITH_RESULTS,
      reasoning_summary: `El mensaje describe un problema asociado a ${serviceProblem.type}.`
    };
  }

  if (SERVICE_CATALOG_PATTERN.test(text)) {
    return {
      ...result,
      intent: 'LISTAR_SERVICIOS',
      type: NCIE_TYPES.SERVICE,
      confidence: 0.82,
      entities: {
        ...result.entities,
        service: ''
      },
      recommended_action: NCIE_ACTIONS.ANSWER_WITH_RESULTS,
      reasoning_summary: 'El cliente pide conocer los servicios disponibles.'
    };
  }

  if (PRODUCT_CATALOG_PATTERN.test(text)) {
    return {
      ...result,
      intent: 'LISTAR_PRODUCTOS',
      type: NCIE_TYPES.PRODUCT,
      confidence: 0.82,
      entities: {
        ...result.entities,
        product: ''
      },
      recommended_action: NCIE_ACTIONS.ANSWER_WITH_RESULTS,
      reasoning_summary: 'El cliente pide conocer los productos disponibles.'
    };
  }

  if (GENERAL_CATALOG_PATTERN.test(text)) {
    return {
      ...result,
      intent: 'LISTAR_CATALOGO',
      type: NCIE_TYPES.UNKNOWN,
      confidence: 0.9,
      entities: {
        ...result.entities,
        service: '',
        product: ''
      },
      recommended_action: NCIE_ACTIONS.ANSWER_WITH_RESULTS,
      reasoning_summary: 'El cliente pidio ver el catalogo completo.'
    };
  }

  if (WEBSITE_SERVICE_PATTERN.test(text)) {
    return {
      ...result,
      intent: PRICE_PATTERN.test(text) ? 'CONSULTAR_PRECIO' : 'BUSCAR_SERVICIO',
      type: NCIE_TYPES.SERVICE,
      confidence: 0.84,
      entities: {
        ...result.entities,
        service: 'pagina web sitio web desarrollo web marketing digital landing page ecommerce',
        problem: 'pagina_web'
      },
      missing_data: PRICE_PATTERN.test(text) ? ['detalle_servicio'] : [],
      recommended_action: NCIE_ACTIONS.ANSWER_WITH_RESULTS,
      reasoning_summary: 'El cliente pregunta por pagina web o desarrollo web.'
    };
  }

  if (PRICE_PATTERN.test(text)) {
    const type = state?.lastServiceId ? NCIE_TYPES.SERVICE : state?.lastProductId ? NCIE_TYPES.PRODUCT : NCIE_TYPES.UNKNOWN;
    return {
      ...result,
      intent: 'CONSULTAR_PRECIO',
      type,
      confidence: type === NCIE_TYPES.UNKNOWN ? 0.45 : 0.8,
      missing_data: type === NCIE_TYPES.UNKNOWN ? ['producto_o_servicio'] : [],
      recommended_action: type === NCIE_TYPES.UNKNOWN ? NCIE_ACTIONS.ASK_CLARIFYING_QUESTION : NCIE_ACTIONS.USE_CONTEXT,
      reasoning_summary: 'El cliente pregunta por precio.'
    };
  }

  if (AVAILABILITY_PATTERN.test(text)) {
    const type = state?.lastProductId ? NCIE_TYPES.PRODUCT : state?.lastServiceId ? NCIE_TYPES.SERVICE : NCIE_TYPES.UNKNOWN;
    return {
      ...result,
      intent: type === NCIE_TYPES.PRODUCT ? 'CONSULTAR_STOCK' : 'CONSULTAR_DISPONIBILIDAD',
      type,
      confidence: type === NCIE_TYPES.UNKNOWN ? 0.48 : 0.78,
      missing_data: type === NCIE_TYPES.UNKNOWN ? ['producto_o_servicio'] : [],
      recommended_action: type === NCIE_TYPES.UNKNOWN ? NCIE_ACTIONS.ASK_CLARIFYING_QUESTION : NCIE_ACTIONS.USE_CONTEXT,
      reasoning_summary: 'El cliente pregunta por disponibilidad.'
    };
  }

  if (PAYMENT_PATTERN.test(text)) {
    return {
      ...result,
      intent: 'CONSULTAR_METODOS_PAGO',
      type: NCIE_TYPES.PAYMENT,
      confidence: 0.86,
      recommended_action: NCIE_ACTIONS.ANSWER_WITH_RESULTS,
      reasoning_summary: 'El cliente pregunta por formas de pago.'
    };
  }

  if (SCHEDULE_PATTERN.test(text)) {
    return {
      ...result,
      intent: 'AGENDAR_CITA',
      type: NCIE_TYPES.SCHEDULE,
      confidence: 0.78,
      missing_data: ['fecha'],
      recommended_action: NCIE_ACTIONS.ASK_CLARIFYING_QUESTION,
      reasoning_summary: 'El cliente habla de horario o agenda.'
    };
  }

  if (LOW_COST_PATTERN.test(text)) {
    return {
      ...result,
      intent: 'BUSCAR_PRODUCTO',
      type: NCIE_TYPES.PRODUCT,
      confidence: 0.58,
      entities: {
        ...result.entities,
        product: text,
        budget: result.entities.budget
      },
      missing_data: ['producto_o_categoria'],
      recommended_action: NCIE_ACTIONS.ASK_CLARIFYING_QUESTION,
      reasoning_summary: 'El cliente busca una opcion economica, pero falta saber el rubro.'
    };
  }

  if (PRODUCT_SEARCH_PATTERN.test(text)) {
    return {
      ...result,
      intent: 'BUSCAR_PRODUCTO',
      type: NCIE_TYPES.PRODUCT,
      confidence: 0.68,
      entities: {
        ...result.entities,
        product: text,
        budget: result.entities.budget
      },
      missing_data: LOW_COST_PATTERN.test(text) ? ['producto_o_categoria'] : [],
      recommended_action: NCIE_ACTIONS.ANSWER_WITH_RESULTS,
      reasoning_summary: 'El cliente describe una busqueda de producto.'
    };
  }

  return {
    ...result,
    intent: 'MENSAJE_GENERAL',
    type: NCIE_TYPES.UNKNOWN,
    confidence: 0.35,
    missing_data: ['necesidad'],
    recommended_action: NCIE_ACTIONS.ASK_CLARIFYING_QUESTION,
    reasoning_summary: 'No hay suficientes senales para clasificar con seguridad.'
  };
}
