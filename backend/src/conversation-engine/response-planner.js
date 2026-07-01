import { NCIE_TYPES } from './conversation-engine.types.js';
import { COMMERCIAL_ACTIONS, COMMERCIAL_GOALS } from './commercial-reasoner.js';

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function servicePrice(service) {
  const type = String(service?.tipo_precio ?? 'FIJO').toUpperCase();
  if (type === 'COTIZACION') return 'requiere algunos detalles para cotizarse bien';
  const price = money(service?.precio);
  if (!price) return 'precio por confirmar';
  if (type === 'DESDE') return `desde ${price}`;
  if (type === 'POR_M2') return `${price} por m2`;
  if (type === 'POR_HORA') return `${price} por hora`;
  if (type === 'POR_UNIDAD') return `${price} por unidad`;
  return price;
}

function productPrice(product) {
  const price = money(product?.precio);
  return price ?? 'precio por confirmar';
}

function unique(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function serviceFamilies(services) {
  const groups = new Map();

  for (const service of services ?? []) {
    const category = service?.categoria || 'Servicios';
    const current = groups.get(category) ?? [];
    current.push(service?.nombre);
    groups.set(category, current);
  }

  return [...groups.entries()].map(([category, names]) => ({
    category,
    examples: unique(names).slice(0, 4)
  }));
}

function serviceQuestion(service, commercialReasoning) {
  if (service?.requiere_medidas) return '?Me compartes las medidas aproximadas?';
  if (service?.requiere_cantidad) return '?Cuantas piezas necesitas?';
  if (commercialReasoning?.domain === 'pagina_web') {
    return '?Sera una pagina informativa, catalogo o para recibir pedidos/cotizaciones?';
  }
  if (commercialReasoning?.conversation_stage === 'cotizacion') {
    return '?Que resultado quieres lograr y con que presupuesto aproximado quieres empezar?';
  }
  return '?Que necesitas lograr con este proyecto?';
}

function hasStrongService(retrieval) {
  const top = retrieval?.services?.[0];
  const second = retrieval?.services?.[1];
  if (!top) return false;
  const topScore = Number(top.score ?? 0);
  const secondScore = Number(second?.score ?? 0);
  return topScore >= 8 || (topScore >= 3 && topScore >= secondScore + 3);
}

function hasStrongProduct(retrieval) {
  const top = retrieval?.products?.[0];
  if (!top) return false;
  return Number(top.score ?? 0) >= 8;
}

function extractDimensions(value) {
  const text = String(value ?? '').replace(',', '.');
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:x|por)\s*(\d+(?:\.\d+)?)\b/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    width,
    height,
    area: Number((width * height).toFixed(2)),
    text: `${match[1]}x${match[2]}`
  };
}

function canQuoteByArea(service) {
  return String(service?.tipo_precio ?? '').toUpperCase() === 'POR_M2' || service?.unidad_medida === 'm2';
}

function selectedServiceFromPlanner(plannerDecision) {
  return plannerDecision?.selectedServiceItem ?? plannerDecision?.selectedService ?? null;
}

function dimensionsFromPlanner(plannerDecision) {
  const dimensions = plannerDecision?.detectedDimensions ?? plannerDecision?.activeFlow?.entities?.dimensions ?? null;
  if (!dimensions) return null;
  return {
    width: dimensions.ancho ?? dimensions.width ?? null,
    height: dimensions.alto ?? dimensions.height ?? null,
    area: dimensions.area,
    text: dimensions.text
  };
}

function plannerQuoteContext(plannerDecision, selected) {
  const dimensions = dimensionsFromPlanner(plannerDecision);
  const unitPrice = Number(selected?.precio);
  const total = dimensions && Number.isFinite(unitPrice) ? unitPrice * dimensions.area : null;
  return {
    service_id: selected?.id ?? null,
    service_name: selected?.nombre ?? null,
    dimensions,
    unit_price: Number.isFinite(unitPrice) ? unitPrice : null,
    total
  };
}

function questionForPlannerMissing(plannerDecision, selected) {
  if ((plannerDecision?.missing ?? []).includes('medidas')) return '?Me compartes las medidas aproximadas?';
  if ((plannerDecision?.missing ?? []).includes('tipo_web')) {
    return '?Sera una pagina informativa, catalogo o para recibir pedidos/cotizaciones?';
  }
  if (/\bmarketing digital\b/i.test(String(selected?.nombre ?? ''))) {
    return '?Que quieres lograr primero: atraer clientes, vender mas o mejorar tu presencia en redes?';
  }
  if (selected?.requiere_cantidad) return '?Cuantas piezas necesitas?';
  return '?Que resultado quieres lograr y con que presupuesto aproximado quieres empezar?';
}

function isFullCatalogRequest(normalizedMessage) {
  const text = normalizedText(normalizedMessage);
  return /\b(todos los servicios|todo el catalogo|catalogo completo|lista completa|todos|completo)\b/.test(text);
}

function marketingGoalLabel(goal) {
  if (goal === 'mejorar_presencia_redes') return 'mejorar tu presencia en redes';
  if (goal === 'atraer_clientes') return 'atraer clientes';
  if (goal === 'vender_mas') return 'vender mas';
  return 'definir el objetivo';
}

function configuredGreeting(retrieval = null) {
  const profileGreeting = retrieval?.company?.response_profile?.saludo_personalizado;
  const welcomeMessage = retrieval?.company?.mensaje_bienvenida;
  const greeting = String(profileGreeting ?? welcomeMessage ?? '').trim();
  return greeting || null;
}

function planFromPlannerDecision({ plannerDecision, retrieval, commercialReasoning, normalizedMessage = null }) {
  if (!plannerDecision) return null;
  if (plannerDecision.responsePlanType === 'neutral_message') {
    const contextServiceName = plannerDecision.neutralContext?.selectedServiceName ?? null;
    if (plannerDecision.neutralMessageType === 'greeting') {
      return {
        type: 'neutral_greeting',
        summary: 'Saludo',
        greetingText: configuredGreeting(retrieval),
        question: '?Que necesitas revisar?'
      };
    }
    if (plannerDecision.neutralMessageType === 'thanks') {
      return {
        type: 'neutral_thanks',
        summary: 'Agradecimiento',
        question: contextServiceName ? `?Seguimos con ${contextServiceName} o revisamos algo distinto?` : '?Hay algo mas que quieras revisar?'
      };
    }
    if (plannerDecision.neutralMessageType === 'ping') {
      return {
        type: 'neutral_resume',
        summary: contextServiceName ?? 'Contexto disponible',
        contextServiceName,
        question: contextServiceName ? `?Seguimos con eso o revisamos algo distinto?` : '?Que necesitas resolver?'
      };
    }
    return {
      type: 'neutral_ack',
      summary: 'Mensaje neutral',
      question: contextServiceName ? `?Seguimos con ${contextServiceName} o revisamos otra cosa?` : '?Que necesitas resolver?'
    };
  }
  if (
    plannerDecision.responsePlanType === 'consultative_diagnosis'
  ) {
    return {
      type: 'consultative_diagnosis',
      summary: plannerDecision.goal ?? commercialReasoning?.customer_need ?? 'Diagnostico comercial',
      question: 'Para recomendarte algo util, dime primero: ?que tipo de negocio tienes y que buscas lograr: atraer clientes, vender mas, mejorar tu imagen o promocionar algo especifico?'
    };
  }
  if (
    plannerDecision.responsePlanType === 'defer_to_ncie' &&
    plannerDecision.goal === 'aumentar_ventas' &&
    (retrieval?.services?.length ?? 0) > 0
  ) {
    return {
      type: 'consultative_options',
      groups: consultativeGroups(retrieval.services),
      selectedType: NCIE_TYPES.SERVICE,
      summary: plannerDecision.goal,
      question: '?Buscas algo fisico para tu local o algo digital para captar clientes?'
    };
  }
  if (plannerDecision.responsePlanType === 'defer_to_ncie') return null;

  if (plannerDecision.responsePlanType === 'generic_price_question') {
    return {
      type: 'generic_price_question',
      summary: 'Consulta de precios',
      question: '?Que quieres cotizar: lona, tarjetas, pagina web, marketing digital u otro servicio?'
    };
  }

  if (plannerDecision.responsePlanType === 'business_summary') {
    return {
      type: 'business_summary',
      company: retrieval?.company,
      families: serviceFamilies(retrieval?.services ?? []),
      categories: retrieval?.categories ?? [],
      summary: 'Catalogo de servicios',
      fullCatalog: isFullCatalogRequest(normalizedMessage),
      question: '?Que objetivo quieres lograr o que opcion te interesa revisar?'
    };
  }

  const selected = selectedServiceFromPlanner(plannerDecision);
  if (!selected) {
    return {
      type: 'clarify_need',
      summary: plannerDecision.goal,
      question: '?Que necesitas lograr o que producto o servicio tienes en mente?'
    };
  }

  if (plannerDecision.responsePlanType === 'ask_measurements' || plannerDecision.responsePlanType === 'ask_web_type') {
    return {
      type: 'service_explanation',
      selectedType: NCIE_TYPES.SERVICE,
      selected,
      priceText: servicePrice(selected),
      summary: selected.nombre,
      question: questionForPlannerMissing(plannerDecision, selected)
    };
  }

  if (plannerDecision.detectedWebType) {
    const webTypeText = plannerDecision.detectedWebType === 'catalogo'
      ? 'catalogo'
      : plannerDecision.detectedWebType === 'informativa'
        ? 'pagina informativa'
        : 'pagina para recibir pedidos';
    return {
      type: 'quote_from_memory',
      selectedType: NCIE_TYPES.SERVICE,
      selected,
      summary: selected.nombre,
      question: `Lo tomamos como ${webTypeText}. ?Quieres que tambien permita pagos o solo levantar solicitudes?`
    };
  }

  if (plannerDecision.detectedDesignPreference !== null && plannerDecision.detectedDesignPreference !== undefined) {
    return {
      type: 'quote_design_followup',
      selectedType: NCIE_TYPES.SERVICE,
      selected,
      quoteContext: plannerQuoteContext(plannerDecision, selected),
      summary: selected.nombre,
      customerAnswer: plannerDecision.detectedDesignPreference ? 'requiere_apoyo_diseno' : 'ya_tiene_diseno',
      isShortAnswer: false,
      question: '?Quieres que avancemos tambien con instalacion o solo impresion?'
    };
  }

  if (plannerDecision.detectedInstallationPreference !== null && plannerDecision.detectedInstallationPreference !== undefined) {
    return {
      type: 'quote_requirements_followup',
      selectedType: NCIE_TYPES.SERVICE,
      selected,
      quoteContext: plannerQuoteContext(plannerDecision, selected),
      installation: plannerDecision.detectedInstallationPreference,
      summary: selected.nombre,
      question: '?Hay algun otro detalle que quieras agregar a la cotizacion?'
    };
  }

  if (plannerDecision.responsePlanType === 'marketing_goal_followup') {
    return {
      type: 'marketing_goal_followup',
      selectedType: NCIE_TYPES.SERVICE,
      selected,
      marketingGoal: plannerDecision.detectedMarketingGoal,
      summary: selected.nombre,
      question: '?Tu negocio vende por redes, pagina web, WhatsApp o ya tiene una comunidad activa?'
    };
  }

  const dimensions = dimensionsFromPlanner(plannerDecision);
  if (dimensions && canQuoteByArea(selected)) {
    const unitPrice = Number(selected.precio);
    const total = Number.isFinite(unitPrice) ? unitPrice * dimensions.area : null;
    return {
      type: 'quote_estimate',
      selectedType: NCIE_TYPES.SERVICE,
      selected,
      dimensions,
      unitPrice,
      total,
      priceText: total ? money(total) : null,
      summary: selected.nombre,
      question: '?Ya tienes el diseno o quieres que tambien te apoyemos con eso?'
    };
  }

  if (plannerDecision.responsePlanType === 'resume_flow') {
    return {
      type: 'quote_from_memory',
      selectedType: NCIE_TYPES.SERVICE,
      selected,
      summary: selected.nombre,
      question: questionForPlannerMissing(plannerDecision, selected)
    };
  }

  if (plannerDecision.responsePlanType === 'topic_switch_service' || plannerDecision.responsePlanType === 'service_explanation') {
    return {
      type: 'service_explanation',
      selectedType: NCIE_TYPES.SERVICE,
      selected,
      priceText: servicePrice(selected),
      summary: selected.nombre,
      question: questionForPlannerMissing(plannerDecision, selected)
    };
  }

  return {
    type: 'service_explanation',
    selectedType: NCIE_TYPES.SERVICE,
    selected,
    priceText: servicePrice(selected),
    summary: selected.nombre,
    question: serviceQuestion(selected, commercialReasoning)
  };
}

function stripAccents(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isShortAnswer(normalizedMessage) {
  const text = stripAccents(normalizedMessage?.normalized).toLowerCase();
  return /^(si|no|claro|ok|va|sale)$/.test(text);
}

function mentionsDesign(normalizedMessage, state) {
  const text = stripAccents(normalizedMessage?.normalized).toLowerCase();
  const question = stripAccents([
    state?.lastBotQuestion,
    state?.commercial?.lastBotQuestion,
    state?.commercial?.lastQuestion
  ].filter(Boolean).join(' ')).toLowerCase();
  if (/\b(pagina|web|sitio|landing|ecommerce|tienda|marketing|lona|lonas|vinil|tarjeta|catalogo)\b/.test(text)) {
    return false;
  }
  return text.includes('diseno') || (question.includes('diseno') && isShortAnswer(normalizedMessage));
}

function isBroadCommercialNeed({ nlu, retrieval }) {
  if (nlu?.entities?.service || nlu?.entities?.product || nlu?.entities?.problem) return false;
  if (hasStrongService(retrieval) || hasStrongProduct(retrieval)) return false;
  const positiveMatches = (retrieval?.services ?? []).filter((service) => Number(service.score ?? 0) > 0);
  return Number(nlu?.confidence ?? 0) < 0.7 && retrieval?.services?.length >= 2 && positiveMatches.length <= 2;
}

function hasDescriptiveServiceMatch(retrieval) {
  const reasons = (retrieval?.services?.[0]?.razones ?? []).join(' ');
  return /descripcion|dominio|sintoma|sinonimo/.test(reasons);
}

function hasAdvertisingIntent(retrieval) {
  return (retrieval?.semantic?.matchedVerticals ?? []).includes('publicidad');
}

function consultativeGroups(services) {
  const digital = [];
  const physical = [];

  for (const service of services ?? []) {
    const haystack = `${service?.nombre ?? ''} ${service?.categoria ?? ''} ${service?.descripcion ?? ''}`.toLowerCase();
    if (/\b(web|digital|marketing|redes|landing|ecommerce)\b/.test(haystack)) {
      digital.push(service);
    } else {
      physical.push(service);
    }
  }

  return {
    physical: physical.slice(0, 3),
    digital: digital.slice(0, 3)
  };
}

function normalizedText(normalizedMessage) {
  return stripAccents(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '').toLowerCase();
}

function textIncludesAny(text, phrases) {
  return phrases.some((phrase) => text.includes(phrase));
}

function currentBusinessContext(state) {
  return state?.collectedData?.businessContext
    ?? state?.commercial?.businessContext
    ?? null;
}

function extractBusinessContext(normalizedMessage) {
  const text = normalizedText(normalizedMessage);
  const markers = [
    'tengo una ',
    'tengo un ',
    'mi negocio es una ',
    'mi negocio es un ',
    'es una ',
    'es un '
  ];

  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index < 0) continue;
    const candidate = text.slice(index + marker.length).trim();
    const words = candidate.split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
    if (words) return words;
  }

  return null;
}

function asksForRecommendation(normalizedMessage) {
  const text = normalizedText(normalizedMessage);
  return /\b(que me recomiendas|que recomiendas|recomiendame|me recomiendas|alguna recomendacion)\b/.test(text);
}

function expressesUncertainty(normalizedMessage) {
  const text = normalizedText(normalizedMessage);
  return textIncludesAny(text, [
    'no se que necesito',
    'no se que me conviene',
    'no se que pedir',
    'no se por donde empezar',
    'no tengo claro',
    'estoy perdido',
    'orientame'
  ]);
}

function asksForEconomicOption(normalizedMessage) {
  const text = normalizedText(normalizedMessage);
  return textIncludesAny(text, [
    'algo economico',
    'opcion economica',
    'mas economico',
    'no tengo mucho presupuesto',
    'poco presupuesto',
    'presupuesto limitado'
  ]);
}

function asksAboutProducts(normalizedMessage) {
  const text = normalizedText(normalizedMessage);
  return /\b(manejan productos|manejas productos|tienen productos|que productos|productos tienen|venden productos)\b/.test(text);
}

function asksBusinessCatalog(normalizedMessage) {
  const text = normalizedText(normalizedMessage);
  return /\b(que manejan|que ofrecen|que hacen|a que se dedican|me puedes dar informacion|me puedes dar info|informacion general)\b/.test(text);
}

function isGoalOrientedCommercialNeed(normalizedMessage) {
  const text = normalizedText(normalizedMessage);
  const hasObjective = textIncludesAny(text, [
    'anunciar',
    'publicidad',
    'atraer clientes',
    'mas clientes',
    'vender mas',
    'promocionar',
    'promocion',
    'presencia',
    'imagen de mi negocio',
    'dar a conocer',
    'captar clientes',
    'abrir negocio',
    'negocio nuevo',
    'crecer'
  ]);
  const hasSpecificItem = textIncludesAny(text, [
    'lona',
    'banner',
    'vinil',
    'tarjeta',
    'pagina web',
    'web',
    'marketing digital',
    'logo',
    'logotipo',
    'senal',
    'senaletica',
    'playera',
    'dtf',
    'instalacion'
  ]);
  return hasObjective && !hasSpecificItem;
}

export function planResponse({ nlu, retrieval, decision, state, commercialReasoning, normalizedMessage = null, plannerDecision = null }) {
  const businessContext = currentBusinessContext(state);
  const capturedBusinessContext = extractBusinessContext(normalizedMessage);

  if (capturedBusinessContext) {
    return {
      type: 'clarify_need',
      summary: `Negocio: ${capturedBusinessContext}`,
      businessContext: capturedBusinessContext,
      discovery: 'business_context',
      question: '?Que quieres conseguir ahora: atraer mas clientes, mejorar tu imagen o vender mas?'
    };
  }

  if (asksBusinessCatalog(normalizedMessage) && ((retrieval?.services?.length ?? 0) > 0 || (retrieval?.categories?.length ?? 0) > 0)) {
    return {
      type: 'business_summary',
      company: retrieval.company,
      families: serviceFamilies(retrieval.services),
      categories: retrieval.categories ?? [],
      summary: 'Catalogo de servicios',
      question: '?Que objetivo quieres lograr o que opcion te interesa revisar?'
    };
  }

  if (isGoalOrientedCommercialNeed(normalizedMessage) && (retrieval?.services?.length ?? 0) > 0) {
    if (!businessContext) {
      return {
        type: 'clarify_need',
        summary: commercialReasoning?.customer_need ?? 'Necesidad comercial',
        discovery: 'goal_without_business',
        question: '?Tu negocio tiene local fisico, vendes por internet o trabajas de las dos formas?'
      };
    }

    return {
      type: 'consultative_options',
      groups: consultativeGroups(retrieval.services),
      selectedType: NCIE_TYPES.SERVICE,
      summary: `${commercialReasoning?.customer_need ?? 'Necesidad comercial'} para ${businessContext}`,
      businessContext,
      question: '?Buscas algo fisico para tu local o algo digital para captar clientes?'
    };
  }

  if (asksAboutProducts(normalizedMessage)) {
    return {
      type: 'personalized_products_summary',
      summary: 'Productos personalizados',
      question: '?Que te interesa revisar?'
    };
  }

  const earlyPlannerPlan = planFromPlannerDecision({ plannerDecision, retrieval, commercialReasoning, normalizedMessage });
  if (earlyPlannerPlan?.type === 'consultative_diagnosis') {
    const context = businessContext ?? capturedBusinessContext ?? null;
    return {
      ...earlyPlannerPlan,
      businessContext: context,
      discovery: context ? 'known_business' : 'unknown_business',
      question: context
        ? '?Buscas algo economico para empezar o una estrategia mas completa?'
        : earlyPlannerPlan.question
    };
  }

  if (asksForRecommendation(normalizedMessage) || expressesUncertainty(normalizedMessage)) {
    return {
      type: 'recommendation_goal_question',
      summary: 'Recomendacion consultiva',
      businessContext,
      discovery: businessContext ? 'known_business' : 'unknown_business',
      question: businessContext
        ? `?Para ${businessContext} buscas atraer clientes, vender mas o mejorar tu imagen?`
        : '?Que vendes o que servicio ofreces?'
    };
  }

  if (asksForEconomicOption(normalizedMessage)) {
    return {
      type: 'economic_category_question',
      summary: 'Opcion economica',
      businessContext,
      question: businessContext
        ? `?Para ${businessContext} lo necesitas para publicidad fisica, diseno o impresion?`
        : '?Lo necesitas para publicidad fisica, diseno o impresion?'
    };
  }

  const plannerPlan = planFromPlannerDecision({ plannerDecision, retrieval, commercialReasoning, normalizedMessage });
  if (plannerPlan) {
    if (plannerPlan.type === 'consultative_diagnosis') {
      const context = businessContext ?? capturedBusinessContext ?? null;
      return {
        ...plannerPlan,
        businessContext: context,
        discovery: context ? 'known_business' : 'unknown_business',
        question: context
          ? `?Buscas algo economico para empezar o una estrategia mas completa?`
          : plannerPlan.question
      };
    }
    return plannerPlan;
  }

  if (nlu.intent === 'ACLARACION_CLIENTE') {
    return {
      type: 'repair',
      summary: commercialReasoning.customer_need,
      question: '?Que necesitas resolver o que estabas buscando exactamente?'
    };
  }

  if (state?.lastService && state?.commercial?.lastQuoteContext && mentionsDesign(normalizedMessage, state)) {
    return {
      type: 'quote_design_followup',
      selectedType: NCIE_TYPES.SERVICE,
      selected: state.lastService,
      quoteContext: state.commercial.lastQuoteContext,
      summary: state.lastService.nombre,
      customerAnswer: normalizedMessage?.normalized ?? null,
      isShortAnswer: isShortAnswer(normalizedMessage),
      question: '?Quieres que lo dejemos contemplado con apoyo de diseno?'
    };
  }

  if (commercialReasoning.recommended_action === COMMERCIAL_ACTIONS.ESCALATE_HUMAN) {
    return {
      type: 'escalate',
      summary: commercialReasoning.customer_need,
      question: '?Que punto quieres que revise el asesor?'
    };
  }

  if (commercialReasoning.recommended_action === COMMERCIAL_ACTIONS.USE_MEMORY) {
    const selected = state?.lastService ?? state?.lastProduct ?? commercialReasoning.last_selected?.item ?? null;
    const dimensions = extractDimensions(normalizedMessage?.normalized ?? commercialReasoning.customer_need);
    if (state?.lastService && selected && dimensions && canQuoteByArea(selected)) {
      const unitPrice = Number(selected.precio);
      const total = Number.isFinite(unitPrice) ? unitPrice * dimensions.area : null;
      return {
        type: 'quote_estimate',
        selectedType: NCIE_TYPES.SERVICE,
        selected,
        dimensions,
        unitPrice,
        total,
        priceText: total ? money(total) : null,
        summary: selected.nombre,
        question: '?Ya tienes el diseno o quieres que tambien te apoyemos con eso?'
      };
    }

    if (state?.lastService && selected && state?.commercial?.lastQuoteContext && mentionsDesign(normalizedMessage, state)) {
      return {
        type: 'quote_design_followup',
        selectedType: NCIE_TYPES.SERVICE,
        selected,
        quoteContext: state.commercial.lastQuoteContext,
        summary: selected.nombre,
        customerAnswer: normalizedMessage?.normalized ?? null,
        isShortAnswer: isShortAnswer(normalizedMessage),
        question: '?Quieres que lo dejemos contemplado con apoyo de diseno?'
      };
    }

    return {
      type: 'quote_from_memory',
      selectedType: state?.lastService ? NCIE_TYPES.SERVICE : state?.lastProduct ? NCIE_TYPES.PRODUCT : decision.selectedType,
      selected,
      summary: selected?.nombre ?? commercialReasoning.customer_need,
      question: state?.lastService ? serviceQuestion(state.lastService, commercialReasoning) : '?Que cantidad o variante necesitas?'
    };
  }

  if (commercialReasoning.conversation_goal === COMMERCIAL_GOALS.CONVERSATION) {
    return {
      type: 'conversation',
      summary: state?.needSummary ?? null,
      question: '?Que te gustaria revisar o cotizar?'
    };
  }

  if (commercialReasoning.conversation_goal === COMMERCIAL_GOALS.COMPARE) {
    const options = state?.lastServices?.length ? state.lastServices : state?.lastProducts ?? [];
    if (options.length > 0) {
      return {
        type: 'compare_options',
        options: options.slice(0, 4),
        selectedType: state?.lastServices?.length ? NCIE_TYPES.SERVICE : NCIE_TYPES.PRODUCT,
        summary: commercialReasoning.customer_need,
        question: '?Quieres que comparemos por precio, alcance o disponibilidad?'
      };
    }
  }

  if (
    commercialReasoning.conversation_goal === COMMERCIAL_GOALS.FIND_SOLUTION &&
    isBroadCommercialNeed({ nlu, retrieval }) &&
    Number(retrieval?.services?.[0]?.score ?? 0) > 0
  ) {
    return {
      type: 'consultative_options',
      groups: consultativeGroups(retrieval.services),
      selectedType: NCIE_TYPES.SERVICE,
      summary: commercialReasoning.customer_need,
      question: '?Buscas algo fisico para tu local o algo digital para captar clientes?'
    };
  }

  if (
    commercialReasoning.recommended_action === COMMERCIAL_ACTIONS.SUMMARIZE_BUSINESS &&
    Number(nlu?.confidence ?? 0) < 0.5 &&
    (!hasStrongService(retrieval) || hasAdvertisingIntent(retrieval)) &&
    !hasStrongProduct(retrieval) &&
    (hasDescriptiveServiceMatch(retrieval) || hasAdvertisingIntent(retrieval)) &&
    Number(retrieval?.services?.[0]?.score ?? 0) > 0
  ) {
    return {
      type: 'consultative_options',
      groups: consultativeGroups(retrieval.services),
      selectedType: NCIE_TYPES.SERVICE,
      summary: commercialReasoning.customer_need,
      question: '?Buscas algo fisico para tu local o algo digital para captar clientes?'
    };
  }

  if (commercialReasoning.recommended_action === COMMERCIAL_ACTIONS.SUMMARIZE_BUSINESS) {
    return {
      type: 'business_summary',
      company: retrieval.company,
      families: serviceFamilies(retrieval.services),
      categories: retrieval.categories ?? [],
      summary: 'Catalogo de servicios',
      question: '?Que objetivo quieres lograr o que opcion te interesa revisar?'
    };
  }

  if (
    commercialReasoning.conversation_goal === COMMERCIAL_GOALS.FIND_SOLUTION &&
    Number(nlu?.confidence ?? 0) < 0.5 &&
    !hasStrongService(retrieval) &&
    !hasStrongProduct(retrieval) &&
    retrieval.services.length > 0
  ) {
    return {
      type: 'business_summary',
      company: retrieval.company,
      families: serviceFamilies(retrieval.services),
      categories: retrieval.categories ?? [],
      summary: 'Resumen del negocio',
      question: '?Que area te interesa revisar primero?'
    };
  }

  if (hasStrongService(retrieval)) {
    const service = retrieval.services[0];
    return {
      type: 'service_explanation',
      selectedType: NCIE_TYPES.SERVICE,
      selected: service,
      priceText: servicePrice(service),
      summary: service.nombre,
      question: serviceQuestion(service, commercialReasoning)
    };
  }

  if (hasStrongProduct(retrieval)) {
    const product = retrieval.products[0];
    return {
      type: 'product_explanation',
      selectedType: NCIE_TYPES.PRODUCT,
      selected: product,
      priceText: productPrice(product),
      summary: product.nombre,
      question: '?Quieres que te comparta disponibilidad o alguna alternativa?'
    };
  }

  if ((nlu.missing_data ?? []).length > 0 || commercialReasoning.need_clarification) {
    return {
      type: 'clarify_need',
      summary: commercialReasoning.customer_need,
      question: nlu.intent === 'CONSULTAR_PRECIO'
        ? '?De que producto o servicio quieres que lo revise?'
        : '?Que producto, servicio o categoria tienes en mente para orientarte mejor?'
    };
  }

  const options = retrieval.services.length > 0
    ? retrieval.services.slice(0, 3)
    : retrieval.products.slice(0, 3);

  if (options.length > 0) {
    return {
      type: 'recommend_options',
      options,
      selectedType: retrieval.services.length > 0 ? NCIE_TYPES.SERVICE : NCIE_TYPES.PRODUCT,
      summary: commercialReasoning.customer_need,
      question: '?Cual de estas opciones se acerca mas a lo que necesitas?'
    };
  }

  return {
    type: 'clarify_need',
    summary: commercialReasoning.customer_need,
    question: '?Me cuentas que necesitas lograr para orientarte mejor?'
  };
}
