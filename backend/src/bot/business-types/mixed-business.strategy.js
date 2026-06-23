import {
  asProductSearchIntent,
  asServiceSearchIntent,
  hasProductResults,
  hasServiceResults,
  searchTextFromIntent
} from './shared-response-helpers.js';
import { serviceBusinessStrategy } from './service-business.strategy.js';

function hasLastProduct(conversationContext) {
  return Number(conversationContext?.ultimo_producto_id) > 0;
}

function hasLastService(conversationContext) {
  return Number(conversationContext?.ultimo_servicio_id) > 0;
}

function lastContextType(conversationContext) {
  const lastIntent = String(conversationContext?.ultima_intencion ?? '').toUpperCase();

  if (lastIntent.includes('SERVICIO') || lastIntent === 'AGENDAR_CITA') {
    return hasLastService(conversationContext) ? 'service' : null;
  }

  if (lastIntent.includes('PRODUCTO') || lastIntent === 'CONSULTAR_STOCK') {
    return hasLastProduct(conversationContext) ? 'product' : null;
  }

  if (hasLastService(conversationContext) && !hasLastProduct(conversationContext)) {
    return 'service';
  }

  if (hasLastProduct(conversationContext) && !hasLastService(conversationContext)) {
    return 'product';
  }

  return null;
}

function isShortContextQuestion(message) {
  return String(message ?? '').trim().split(/\s+/).length <= 5;
}

function isPriceQuestion(message) {
  return /\b(precio|cu[aá]nto cuesta|cuanto cuesta|costo|vale|cu[aá]nto vale|cuanto vale|cotizar|cotizaci[oó]n|presupuesto)\b/i.test(message);
}

function isPurchaseQuestion(message) {
  return /\b(me interesa|lo quiero|la quiero|quiero comprar|comprar|apartar|ap[aá]rtamelo|apartamelo|ap[aá]rtalo|apartalo|apartarlo|ap[aá]rtarlo|aparto|ap[aá]rto|como lo aparto|c[oó]mo lo aparto|separar|separamelo|me lo llevo|quiero ese|quiero informacion|quiero informaci[oó]n|hacer pedido|levantar pedido|finalizar compra|cerrar compra)\b/i.test(message);
}

function isAdvisorQuestion(message) {
  return /\b(asesor|humano|persona|vendedor|ejecutivo|atiendeme|ati[eé]ndeme)\b/i.test(message);
}

function isGreetingIntent(intent) {
  return intent.intencion === 'SALUDO';
}

function isGreetingMessage(message) {
  return /^(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hey|hello)$/i.test(String(message ?? '').trim());
}

function isLikelyProductQuestion(message) {
  return /\b(producto|productos|art[ií]culo|articulo|mercanc[ií]a|mercancia|pieza|piezas|modelo|modelos|cat[aá]logo|catalogo|stock|existencia|existencias|inventario|disponible|disponibilidad|comprar|precio)\b/i.test(message);
}

function isLikelyServiceQuestion(message) {
  return /\b(servicio|servicios|cita|agenda|agendar|reservar|cotizar|cotizaci[oó]n|instalaci[oó]n|instalacion|mantenimiento|reparaci[oó]n|reparacion|consulta|asesor[ií]a|asesoria|atenci[oó]n|atencion|dise[nñ]o|diseno|limpieza|soporte|diagn[oó]stico|diagnostico|lona|lonas|vinil|tarjeta|tarjetas|logotipo|logotipos|marketing|se[nñ]aletica|senaletica|textil|promocionales|banner|web)\b/i.test(message)
    || /\b(p[aá]gina|pagina|sitio)\s+web\b/i.test(message);
}

function isCategoryQuestion(message) {
  return /\b(categor[ií]a|categoria|categor[ií]as|categorias|departamentos|secciones)\b/i.test(message);
}

function isVagueCatalogRequest(message) {
  return /^(producto|productos|un producto|catalogo|catalogo de productos|opciones|info|informacion)$/i.test(String(message ?? '').trim());
}

function isLikelyProductNameSearch(message) {
  const cleanMessage = String(message ?? '').trim();
  const tokens = cleanMessage.split(/\s+/).filter(Boolean);

  return tokens.length > 0
    && tokens.length <= 6
    && /[a-z0-9]/i.test(cleanMessage)
    && !isVagueCatalogRequest(cleanMessage)
    && !isPriceQuestion(cleanMessage)
    && !isPurchaseQuestion(cleanMessage)
    && !isGreetingMessage(cleanMessage)
    && !isCategoryQuestion(cleanMessage);
}

function productSearchTextFromPurchase(message) {
  return String(message ?? '')
    .replace(/\b(me interesa|lo quiero|la quiero|quiero comprar|comprar|apartar|apartamelo|apartalo|apartarlo|aparto|como lo aparto|separar|separamelo|me lo llevo|quiero ese|quiero informacion|quiero información|hacer pedido|levantar pedido|finalizar compra|cerrar compra|quiero|una|un|el|la)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function withParams(intent, overrides = {}) {
  return {
    ...intent,
    parametros: {
      ...(intent.parametros ?? {}),
      ...overrides
    }
  };
}

function buildProductDetailIntent(intent, conversationContext) {
  return withParams(
    {
      ...intent,
      intencion: intent.intencion === 'CONSULTAR_STOCK' ? 'CONSULTAR_STOCK' : 'CONSULTAR_PRECIO',
      herramienta_mcp: 'obtener_producto'
    },
    { producto_id: conversationContext.ultimo_producto_id }
  );
}

function buildServiceDetailIntent(intent, conversationContext) {
  return withParams(
    {
      ...intent,
      intencion: 'CONSULTAR_PRECIO',
      herramienta_mcp: 'obtener_servicio'
    },
    { servicio_id: conversationContext.ultimo_servicio_id }
  );
}

function buildInterestIntent(intent, message, conversationContext) {
  const contextType = lastContextType(conversationContext);
  const contextId = contextType === 'service'
    ? { servicio_id: conversationContext.ultimo_servicio_id }
    : contextType === 'product'
      ? { producto_id: conversationContext.ultimo_producto_id }
      : {};

  return withParams(
    {
      ...intent,
      intencion: 'INTENCION_COMPRA',
      herramienta_mcp: contextType === 'product' ? 'crear_pedido' : 'registrar_intencion_compra'
    },
    {
      interes: intent.parametros?.interes
        ?? conversationContext?.ultimo_texto_busqueda
        ?? intent.parametros?.texto
        ?? message,
      ...contextId
    }
  );
}

function buildAmbiguousIntent(intent) {
  return {
    ...intent,
    intencion: 'MENSAJE_GENERAL',
    herramienta_mcp: '',
    parametros: {
      ...(intent.parametros ?? {}),
      respuesta_sugerida: 'Buscas un producto especifico o quieres informacion de algun servicio?'
    }
  };
}

function buildCatalogClarificationIntent(intent) {
  return {
    ...intent,
    intencion: 'MENSAJE_GENERAL',
    herramienta_mcp: '',
    parametros: {
      ...(intent.parametros ?? {}),
      respuesta_sugerida: 'Claro. Dime que producto especifico buscas por nombre, categoria o caracteristica. Tambien puedo mostrarte categorias o pasarte con un asesor.'
    }
  };
}

function buildDirectServiceIntent(intent, context) {
  const serviceIntent = serviceBusinessStrategy.prepareIntent(intent, context);

  if (serviceIntent.parametros?.respuesta_sugerida) {
    return serviceIntent;
  }

  return null;
}

export const mixedBusinessStrategy = {
  type: 'MIXTO',

  prepareIntent(intent, { conversationContext = null, normalizedMessage = '' } = {}) {
    const contextType = lastContextType(conversationContext);
    const productLike = isLikelyProductQuestion(normalizedMessage);
    const serviceLike = isLikelyServiceQuestion(normalizedMessage);

    if (isGreetingIntent(intent) || isGreetingMessage(normalizedMessage)) {
      return {
        ...intent,
        intencion: 'SALUDO',
        herramienta_mcp: '',
        parametros: { ...(intent.parametros ?? {}) }
      };
    }

    if (
      (isPurchaseQuestion(normalizedMessage) || intent.intencion === 'INTENCION_COMPRA')
      && contextType !== 'product'
      && !intent.parametros?.producto_id
      && !serviceLike
    ) {
      const searchText = productSearchTextFromPurchase(intent.parametros?.texto ?? normalizedMessage);

      if (isLikelyProductNameSearch(searchText)) {
        return asProductSearchIntent(withParams(intent, { texto: searchText }));
      }
    }

    if (isPurchaseQuestion(normalizedMessage) || intent.intencion === 'INTENCION_COMPRA') {
      return buildInterestIntent(intent, normalizedMessage, conversationContext);
    }

    if (isAdvisorQuestion(normalizedMessage) || intent.intencion === 'HABLAR_ASESOR') {
      return {
        ...intent,
        intencion: 'HABLAR_ASESOR',
        herramienta_mcp: 'crear_lead',
        parametros: {
          ...(intent.parametros ?? {}),
          interes: intent.parametros?.interes ?? intent.parametros?.texto ?? normalizedMessage
        }
      };
    }

    if (isCategoryQuestion(normalizedMessage) || intent.intencion === 'VER_CATEGORIAS') {
      return {
        ...intent,
        intencion: 'VER_CATEGORIAS',
        herramienta_mcp: 'obtener_categorias',
        parametros: { ...(intent.parametros ?? {}) }
      };
    }

    if (intent.intencion === 'MENSAJE_GENERAL' && isVagueCatalogRequest(normalizedMessage)) {
      return buildCatalogClarificationIntent(intent);
    }

    const directServiceIntent = buildDirectServiceIntent(intent, { conversationContext, normalizedMessage });

    if (directServiceIntent) {
      return directServiceIntent;
    }

    if (isShortContextQuestion(normalizedMessage) && (isPriceQuestion(normalizedMessage) || intent.intencion === 'CONSULTAR_STOCK')) {
      if (contextType === 'service') {
        return buildServiceDetailIntent(intent, conversationContext);
      }

      if (contextType === 'product') {
        return buildProductDetailIntent(intent, conversationContext);
      }
    }

    if (serviceLike) {
      return asServiceSearchIntent(intent);
    }

    if (productLike && !serviceLike) {
      return asProductSearchIntent(intent);
    }

    if (!serviceLike && intent.intencion === 'MENSAJE_GENERAL' && isLikelyProductNameSearch(normalizedMessage)) {
      return asProductSearchIntent(withParams(intent, { texto: normalizedMessage }));
    }

    if (!productLike && !serviceLike && intent.intencion === 'MENSAJE_GENERAL') {
      return buildAmbiguousIntent(intent);
    }

    return intent;
  },

  async resolveAfterTool({
    intent,
    toolResult,
    mcpClient,
    empresaId,
    normalizedMessage,
    normalizeSearchText
  }) {
    if (intent.herramienta_mcp === 'buscar_productos' && !hasProductResults(toolResult)) {
      const serviceResult = await mcpClient.callTool('buscar_servicios', {
        empresa_id: empresaId,
        texto: searchTextFromIntent(intent, normalizedMessage, normalizeSearchText)
      });

      if (!hasServiceResults(serviceResult)) {
        return null;
      }

      return {
        toolResult: serviceResult,
        responseIntent: asServiceSearchIntent(intent)
      };
    }

    if (intent.herramienta_mcp === 'buscar_servicios' && !hasServiceResults(toolResult)) {
      const productResult = await mcpClient.callTool('buscar_productos', {
        empresa_id: empresaId,
        texto: searchTextFromIntent(intent, normalizedMessage, normalizeSearchText)
      });

      if (!hasProductResults(productResult)) {
        return null;
      }

      return {
        toolResult: productResult,
        responseIntent: asProductSearchIntent(intent)
      };
    }

    if (intent.herramienta_mcp !== 'buscar_productos' || hasProductResults(toolResult)) {
      return null;
    }

    return null;
  }
};
