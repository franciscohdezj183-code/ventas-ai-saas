import { asProductSearchIntent } from './shared-response-helpers.js';

function hasLastProduct(conversationContext) {
  return Number(conversationContext?.ultimo_producto_id) > 0;
}

function isServiceIntent(intent) {
  return intent.herramienta_mcp === 'buscar_servicios'
    || intent.herramienta_mcp === 'obtener_servicio'
    || intent.intencion === 'BUSCAR_SERVICIO'
    || intent.intencion === 'AGENDAR_CITA'
    || Boolean(intent.parametros?.servicio_id && !intent.parametros?.producto_id);
}

function isPriceQuestion(message) {
  return /\b(precio|cu[aá]nto cuesta|cuanto cuesta|costo|vale|cu[aá]nto vale|cuanto vale)\b/i.test(message);
}

function isStockQuestion(message) {
  return /\b(stock|disponible|disponibilidad|existencia|existencias)\b/i.test(message);
}

function isCategoryQuestion(message) {
  return /\b(categor[ií]a|categoria|categor[ií]as|categorias|departamentos|secciones)\b/i.test(message);
}

function isPurchaseQuestion(message) {
  return /\b(lo quiero|la quiero|me interesa|quiero comprar|comprar|apartar|ap[aá]rtamelo|apartamelo|ap[aá]rtalo|apartalo|apartarlo|ap[aá]rtarlo|aparto|ap[aá]rto|como lo aparto|c[oó]mo lo aparto|separar|separamelo|me lo llevo|quiero ese|quiero informacion|quiero informaci[oó]n|hacer pedido|levantar pedido|finalizar compra|cerrar compra)\b/i.test(message);
}

function isAdvisorQuestion(message) {
  return /\b(asesor|humano|persona|vendedor|ejecutivo|atiendeme|ati[eé]ndeme)\b/i.test(message);
}

function isVagueProductRequest(message) {
  return /^(un producto|producto|productos|catalogo|catalogo de productos|opciones|info|informacion)$/i.test(String(message ?? '').trim());
}

function isLikelyProductSearch(message) {
  const cleanMessage = String(message ?? '').trim();
  const tokens = cleanMessage.split(/\s+/).filter(Boolean);

  return tokens.length > 0
    && tokens.length <= 6
    && /[a-z0-9]/i.test(cleanMessage)
    && !isVagueProductRequest(cleanMessage)
    && !isPriceQuestion(cleanMessage)
    && !isStockQuestion(cleanMessage)
    && !isPurchaseQuestion(cleanMessage);
}

function productSearchTextFromPurchase(message) {
  return String(message ?? '')
    .replace(/\b(lo quiero|la quiero|me interesa|quiero comprar|comprar|apartar|apartamelo|apartalo|apartarlo|aparto|como lo aparto|separar|separamelo|me lo llevo|quiero ese|quiero informacion|quiero información|hacer pedido|levantar pedido|finalizar compra|cerrar compra|quiero|una|un|el|la)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildProductClarificationIntent(intent) {
  return {
    ...intent,
    intencion: 'MENSAJE_GENERAL',
    herramienta_mcp: '',
    parametros: {
      ...(intent.parametros ?? {}),
      respuesta_sugerida: 'Claro. Dime el nombre, categoria o caracteristica del producto que buscas, por ejemplo: silla, mesa de madera o escritorio negro.'
    }
  };
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

function buildPurchaseIntent(intent, message, conversationContext) {
  const productId = conversationContext?.ultimo_producto_id ?? intent.parametros?.producto_id;
  const hasProduct = Number(productId) > 0;

  return withParams(
    {
      ...intent,
      intencion: 'INTENCION_COMPRA',
      herramienta_mcp: hasProduct ? 'crear_pedido' : 'registrar_intencion_compra'
    },
    {
      interes: intent.parametros?.interes
        ?? conversationContext?.ultimo_texto_busqueda
        ?? intent.parametros?.texto
        ?? message,
      producto_id: productId
    }
  );
}

function buildAdvisorIntent(intent, message) {
  return withParams(
    {
      ...intent,
      intencion: 'HABLAR_ASESOR',
      herramienta_mcp: 'crear_lead'
    },
    {
      interes: intent.parametros?.interes
        ?? intent.parametros?.texto
        ?? `Consulta sobre servicios en empresa enfocada en productos: ${message}`
    }
  );
}

export const productBusinessStrategy = {
  type: 'PRODUCTOS',

  prepareIntent(intent, { conversationContext = null, normalizedMessage = '' } = {}) {
    if (isServiceIntent(intent)) {
      return buildAdvisorIntent(intent, normalizedMessage);
    }

    if (intent.intencion === 'MENSAJE_GENERAL' && isVagueProductRequest(normalizedMessage)) {
      return buildProductClarificationIntent(intent);
    }

    if (isAdvisorQuestion(normalizedMessage) || intent.intencion === 'HABLAR_ASESOR') {
      return buildAdvisorIntent(intent, normalizedMessage);
    }

    if (isCategoryQuestion(normalizedMessage) || intent.intencion === 'VER_CATEGORIAS') {
      return {
        ...intent,
        intencion: 'VER_CATEGORIAS',
        herramienta_mcp: 'obtener_categorias',
        parametros: { ...(intent.parametros ?? {}) }
      };
    }

    if (
      (isPurchaseQuestion(normalizedMessage) || intent.intencion === 'INTENCION_COMPRA')
      && !hasLastProduct(conversationContext)
      && !intent.parametros?.producto_id
    ) {
      const searchText = productSearchTextFromPurchase(intent.parametros?.texto ?? normalizedMessage);

      if (isLikelyProductSearch(searchText)) {
        return asProductSearchIntent(withParams(intent, { texto: searchText }));
      }
    }

    if (isPurchaseQuestion(normalizedMessage) || intent.intencion === 'INTENCION_COMPRA') {
      return buildPurchaseIntent(intent, normalizedMessage, conversationContext);
    }

    if (
      hasLastProduct(conversationContext)
      && !intent.parametros?.producto_id
      && (intent.intencion === 'CONSULTAR_PRECIO' || intent.intencion === 'CONSULTAR_STOCK' || isPriceQuestion(normalizedMessage) || isStockQuestion(normalizedMessage))
    ) {
      return buildProductDetailIntent(intent, conversationContext);
    }

    if (intent.intencion === 'CONSULTAR_STOCK' || isStockQuestion(normalizedMessage)) {
      return withParams(asProductSearchIntent(intent), { stock_requerido: true });
    }

    if (intent.intencion === 'BUSCAR_PRODUCTO' || intent.herramienta_mcp === 'buscar_productos') {
      return asProductSearchIntent(intent);
    }

    if (intent.intencion === 'MENSAJE_GENERAL' && isLikelyProductSearch(normalizedMessage)) {
      return asProductSearchIntent(withParams(intent, { texto: normalizedMessage }));
    }

    return intent;
  },

  async resolveAfterTool() {
    return null;
  }
};
