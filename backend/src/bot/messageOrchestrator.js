import { interpretIntent, validateIntentJson } from '../ai/intentInterpreter.js';
import {
  findConversationContext,
  saveConversationContext
} from './conversationContext.service.js';
import { notifyOwnerForLead, shouldNotifyOwner } from './notification.service.js';
import {
  hasActiveHandoff,
  requestHandoff
} from './humanHandoffManager.js';
import { getBotResponseProfile } from '../modules/bot-prompts/bot-prompts.service.js';
import { mcpClient as defaultMcpClient } from '../mcp/mcpClient.js';

function normalizePhone(value) {
  return String(value ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

function configuredSynonymEntries(synonyms) {
  if (!synonyms || typeof synonyms !== 'object' || Array.isArray(synonyms)) {
    return [];
  }

  return Object.entries(synonyms)
    .flatMap(([target, aliases]) => {
      const values = Array.isArray(aliases) ? aliases : [aliases];
      return values.map((alias) => [String(alias ?? '').trim(), String(target ?? '').trim()]);
    })
    .filter(([alias, target]) => alias && target);
}

function normalizarTextoBusqueda(value, synonyms = null) {
  const replacements = new Map([
    ['ke', 'que'],
    ['q', 'que'],
    ['k', 'que'],
    ['kiero', 'quiero'],
    ['kiro', 'quiero'],
    ['qiero', 'quiero'],
    ['komprar', 'comprar'],
    ['conprar', 'comprar'],
    ['presio', 'precio'],
    ['prcio', 'precio'],
    ['presios', 'precios'],
    ['kuanto', 'cuanto'],
    ['cuantoo', 'cuanto'],
    ['tines', 'tienes'],
    ['tenes', 'tienes'],
    ['ay', 'hay'],
    ['envioo', 'envio'],
    ['embio', 'envio'],
    ['asesr', 'asesor'],
    ['asessor', 'asesor'],
    ['sya', 'silla'],
    ['siya', 'silla'],
    ['siyas', 'sillas'],
    ['sillaz', 'sillas'],
    ['sila', 'silla'],
    ['madra', 'madera'],
    ['mdera', 'madera'],
    ['maderaa', 'madera'],
    ['plasticoo', 'plastico'],
    ['plastik', 'plastico'],
    ['mesaz', 'mesas'],
    ['meza', 'mesa'],
    ['mezas', 'mesas']
  ]);

  for (const [alias, target] of configuredSynonymEntries(synonyms)) {
    replacements.set(
      alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      target.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
  }

  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:()[\]{}"'`´]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => replacements.get(word) ?? word)
    .join(' ');
}

function responseEmoji(profile, key, fallback = '') {
  return profile?.usar_emojis === false ? '' : profile?.emojis?.[key] ?? fallback;
}

function configuredText(profile, key, fallback) {
  const value = String(profile?.[key] ?? '').trim();
  return value || fallback;
}

function applyResponseTemplate(template, replacements) {
  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value ?? ''),
    template
  );
}

function buildProductResponse(result, profile = {}) {
  const product = result?.producto;
  const products = result?.productos ?? [];

  if (product) {
    const price = Number(product.precio).toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });
    const stock = Number(product.stock) > 0 ? product.stock : 'sin stock disponible';
    const details = [
      `*${product.nombre}*`,
      '',
      `💰 Precio: ${price}`,
      `📦 Disponibles: ${stock}`,
      product.categoria ? `📂 Categoría: ${product.categoria}` : null,
      '',
      'Te puedo mostrar mas opciones similares o pasarte con un asesor.'
    ].filter(Boolean);

    return details.join('\n');
  }

  if (!products.length) {
    return applyResponseTemplate(
      profile.mensaje_sin_resultados ?? '{emoji_principal} Por ahora no encontre ese producto exacto.\nPuedo ayudarte a buscar algo similar o pasarte con un asesor.',
      { emoji_principal: responseEmoji(profile, 'principal', '') }
    ).trim();
  }

  const productLines = products.map((product, index) => {
    const price = Number(product.precio).toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });
    const stock = Number(product.stock) > 0 ? `${product.stock} disponibles` : 'sin stock disponible';

    return [
      `${index + 1}. ${product.nombre}`,
      `   💰 Precio: ${price}`,
      `   📦 Stock: ${stock}`
    ].join('\n');
  });

  return applyResponseTemplate(
    profile.formato_respuesta ?? '{emoji_principal} Claro, encontre estas opciones para ti:\n\n{items}\n\nResponde con el numero de la opcion que quieres ver, por ejemplo: 1.',
    {
      emoji_principal: responseEmoji(profile, 'principal', ''),
      items: productLines.join('\n\n')
    }
  ).trim();
}

function buildProductMedia(result, caption = '') {
  const products = result?.producto ? [result.producto] : result?.productos ?? [];

  return products
    .filter((product) => product?.imagen)
    .slice(0, 3)
    .map((product) => ({
      type: 'image',
      url: product.imagen,
      caption: caption || product.nombre
    }));
}

function buildServiceResponse(result, profile = {}) {
  const services = result?.servicios ?? [];
  const service = result?.servicio;

  function formatServicePrice(currentService) {
    const type = String(currentService.tipo_precio ?? 'FIJO').toUpperCase();

    if (type === 'COTIZACION') {
      return 'requiere cotizacion con asesor';
    }

    const price = Number(currentService.precio).toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });

    if (type === 'DESDE') {
      return `desde ${price}`;
    }

    if (type === 'POR_M2') {
      return `${price} por m2`;
    }

    return price;
  }

  if (service) {
    const price = formatServicePrice(service);
    const duration = service.duracion ? ` Dura aproximadamente ${service.duracion} min.` : '';

    return `Si, tenemos disponible *${service.nombre}*: ${price}.${duration} Te puedo agendar una cita o pasarte con un asesor.`;
  }

  if (services.length === 0) {
    return applyResponseTemplate(
      profile.mensaje_sin_resultados ?? '{emoji_principal} Por ahora no encontre ese servicio exacto.\nPuedo revisar una opcion similar o pasarte con un asesor.',
      { emoji_principal: responseEmoji(profile, 'principal', '') }
    ).trim();
  }

  const lines = services.map((service) => {
    const price = formatServicePrice(service);
    const duration = service.duracion ? `, duracion ${service.duracion} min` : '';
    return `- ${service.nombre}: ${price}${duration}`;
  });

  return [
    `${responseEmoji(profile, 'principal', '')} Claro, estos servicios pueden interesarte:`.trim(),
    ...lines,
    'Responde con el servicio que quieres revisar o te paso con un asesor.'
  ].join('\n');
}

function buildCategoriesResponse(result) {
  const categories = result?.categorias ?? [];

  if (categories.length === 0) {
    return 'Por ahora no hay categorias configuradas. Puedo ayudarte a buscar por nombre de producto o pasarte con un asesor.';
  }

  return `Tenemos estas categorias: ${categories.map((category) => category.nombre).join(', ')}. Dime cual quieres revisar.`;
}

function buildCompanyInfoResponse(intent, result) {
  const company = result?.empresa;

  if (!company) {
    return 'En este momento no pude consultar la informacion de la empresa. Puedo intentar de nuevo o pasarte con un asesor.';
  }

  if (intent.intencion === 'CONSULTAR_UBICACION') {
    return company.direccion
      ? `Nuestra ubicacion es: ${company.direccion}. Te puedo ayudar con disponibilidad o pasarte con un asesor.`
      : 'Aun no tengo una ubicacion configurada. Te puedo pasar con un asesor para confirmarla.';
  }

  if (intent.intencion === 'CONSULTAR_HORARIO') {
    return company.horario_atencion
      ? `Nuestro horario de atencion es: ${company.horario_atencion}. Te puedo ayudar con productos o pasarte con un asesor.`
      : 'Aun no hay horario configurado. Te puedo pasar con un asesor para confirmar disponibilidad.';
  }

  if (intent.intencion === 'CONSULTAR_METODOS_PAGO') {
    return company.politica_pagos
      ? `Aceptamos estas opciones de pago: ${company.politica_pagos}. Te puedo ayudar a elegir un producto o pasarte con un asesor.`
      : 'Aun no hay metodos de pago configurados. Te puedo pasar con un asesor para confirmarlos.';
  }

  if (intent.intencion === 'CONSULTAR_ENVIOS') {
    return company.politica_entrega
      ? `Sobre entregas y envios: ${company.politica_entrega}. Te puedo confirmar un producto o pasarte con un asesor.`
      : 'Aun no hay politica de envios configurada. Te puedo pasar con un asesor para confirmarla.';
  }

  return `Estas hablando con ${company.nombre_bot ?? company.nombre}. Puedo ayudarte a buscar productos, revisar servicios o pasarte con un asesor.`;
}

function buildLeadResponse(intent, result) {
  if (result?.handoff_duplicate) {
    return 'Ya avise a un asesor. Mientras tanto puedo seguir resolviendo tus dudas.';
  }

  if (intent.intencion === 'HABLAR_ASESOR' || intent.intencion === 'INTENCION_COMPRA') {
    return result?.profile?.mensaje_asesor ?? 'Perfecto, voy a avisarle a un asesor para que te apoye. Mientras tanto puedo seguir resolviendo tus dudas.';
  }

  if (intent.intencion === 'AGENDAR_CITA') {
    return 'Listo, voy a avisarle a un asesor para confirmar el horario. Mientras tanto puedo seguir resolviendo tus dudas.';
  }

  return 'Perfecto, voy a avisarle a un asesor para ayudarte con la compra. Mientras tanto puedo seguir resolviendo tus dudas.';
}

function buildStaticResponse(intent, companyContext = {}) {
  const profile = companyContext.response_profile ?? {};
  const responses = {
    SALUDO: configuredText(profile, 'saludo_personalizado', companyContext.mensaje_bienvenida || 'Hola, gracias por escribirnos. Dime que producto o servicio buscas y te ayudo a revisarlo.'),
    DESPEDIDA: configuredText(profile, 'despedida_personalizada', 'Gracias por escribirnos. Cuando necesites algo mas, aqui te ayudamos.'),
    AGRADECIMIENTO: 'Con gusto. Te puedo mostrar mas opciones o pasarte con un asesor.',
    AYUDA: 'Puedo ayudarte a buscar productos, revisar precios, confirmar disponibilidad o pasarte con un asesor.',
    FUERA_DE_TEMA: 'Puedo ayudarte con productos, servicios y atencion comercial. Dime que estas buscando.',
    MENSAJE_GENERAL: 'Claro, cuentame que producto o servicio buscas y reviso opciones para ti.'
  };

  return responses[intent.intencion] ?? responses.MENSAJE_GENERAL;
}

function buildResponse(intent, toolResult, companyContext = {}) {
  const profile = companyContext.response_profile ?? {};
  switch (intent.herramienta_mcp) {
    case 'buscar_productos':
    case 'obtener_producto':
      return buildProductResponse(toolResult, profile);
    case 'buscar_servicios':
    case 'obtener_servicio':
      return buildServiceResponse(toolResult, profile);
    case 'obtener_categorias':
      return buildCategoriesResponse(toolResult);
    case 'obtener_promociones':
      return toolResult?.mensaje ?? 'No hay promociones configuradas en este momento.';
    case 'obtener_configuracion_empresa':
      return buildCompanyInfoResponse(intent, toolResult);
    case 'crear_lead':
    case 'registrar_intencion_compra':
      return buildLeadResponse(intent, { ...toolResult, profile });
    default:
      return buildStaticResponse(intent, companyContext);
  }
}

function buildMedia(intent, toolResult, response) {
  switch (intent.herramienta_mcp) {
    case 'obtener_producto':
      return buildProductMedia(toolResult, response);
    default:
      return [];
  }
}

function buildToolArgs(toolName, { empresaId, phone, message, normalizedMessage, intent, conversationContext }) {
  const params = intent.parametros ?? {};
  const searchText = params.texto ? normalizarTextoBusqueda(params.texto, intent.sinonimos) : normalizedMessage;

  switch (toolName) {
    case 'buscar_productos':
      return {
        empresa_id: empresaId,
        texto: searchText,
        categoria: params.categoria,
        color: params.color,
        tamano: params.tamano,
        presupuesto: params.presupuesto,
        precio_min: params.precio_min,
        precio_max: params.precio_max,
        stock_requerido: params.stock_requerido,
        offset: params.offset
      };
    case 'obtener_producto':
      return {
        empresa_id: empresaId,
        producto_id: params.producto_id ?? params.id ?? conversationContext?.ultimo_producto_id
      };
    case 'buscar_servicios':
      return {
        empresa_id: empresaId,
        texto: searchText
      };
    case 'obtener_servicio':
      return {
        empresa_id: empresaId,
        servicio_id: params.servicio_id ?? params.id ?? conversationContext?.ultimo_servicio_id
      };
    case 'crear_lead':
    case 'registrar_intencion_compra':
      return {
        empresa_id: empresaId,
        telefono: params.telefono ?? phone,
        nombre_cliente: params.nombre_cliente,
        interes: params.interes ?? params.texto ?? message,
        producto_id: params.producto_id ?? conversationContext?.ultimo_producto_id,
        servicio_id: params.servicio_id ?? conversationContext?.ultimo_servicio_id
      };
    case 'obtener_categorias':
    case 'obtener_promociones':
    case 'obtener_configuracion_empresa':
      return { empresa_id: empresaId };
    default:
      return { empresa_id: empresaId };
  }
}

function hasProductContext(conversationContext) {
  return Number(conversationContext?.ultimo_producto_id) > 0;
}

function hasServiceContext(conversationContext) {
  return Number(conversationContext?.ultimo_servicio_id) > 0;
}

function getLastShownProducts(conversationContext) {
  const products =
    conversationContext?.datos_json?.ultima_lista_productos ??
    conversationContext?.datos_json?.productos_mostrados;
  return Array.isArray(products) ? products : [];
}

function getLastProductSearch(conversationContext) {
  const search = conversationContext?.datos_json?.ultima_busqueda_productos;
  return search && typeof search === 'object' && !Array.isArray(search) ? search : null;
}

function extractSelectedOptionNumber(message) {
  const cleanMessage = String(message ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const match = cleanMessage.match(/^(?:el|la)?\s*(?:opcion\s*)?(\d{1,2})$/);
  const selectedNumber = Number(match?.[1]);

  return Number.isInteger(selectedNumber) && selectedNumber > 0 ? selectedNumber : null;
}

function findSelectedProductFromContext(message, conversationContext) {
  const selectedNumber = extractSelectedOptionNumber(message);

  if (!selectedNumber) {
    return null;
  }

  const products = getLastShownProducts(conversationContext);
  return products[selectedNumber - 1] ?? null;
}

function isShortContextualQuestion(message) {
  const tokens = String(message ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  return tokens.length > 0 && tokens.length <= 4;
}

function isPriceFollowUp(message) {
  return /\b(cu[aá]nto cuesta|cuanto cuesta|precio|costo|vale|cu[aá]nto vale)\b/i.test(message);
}

function isPurchaseFollowUp(message) {
  return /\b(me interesa|lo quiero|la quiero|quiero comprar|comprar|ap[aá]rtamelo|apartamelo|ap[aá]rtalo|apartalo|me lo llevo|quiero ese|p[aá]same con asesor|pasame con asesor|quiero informaci[oó]n|quiero informacion)\b/i.test(message);
}

function isShippingFollowUp(message) {
  return /\b(env[ií]o|envio|entrega|mandan|llevan|domicilio)\b/i.test(message);
}

function isMoreOptionsFollowUp(message) {
  return /\b(m[aá]s|mas|m[aá]s opciones|mas opciones|tienes m[aá]s|tienes mas|otros|ver m[aá]s|ver mas|m[aá]s productos|mas productos)\b/i.test(message);
}

function applyConversationContext(intent, message, conversationContext) {
  const nextIntent = {
    ...intent,
    parametros: { ...(intent.parametros ?? {}) }
  };

  if (!conversationContext && isPurchaseFollowUp(message)) {
    return {
      ...nextIntent,
      intencion: 'INTENCION_COMPRA',
      herramienta_mcp: 'registrar_intencion_compra',
      parametros: {
        ...nextIntent.parametros,
        interes: nextIntent.parametros.interes ?? nextIntent.parametros.texto ?? message
      }
    };
  }

  if (!conversationContext) {
    return nextIntent;
  }

  const lastProductSearch = getLastProductSearch(conversationContext);

  if (isMoreOptionsFollowUp(message) && lastProductSearch) {
    return {
      ...nextIntent,
      intencion: 'BUSCAR_PRODUCTO',
      herramienta_mcp: 'buscar_productos',
      parametros: {
        ...(lastProductSearch.parametros ?? {}),
        offset: lastProductSearch.next_offset ?? 0
      }
    };
  }

  const selectedProduct = findSelectedProductFromContext(message, conversationContext);

  if (selectedProduct?.id) {
    return {
      ...nextIntent,
      intencion: 'CONSULTAR_PRECIO',
      herramienta_mcp: 'obtener_producto',
      parametros: {
        ...nextIntent.parametros,
        producto_id: selectedProduct.id
      }
    };
  }

  if (isShortContextualQuestion(message) && hasProductContext(conversationContext)) {
    if (isPriceFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: 'obtener_producto',
        parametros: { producto_id: conversationContext.ultimo_producto_id }
      };
    }

    if (isShippingFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_ENVIOS',
        herramienta_mcp: 'obtener_configuracion_empresa',
        parametros: {}
      };
    }

    if (isPurchaseFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'INTENCION_COMPRA',
        herramienta_mcp: 'registrar_intencion_compra',
        parametros: {
          interes: conversationContext.ultimo_texto_busqueda ?? message,
          producto_id: conversationContext.ultimo_producto_id
        }
      };
    }
  }

  if (isShortContextualQuestion(message) && hasServiceContext(conversationContext)) {
    if (isPriceFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: 'obtener_servicio',
        parametros: { servicio_id: conversationContext.ultimo_servicio_id }
      };
    }

    if (isPurchaseFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'INTENCION_COMPRA',
        herramienta_mcp: 'registrar_intencion_compra',
        parametros: {
          interes: conversationContext.ultimo_texto_busqueda ?? message,
          servicio_id: conversationContext.ultimo_servicio_id
        }
      };
    }
  }

  if (hasProductContext(conversationContext) && !nextIntent.parametros.producto_id) {
    if (nextIntent.intencion === 'CONSULTAR_PRECIO' || nextIntent.intencion === 'CONSULTAR_STOCK') {
      nextIntent.herramienta_mcp = 'obtener_producto';
      nextIntent.parametros.producto_id = conversationContext.ultimo_producto_id;
      return nextIntent;
    }

    if (nextIntent.intencion === 'INTENCION_COMPRA') {
      nextIntent.parametros.producto_id = conversationContext.ultimo_producto_id;
      nextIntent.parametros.interes = nextIntent.parametros.interes ?? conversationContext.ultimo_texto_busqueda ?? message;
      return nextIntent;
    }
  }

  if (hasServiceContext(conversationContext) && !nextIntent.parametros.servicio_id) {
    if (nextIntent.intencion === 'CONSULTAR_PRECIO') {
      nextIntent.herramienta_mcp = 'obtener_servicio';
      nextIntent.parametros.servicio_id = conversationContext.ultimo_servicio_id;
      return nextIntent;
    }

    if (nextIntent.intencion === 'INTENCION_COMPRA' || nextIntent.intencion === 'AGENDAR_CITA') {
      nextIntent.parametros.servicio_id = conversationContext.ultimo_servicio_id;
      nextIntent.parametros.interes = nextIntent.parametros.interes ?? conversationContext.ultimo_texto_busqueda ?? message;
      return nextIntent;
    }
  }

  if (nextIntent.intencion === 'MENSAJE_GENERAL' && isPriceFollowUp(message)) {
    if (hasProductContext(conversationContext)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: 'obtener_producto',
        parametros: { producto_id: conversationContext.ultimo_producto_id }
      };
    }

    if (hasServiceContext(conversationContext)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: 'obtener_servicio',
        parametros: { servicio_id: conversationContext.ultimo_servicio_id }
      };
    }
  }

  if (nextIntent.intencion === 'MENSAJE_GENERAL' && hasProductContext(conversationContext) && isShippingFollowUp(message)) {
    return {
      ...nextIntent,
      intencion: 'CONSULTAR_ENVIOS',
      herramienta_mcp: 'obtener_configuracion_empresa',
      parametros: {}
    };
  }

  if (nextIntent.intencion === 'MENSAJE_GENERAL' && isPurchaseFollowUp(message)) {
    return {
      ...nextIntent,
      intencion: 'INTENCION_COMPRA',
      herramienta_mcp: 'registrar_intencion_compra',
      parametros: {
        interes: conversationContext.ultimo_texto_busqueda ?? message,
        producto_id: conversationContext.ultimo_producto_id ?? undefined,
        servicio_id: conversationContext.ultimo_servicio_id ?? undefined
      }
    };
  }

  return nextIntent;
}

function serializeProductContext(product) {
  return {
    id: product.id,
    nombre: product.nombre,
    precio: product.precio,
    imagen: product.imagen ?? null,
    categoria: product.categoria ?? null
  };
}

function extractContextPatch({ intent, toolResult, message, conversationContext }) {
  const previousData = conversationContext?.datos_json ?? {};
  const previousProductList = getLastShownProducts(conversationContext);
  const previousProductSearch = getLastProductSearch(conversationContext);
  const products = toolResult?.productos ?? [];
  const services = toolResult?.servicios ?? [];
  const product = toolResult?.producto ?? products[0] ?? null;
  const service = toolResult?.servicio ?? services[0] ?? null;
  const leadProductId = toolResult?.producto_id ?? intent.parametros?.producto_id ?? null;
  const leadServiceId = toolResult?.servicio_id ?? intent.parametros?.servicio_id ?? null;
  const currentProductList = products.map(serializeProductContext);
  const lastProductList = currentProductList.length > 0 ? currentProductList : previousProductList;
  const lastCategory =
    product?.categoria ??
    products.find((product) => product?.categoria)?.categoria ??
    previousData.ultima_categoria ??
    null;
  const isProductSearch = intent.herramienta_mcp === 'buscar_productos';
  const searchParams = isProductSearch
    ? {
        texto: intent.parametros?.texto ?? null,
        categoria: intent.parametros?.categoria ?? null,
        color: intent.parametros?.color ?? null,
        tamano: intent.parametros?.tamano ?? null,
        presupuesto: intent.parametros?.presupuesto ?? null,
        precio_min: intent.parametros?.precio_min ?? null,
        precio_max: intent.parametros?.precio_max ?? null,
        stock_requerido: intent.parametros?.stock_requerido ?? null
      }
    : previousProductSearch?.parametros ?? null;
  const lastProductSearch = searchParams
    ? {
        parametros: searchParams,
        offset: toolResult?.paginacion?.offset ?? previousProductSearch?.offset ?? 0,
        next_offset: toolResult?.paginacion?.next_offset ?? previousProductSearch?.next_offset ?? 0,
        has_more: toolResult?.paginacion?.has_more ?? previousProductSearch?.has_more ?? false
      }
    : null;

  return {
    ultimaIntencion: intent.intencion,
    ultimoProductoId: product?.id ?? leadProductId,
    ultimoServicioId: service?.id ?? leadServiceId,
    ultimoTextoBusqueda:
      intent.parametros?.texto ??
      intent.parametros?.interes ??
      product?.nombre ??
      service?.nombre ??
      message,
    datos: {
      herramienta_mcp: intent.herramienta_mcp,
      parametros: intent.parametros,
      producto: product
        ? serializeProductContext(product)
        : previousData.producto ?? null,
      ultima_lista_productos: lastProductList,
      productos_mostrados: lastProductList,
      ultima_categoria: lastCategory,
      ultima_busqueda_productos: lastProductSearch,
      servicio: service
        ? {
            id: service.id,
            nombre: service.nombre,
            precio: service.precio,
            tipo_precio: service.tipo_precio
          }
        : null
    }
  };
}

async function getMinimalCompanyContext(empresaId, mcpClient) {
  try {
    const result = await mcpClient.callTool('obtener_configuracion_empresa', { empresa_id: empresaId });
    const responseProfile = mcpClient === defaultMcpClient
      ? await getBotResponseProfile(empresaId).catch(() => null)
      : null;
    const company = result.empresa;

    return {
      nombre: company?.nombre,
      tipo_negocio: company?.tipo_negocio,
      nombre_bot: company?.nombre_bot,
      tono_respuesta: company?.tono_respuesta,
      mensaje_bienvenida: company?.mensaje_bienvenida,
      mensaje_fuera_horario: company?.mensaje_fuera_horario,
      horario_atencion: company?.horario_atencion,
      politica_entrega: company?.politica_entrega,
      politica_pagos: company?.politica_pagos,
      response_profile: responseProfile
    };
  } catch {
    return {};
  }
}

export async function orchestrateIncomingMessage({
  empresaId,
  phone,
  message,
  whatsappChatId = null,
  contexto = null,
  interpreter = interpretIntent,
  mcpClient = defaultMcpClient,
  handoffManager = {
    hasActive: hasActiveHandoff,
    request: requestHandoff
  },
  contextStore = {
    find: findConversationContext,
    save: saveConversationContext
  }
}) {
  const cleanPhone = normalizePhone(phone);
  const conversationContext = await contextStore.find({ empresaId, phone: cleanPhone });
  const contextoEmpresa = contexto ?? (await getMinimalCompanyContext(empresaId, mcpClient));
  const normalizedMessage = normalizarTextoBusqueda(message, contextoEmpresa.response_profile?.sinonimos);
  const contextoCompleto = {
    ...contextoEmpresa,
    conversacion_contexto: conversationContext
      ? {
          ultima_intencion: conversationContext.ultima_intencion,
          ultimo_producto_id: conversationContext.ultimo_producto_id,
          ultimo_servicio_id: conversationContext.ultimo_servicio_id,
          ultimo_texto_busqueda: conversationContext.ultimo_texto_busqueda,
          datos: conversationContext.datos_json
        }
      : null
  };
  const interpretedIntent = await interpreter({
    empresa_id: empresaId,
    mensaje_cliente: normalizedMessage,
    contexto: contextoCompleto
  });
  const intent = applyConversationContext(validateIntentJson(interpretedIntent), normalizedMessage, conversationContext);
  intent.sinonimos = contextoEmpresa.response_profile?.sinonimos ?? null;
  let toolResult = null;
  let notificationResult = null;
  let responseIntent = intent;
  const shouldRequestHuman = shouldNotifyOwner(intent.intencion);
  const activeHandoffExists = shouldRequestHuman
    ? await handoffManager.hasActive({ empresaId, phone: cleanPhone })
    : false;

  if (intent.herramienta_mcp && !activeHandoffExists) {
    toolResult = await mcpClient.callTool(
      intent.herramienta_mcp,
      buildToolArgs(intent.herramienta_mcp, {
        empresaId,
        phone: cleanPhone,
        message,
        normalizedMessage,
        intent,
        conversationContext
      })
    );

    if (intent.herramienta_mcp === 'buscar_productos' && (toolResult?.productos?.length ?? 0) === 0) {
      const serviceResult = await mcpClient.callTool('buscar_servicios', {
        empresa_id: empresaId,
        texto: intent.parametros?.texto ? normalizarTextoBusqueda(intent.parametros.texto) : normalizedMessage
      });

      if ((serviceResult?.servicios?.length ?? 0) > 0) {
        toolResult = serviceResult;
        responseIntent = {
          ...intent,
          intencion: 'BUSCAR_SERVICIO',
          herramienta_mcp: 'buscar_servicios'
        };
      }
    }
  } else if (activeHandoffExists) {
    toolResult = {
      handoff_duplicate: true,
      telefono: cleanPhone,
      interes: intent.parametros?.interes ?? intent.parametros?.texto ?? message,
      producto_id: intent.parametros?.producto_id ?? conversationContext?.ultimo_producto_id ?? null,
      servicio_id: intent.parametros?.servicio_id ?? conversationContext?.ultimo_servicio_id ?? null
    };
  }

  const response = buildResponse(responseIntent, toolResult, contextoEmpresa);
  const media = buildMedia(responseIntent, toolResult, response);
  const savedConversation = await mcpClient.callTool('guardar_conversacion', {
    empresa_id: empresaId,
    telefono: cleanPhone,
    mensaje: message,
    respuesta: response
  });

  if (shouldRequestHuman) {
    try {
      notificationResult = await handoffManager.request({
        empresa_id: empresaId,
        conversation_id: savedConversation.conversacion_id,
        telefono_cliente: cleanPhone,
        whatsapp_chat_id: whatsappChatId,
        mensaje_cliente: message,
        producto_id: toolResult?.producto_id ?? intent.parametros?.producto_id ?? conversationContext?.ultimo_producto_id ?? null,
        servicio_id: toolResult?.servicio_id ?? intent.parametros?.servicio_id ?? conversationContext?.ultimo_servicio_id ?? null,
        motivo: intent.intencion,
        mcpClientInstance: mcpClient
      });
    } catch (error) {
      notificationResult = {
        estado: 'ERROR',
        error: error.message
      };
    }
  } else if (shouldNotifyOwner(intent.intencion) && toolResult?.lead_id) {
    try {
      notificationResult = await notifyOwnerForLead({
        empresaId,
        intent,
        toolResult,
        phone: cleanPhone,
        message,
        mcpClientInstance: mcpClient
      });
    } catch (error) {
      notificationResult = {
        estado: 'ERROR',
        error: error.message
      };
    }
  }

  await contextStore.save({
    empresaId,
    phone: cleanPhone,
    ...extractContextPatch({ intent: responseIntent, toolResult, message, conversationContext })
  });

  return {
    respuesta: response,
    medios: media,
    intencion: responseIntent.intencion,
    herramienta_mcp: responseIntent.herramienta_mcp,
    parametros: responseIntent.parametros,
    confianza: intent.confianza,
    requiere_respuesta_ia: intent.requiere_respuesta_ia,
    mcp_result: toolResult,
    notificacion: notificationResult,
    lead_id: toolResult?.lead_id ?? null,
    conversacion_id: savedConversation.conversacion_id
  };
}

