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

function isPurchaseQuestion(message) {
  return /\b(lo quiero|la quiero|me interesa|quiero comprar|comprar|ap[aá]rtamelo|apartamelo|ap[aá]rtalo|apartalo|me lo llevo|quiero ese|quiero informacion|quiero informaci[oó]n)\b/i.test(message);
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
      producto_id: conversationContext?.ultimo_producto_id ?? intent.parametros?.producto_id
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

    return intent;
  },

  async resolveAfterTool() {
    return null;
  }
};
