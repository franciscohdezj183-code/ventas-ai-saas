import { NCIE_ACTIONS, NCIE_TYPES } from './conversation-engine.types.js';

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
  if (type === 'POR_M2') return `${price}/m2`;
  if (type === 'POR_HORA') return `${price} por hora`;
  if (type === 'POR_UNIDAD') return `${price} por unidad`;
  return price;
}

function productLine(product, index) {
  const price = money(product?.precio);
  const stock = Number(product?.stock ?? 0) > 0 ? `${product.stock} disponibles` : 'sin stock disponible';
  return `${index + 1}. ${product.nombre}${price ? ` - ${price}` : ''} (${stock})`;
}

function serviceLine(service, index) {
  return `${index + 1}. ${service.nombre} - ${servicePrice(service)}`;
}

function groupByCategory(items) {
  const groups = new Map();
  for (const item of items ?? []) {
    const category = item?.categoria || 'Sin categoria';
    const current = groups.get(category) ?? [];
    current.push(item);
    groups.set(category, current);
  }
  return [...groups.entries()];
}

function renderCatalogSection({ title, items, startIndex = 1, grouped = false }) {
  if (!items?.length) return { text: '', nextIndex: startIndex };
  let index = startIndex;
  const lines = [title];
  if (grouped) {
    for (const [category, categoryItems] of groupByCategory(items)) {
      lines.push(`\n${category}`);
      for (const item of categoryItems) {
        lines.push(`${index}. ${item.nombre}`);
        index += 1;
      }
    }
  } else {
    for (const item of items) {
      lines.push(`${index}. ${item.nombre}`);
      index += 1;
    }
  }
  return { text: lines.join('\n'), nextIndex: index };
}

function productPrice(product) {
  const price = money(product?.precio);
  return price ?? 'precio por confirmar';
}

function normalizeResponseText(value) {
  return String(value ?? '')
    .replace(/Ã‚Â¿|Â¿/g, '\u00BF')
    .replace(/ÃƒÂ¡|Ã¡/g, '\u00E1')
    .replace(/ÃƒÂ©|Ã©/g, '\u00E9')
    .replace(/ÃƒÂ­|Ã­/g, '\u00ED')
    .replace(/ÃƒÂ³|Ã³/g, '\u00F3')
    .replace(/ÃƒÂº|Ãº/g, '\u00FA')
    .replace(/ÃƒÂ±|Ã±/g, '\u00F1')
    .replace(/(^|[\s\n])\?([A-Za-z\u00C1\u00C9\u00CD\u00D3\u00DA\u00DC\u00D1\u00E1\u00E9\u00ED\u00F3\u00FA\u00FC\u00F1])/g, '$1\u00BF$2');
}

function plannedQuestion(plan) {
  return plan?.question ?? 'Â¿Que te gustaria revisar?';
}

function contextLead(plan, fallback = 'Para avanzar bien') {
  const stage = String(plan?.stage ?? plan?.conversationStage ?? '').toLowerCase();
  if (stage === 'cotizacion') return 'Para cotizarlo con mejor precision';
  if (plan?.selected?.nombre) return `Para orientarte sobre ${plan.selected.nombre}`;
  return fallback;
}

function advisoryPriceLine(priceText) {
  if (!priceText) return 'El precio lo confirmamos con los datos del proyecto.';
  if (/requiere algunos detalles/i.test(priceText)) {
    return 'El precio se define con los datos del proyecto.';
  }
  return `La referencia de precio es ${priceText}.`;
}

function renderPlannedResponse(plan) {
  if (!plan) return null;

  if (plan.type === 'business_summary') {
    const companyName = plan.company?.nombre ? ` en ${plan.company.nombre}` : '';
    const lines = (plan.families ?? []).map((family, index) => {
      const examples = family.examples?.length ? `: ${family.examples.join(', ')}` : '';
      return `${index + 1}. ${family.category}${examples}`;
    });
    if (!plan.fullCatalog) {
      return `Trabajamos principalmente en diseno, impresion, publicidad fisica, rotulacion, senaletica, textiles, promocionales, marketing digital y paginas web.\n\n?Quieres ver opciones para publicidad fisica, presencia digital o diseno/imagen?`;
    }
    const body = lines.length
      ? lines.join('\n')
      : 'Diseno, impresion, rotulacion, senaletica, marketing digital, promocionales y soluciones a la medida.';
    return `Podemos ayudarte${companyName} en varias lineas, segun lo que necesites lograr:\n\n${body}\n\n${plannedQuestion(plan)}`;
  }

  if (plan.type === 'catalog_listing') {
    const services = plan.services ?? [];
    const products = plan.products ?? [];
    if (services.length === 0 && products.length === 0) {
      return `Por ahora no tengo servicios ni productos activos para mostrar.\n\n${plannedQuestion(plan)}`;
    }

    const sections = [];
    let nextIndex = 1;
    if (services.length > 0) {
      const rendered = renderCatalogSection({
        title: 'Servicios',
        items: services,
        startIndex: nextIndex,
        grouped: services.length > 6
      });
      sections.push(rendered.text);
      nextIndex = rendered.nextIndex;
    }
    if (products.length > 0) {
      const rendered = renderCatalogSection({
        title: 'Productos',
        items: products,
        startIndex: nextIndex,
        grouped: products.length > 6
      });
      sections.push(rendered.text);
      nextIndex = rendered.nextIndex;
    }

    return `Claro, estos son los ${services.length && products.length ? 'servicios y productos' : services.length ? 'servicios' : 'productos'} que manejamos:\n\n${sections.join('\n\n')}\n\n${plannedQuestion(plan)}`;
  }

  if (plan.type === 'generic_price_question') {
    return `Claro. Para darte precios necesito saber que quieres cotizar: lona, tarjetas, pagina web, marketing digital u otro servicio.`;
  }

  if (plan.type === 'service_explanation') {
    return `${plan.selected.nombre} si puede ser una buena opcion.\n\n${advisoryPriceLine(plan.priceText)}\n\n${contextLead(plan)}, ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'quote_estimate') {
    const dimensions = plan.dimensions;
    const dimensionsText = String(dimensions.text ?? '').replace(/\s+/g, '');
    const unitPrice = plan.unitPrice ? money(plan.unitPrice) : null;
    const total = plan.priceText ?? 'total por confirmar';
    const includesDesign = /\blona\b/i.test(String(plan.selected?.nombre ?? ''));
    const serviceIncludes = String(plan.selected?.incluye ?? '').trim();
    const serviceIncludesPlain = serviceIncludes.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const details = [
      `Para ${plan.selected.nombre} de ${dimensionsText}, con esas medidas serian aprox. ${dimensions.area} m2.`,
      unitPrice
        ? `La referencia es ${unitPrice}/m2, entonces el estimado inicial seria ${total}.`
        : `El estimado inicial seria ${total}.`
    ];
    if (serviceIncludes) details.push(`Incluye: ${serviceIncludes}.`);
    if (!/\bdiseno\b/.test(serviceIncludesPlain)) {
      details.push(includesDesign ? 'Incluye diseno.' : 'Diseno por confirmar segun alcance.');
    }
    if (plan.selected?.no_incluye) details.push(`No incluye: ${plan.selected.no_incluye}.`);
    details.push(plannedQuestion(plan));
    return details.join('\n\n');
  }

  if (plan.type === 'quote_design_followup') {
    const dimensions = plan.quoteContext?.dimensions;
    const total = money(plan.quoteContext?.total);
    const sizeText = dimensions?.text ? ` de ${dimensions.text}` : '';
    const totalText = total ? ` El estimado que llevamos es ${total}.` : '';
    if (plan.customerAnswer === 'ya_tiene_diseno') {
      return `Tomamos en cuenta que ya tienes el diseno para ${plan.selected.nombre}${sizeText}.${totalText}\n\nCuando gustes puedes enviarlo para revisarlo junto con la cotizacion.\n\n${plannedQuestion(plan)}`;
    }
    if (plan.isShortAnswer) {
      return `Lo dejamos considerado para ${plan.selected.nombre}${sizeText}.${totalText}\n\nSi ya tienes el diseno, puedes enviarlo; si necesitas apoyo para prepararlo, tambien lo revisamos contigo.\n\n${plannedQuestion(plan)}`;
    }
    if (/\blona\b/i.test(String(plan.selected?.nombre ?? ''))) {
      return `Perfecto, lo consideramos con apoyo de diseno. En impresion de lona el diseno va incluido como referencia dentro de la cotizacion; solo faltaria confirmar contenido y medidas finales.${totalText}\n\n${plannedQuestion(plan)}`;
    }
    return `Podemos apoyarte con el diseno para ${plan.selected.nombre}${sizeText}.${totalText}\n\nLo contemplamos junto con la cotizacion para que quede claro el alcance.\n\n${plannedQuestion(plan)}`;
  }

  if (plan.type === 'quote_requirements_followup') {
    const dimensions = plan.quoteContext?.dimensions;
    const total = money(plan.quoteContext?.total);
    const design = plan.quoteContext?.designSupport === false ? 'ya lo tienes' : 'incluido / apoyo requerido';
    const installationText = plan.installation
      ? 'revisar'
      : 'no incluida';
    if (plan.installation && total) {
      return `Perfecto, dejamos instalacion para revisar con asesor.\n\nResumen:\n${plan.selected.nombre} ${dimensions?.text ?? ''}\nArea: ${dimensions?.area ?? 'por confirmar'} m2\nEstimado impresion: ${total}\nDiseno: ${design}\nInstalacion: ${installationText}\n\n¿Quieres que te comunique con un asesor para confirmar tiempo y precio final?`;
    }
    return `Perfecto, lo dejamos solo como impresion.\n\nResumen:\n${plan.selected.nombre} ${dimensions?.text ?? ''}\nArea: ${dimensions?.area ?? 'por confirmar'} m2\nEstimado: ${total ?? 'por confirmar'}\nDiseno: ${design}\nInstalacion: ${installationText}\n\n¿Quieres que te comunique con un asesor para confirmar tiempo y precio final?`;
  }

  if (plan.type === 'budget_followup') {
    return plannedQuestion(plan);
  }

  if (plan.type === 'product_explanation') {
    return `${plan.selected.nombre} esta disponible para revisar.\n\n${advisoryPriceLine(plan.priceText)}\n\n${plannedQuestion(plan)}`;
  }

  if (plan.type === 'quote_from_memory') {
    const subject = plan.selected?.nombre ?? plan.summary ?? 'lo que revisamos';
    if (/^Lo (?:tomamos|dejamos)/i.test(String(plan.question ?? ''))) {
      return plannedQuestion(plan);
    }
    return `Retomamos ${subject}.\n\n${plannedQuestion(plan)}`;
  }

  if (plan.type === 'compare_options') {
    const lines = (plan.options ?? []).map((option, index) => {
      const price = option.tipo === 'producto' || option.stock !== undefined ? productPrice(option) : servicePrice(option);
      return `${index + 1}. ${option.nombre} | ${price} | ${option.categoria ?? 'sin categoria'}`;
    });
    return `Podemos comparar estas opciones para decidir mejor:\n\n${lines.join('\n')}\n\n${plannedQuestion(plan)}`;
  }

  if (plan.type === 'recommend_options') {
    const lines = (plan.options ?? []).map((option, index) => {
      const price = plan.selectedType === NCIE_TYPES.PRODUCT ? productPrice(option) : servicePrice(option);
      return `${index + 1}. ${option.nombre} - ${price}`;
    });
    return `Por lo que comentas, empezaria revisando estas opciones:\n\n${lines.join('\n')}\n\n${plannedQuestion(plan)}`;
  }

  if (plan.type === 'consultative_options') {
    const physical = (plan.groups?.physical ?? []).map((service) => service.nombre).join(', ');
    const digital = (plan.groups?.digital ?? []).map((service) => service.nombre).join(', ');
    const context = plan.businessContext ? ` para ${plan.businessContext}` : '';
    const lines = [`Para elegir bien${context}, conviene partir del objetivo antes que del producto:`];
    if (physical) lines.push(`Opciones fisicas: ${physical}.`);
    if (digital) lines.push(`Opciones digitales: ${digital}.`);
    if (!digital) lines.push('Si prefieres algo digital, dime y lo revisamos por ese lado.');
    lines.push(plannedQuestion(plan));
    return lines.join('\n\n');
  }

  if (plan.type === 'marketing_goal_followup') {
    const goal = plan.marketingGoal === 'mejorar_presencia_redes'
      ? 'mejorar tu presencia en redes'
      : plan.marketingGoal === 'atraer_clientes'
        ? 'atraer clientes'
        : plan.marketingGoal === 'vender_mas'
          ? 'vender mas'
          : 'definir el objetivo';
    return `Perfecto, lo tomamos como objetivo para ${goal} con ${plan.selected.nombre}.\n\nPara proponerte algo util, ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'consultative_diagnosis') {
    if (plan.businessContext) {
      return `Para ${plan.businessContext} podriamos revisar opciones fisicas como lonas, banners o viniles para el local, y tambien opciones digitales si quieres atraer clientes por redes.\n\n${plannedQuestion(plan)}`;
    }
    return `Claro, te ayudo a ubicar la mejor opcion. ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'personalized_products_summary') {
    return 'Trabajamos principalmente servicios e impresiones o productos personalizados: tarjetas, lonas, viniles, banners, senaletica, textiles y promocionales. Si tienes un uso en mente, te oriento con la mejor opcion.';
  }

  if (plan.type === 'recommendation_goal_question') {
    if (plan.businessContext) {
      return `Para ${plan.businessContext}, primero ubicaria el objetivo. Si buscas atraer gente cercana, conviene pensar en presencia fisica; si quieres captar por internet, conviene revisar una opcion digital. ${plannedQuestion(plan)}`;
    }
    return `Antes de recomendarte algo, necesito entender un poco tu negocio. ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'economic_category_question') {
    const context = plan.businessContext ? ` para ${plan.businessContext}` : '';
    return `Con presupuesto limitado conviene priorizar lo que mas impacto tenga${context}. ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'neutral_greeting') {
    if (plan.greetingText) return plan.greetingText;
    return `Hola, buenas tardes. Puedo ayudarte con informacion, cotizaciones o recomendaciones segun lo que necesites. ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'neutral_thanks') {
    return `A la orden. ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'neutral_resume') {
    const context = plan.contextServiceName ? ` Estabamos revisando ${plan.contextServiceName}.` : '';
    return `Sigo por aqui.${context} ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'neutral_ack') {
    return `Va, lo tengo presente. ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'conversation') {
    return `Te leo. ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'clarify_need') {
    if (plan.discovery === 'business_context') {
      return `Bien, con eso ya tengo una mejor referencia.\n\n${plannedQuestion(plan)}`;
    }
    if (plan.discovery === 'goal_without_business') {
      return `Hay varias formas de lograrlo, pero no te recomendaria una opcion solo por coincidencia.\n\n${plannedQuestion(plan)}`;
    }
    return `Te ayudo a ubicar la mejor opcion. ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'repair') {
    return `Tienes razon, lo replanteo para ayudarte mejor. ${plannedQuestion(plan)}`;
  }

  if (plan.type === 'escalate') {
    return 'Claro, te comunico con un asesor. Ya le comparti el resumen de tu solicitud.';
  }

  if (plan.type === 'advisor_declined') {
    return 'Perfecto, cuando quieras puedo ayudarte a avanzar con la cotizacion.';
  }

  return null;
}

function buildClarifyingQuestion(nlu, decision) {
  if (nlu.intent === 'CONSULTAR_PRECIO' && decision.selectedType === NCIE_TYPES.UNKNOWN) {
    return 'Para darte un precio util, necesito saber que producto o servicio quieres revisar.';
  }

  if (nlu.intent === 'ACLARACION_CLIENTE') {
    return 'Tienes razon, lo ubico de nuevo. Â¿Que necesitas resolver o que estabas buscando exactamente?';
  }

  if (nlu.entities?.problem || nlu.entities?.symptom) {
    return 'Para no darte informacion incorrecta, Â¿me puedes contar un poco mas sobre el problema?';
  }

  if ((decision.missingData ?? []).includes('producto_o_categoria')) {
    return 'Puedo buscar una opcion economica. Â¿Para que producto o categoria la necesitas?';
  }

  return 'Te ayudo a orientarlo. Â¿Buscas un producto especifico, un servicio o prefieres revisar opciones con un asesor?';
}

function serviceQuestion(nlu, service = null) {
  if (nlu.entities?.problem === 'plomeria') return 'Â¿La fuga es constante o solo aparece cuando usas el lavabo?';
  if (nlu.entities?.problem === 'refrigeracion') return 'Â¿Es refrigerador domestico o comercial?';
  if (nlu.entities?.problem === 'dental') return 'Â¿El dolor es leve o fuerte y desde cuando empezo?';
  if (nlu.entities?.problem === 'computadoras') return 'Â¿Es laptop o computadora de escritorio?';
  if (nlu.entities?.problem === 'camaras') return 'Â¿Cuantas camaras quieres instalar aproximadamente?';
  if (nlu.entities?.problem === 'contabilidad') return 'Â¿Es declaracion personal o de negocio?';
  if (nlu.entities?.problem === 'pagina_web') return 'Â¿Seria una pagina informativa, landing page o tienda en linea?';
  if (service?.requiere_medidas) return 'Â¿Me compartes las medidas aproximadas?';
  return 'Â¿Me puedes contar un poco mas para orientarte mejor?';
}

export function generateResponse({ nlu, retrieval, decision, state, responsePlan = null }) {
  let respuesta = '';
  let summary = responsePlan?.summary ?? decision.needSummary ?? null;

  const planned = renderPlannedResponse(responsePlan);
  if (planned) {
    const normalizedPlanned = normalizeResponseText(planned);
    return {
      respuesta: normalizedPlanned,
      summary,
      question: responsePlan?.question ?? (normalizedPlanned.includes('¿') ? normalizedPlanned.slice(normalizedPlanned.indexOf('¿')) : null),
      medios: []
    };
  }

  if (decision.action === NCIE_ACTIONS.ESCALATE_HUMAN) {
    respuesta = 'Claro, te comunico con un asesor. Ya le comparti el resumen de tu solicitud.';
  } else if (decision.action === NCIE_ACTIONS.CREATE_LEAD) {
    const subject = state?.lastService?.nombre ?? state?.lastProduct?.nombre ?? state?.lastSearchText ?? 'lo que revisamos';
    respuesta = `Registro tu interes en ${subject}. Un asesor puede ayudarte con el siguiente paso.`;
  } else if (decision.action === NCIE_ACTIONS.ASK_CLARIFYING_QUESTION) {
    respuesta = buildClarifyingQuestion(nlu, decision);
  } else if (nlu.intent === 'LISTAR_SERVICIOS' && retrieval.services.length > 0) {
    const lines = retrieval.services.slice(0, 5).map(serviceLine);
    respuesta = `Estos son algunos servicios que manejamos:\n\n${lines.join('\n')}\n\nDime cual te interesa y te comparto detalles o cotizacion.`;
    summary = 'Catalogo de servicios';
  } else if (nlu.intent === 'LISTAR_PRODUCTOS' && retrieval.products.length > 0) {
    const lines = retrieval.products.slice(0, 5).map(productLine);
    respuesta = `Tenemos estas opciones disponibles:\n\n${lines.join('\n')}\n\nDime cual quieres revisar y te comparto detalles.`;
    summary = 'Catalogo de productos';
  } else if (decision.selectedType === NCIE_TYPES.SERVICE && retrieval.services.length > 0) {
    const topService = retrieval.services[0];
    const lines = retrieval.services.slice(0, 3).map(serviceLine);
    const question = serviceQuestion(nlu, topService);

    if (decision.action === NCIE_ACTIONS.OFFER_SIMILAR_OPTIONS || retrieval.services.length > 1) {
      respuesta = `Encontre estas opciones que pueden servirte:\n\n${lines.join('\n')}\n\nÂ¿CuÃ¡l se parece mas a lo que necesitas?`;
    } else if (nlu.entities?.problem) {
      respuesta = `Por lo que comentas, parece relacionado con ${topService.nombre}. ${question}`;
    } else {
      respuesta = `${topService.nombre} puede ajustarse a lo que buscas. Para orientarte mejor, ${question}`;
    }
    summary = topService?.nombre ?? summary;
  } else if (decision.selectedType === NCIE_TYPES.PRODUCT && retrieval.products.length > 0) {
    const lines = retrieval.products.slice(0, 3).map(productLine);
    respuesta = decision.action === NCIE_ACTIONS.OFFER_SIMILAR_OPTIONS
      ? `Encontre estas opciones que pueden acercarse a lo que buscas:\n\n${lines.join('\n')}\n\nÂ¿CuÃ¡l se parece mas a lo que necesitas?`
      : `Encontre estas opciones:\n\n${lines.join('\n')}\n\nResponde con el numero o dime si buscas algo mas especifico.`;
    summary = retrieval.products[0]?.nombre ?? summary;
  } else if (retrieval.categories.length > 0) {
    const categories = retrieval.categories.slice(0, 5).map((category) => category.nombre).join(', ');
    respuesta = `Puedo ayudarte. Tenemos estas categorias para empezar: ${categories}. Â¿Cual quieres revisar?`;
  } else {
    respuesta = buildClarifyingQuestion(nlu, decision);
  }
  respuesta = normalizeResponseText(respuesta);

  return {
    respuesta,
    summary,
    question: respuesta.includes('¿') ? respuesta.slice(respuesta.indexOf('¿')) : null,
    medios: []
  };
}

