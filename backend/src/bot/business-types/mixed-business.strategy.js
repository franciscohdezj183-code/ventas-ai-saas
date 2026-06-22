import {
  asProductSearchIntent,
  asServiceSearchIntent,
  hasProductResults,
  hasServiceResults,
  searchTextFromIntent
} from './shared-response-helpers.js';

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
  return /\b(me interesa|lo quiero|la quiero|quiero comprar|comprar|ap[aá]rtamelo|apartamelo|ap[aá]rtalo|apartalo|me lo llevo|quiero ese|quiero informacion|quiero informaci[oó]n)\b/i.test(message);
}

function isLikelyProductQuestion(message) {
  return /\b(producto|productos|art[ií]culo|articulo|mercanc[ií]a|mercancia|pieza|piezas|modelo|modelos|cat[aá]logo|catalogo|stock|existencia|existencias|inventario|disponible|disponibilidad|comprar|precio)\b/i.test(message);
}

function isLikelyServiceQuestion(message) {
  return /\b(servicio|servicios|cita|agenda|agendar|reservar|cotizar|cotizaci[oó]n|instalaci[oó]n|instalacion|mantenimiento|reparaci[oó]n|reparacion|consulta|asesor[ií]a|asesoria|atenci[oó]n|atencion|dise[nñ]o|limpieza|soporte|diagn[oó]stico|diagnostico)\b/i.test(message);
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
      herramienta_mcp: 'registrar_intencion_compra'
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
      respuesta_sugerida: '¿Buscas un producto específico o quieres información de algún servicio?'
    }
  };
}

export const mixedBusinessStrategy = {
  type: 'MIXTO',

  prepareIntent(intent, { conversationContext = null, normalizedMessage = '' } = {}) {
    const contextType = lastContextType(conversationContext);
    const productLike = isLikelyProductQuestion(normalizedMessage);
    const serviceLike = isLikelyServiceQuestion(normalizedMessage);

    if (isPurchaseQuestion(normalizedMessage) || intent.intencion === 'INTENCION_COMPRA') {
      return buildInterestIntent(intent, normalizedMessage, conversationContext);
    }

    if (isShortContextQuestion(normalizedMessage) && (isPriceQuestion(normalizedMessage) || intent.intencion === 'CONSULTAR_STOCK')) {
      if (contextType === 'service') {
        return buildServiceDetailIntent(intent, conversationContext);
      }

      if (contextType === 'product') {
        return buildProductDetailIntent(intent, conversationContext);
      }
    }

    if (serviceLike && !productLike) {
      return asServiceSearchIntent(intent);
    }

    if (productLike && !serviceLike) {
      return asProductSearchIntent(intent);
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
