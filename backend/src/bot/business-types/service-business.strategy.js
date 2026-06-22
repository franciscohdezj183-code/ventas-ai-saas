import { asServiceSearchIntent } from './shared-response-helpers.js';

function hasLastService(conversationContext) {
  return Number(conversationContext?.ultimo_servicio_id) > 0;
}

function isProductIntent(intent) {
  return intent.herramienta_mcp === 'buscar_productos'
    || intent.herramienta_mcp === 'obtener_producto'
    || intent.intencion === 'BUSCAR_PRODUCTO'
    || intent.intencion === 'CONSULTAR_STOCK'
    || Boolean(intent.parametros?.producto_id && !intent.parametros?.servicio_id);
}

function isLikelyProductQuestion(message) {
  return /\b(producto|productos|art[ií]culo|articulo|mercanc[ií]a|mercancia|pieza|piezas|modelo|modelos|cat[aá]logo|catalogo|stock|existencia|existencias|inventario|comprar)\b/i.test(message);
}

function isLikelyServiceQuestion(message) {
  return /\b(servicio|servicios|cita|agenda|agendar|reservar|cotizar|cotizaci[oó]n|instalaci[oó]n|instalacion|mantenimiento|reparaci[oó]n|reparacion|consulta|asesor[ií]a|asesoria|atenci[oó]n|atencion|dise[nñ]o|limpieza|soporte|diagn[oó]stico|diagnostico)\b/i.test(message);
}

function isPriceQuestion(message) {
  return /\b(precio|cu[aá]nto cuesta|cuanto cuesta|costo|vale|cu[aá]nto vale|cuanto vale|cotizar|cotizaci[oó]n|presupuesto)\b/i.test(message);
}

function isAppointmentOrInterest(message) {
  return /\b(quiero agendar|quiero cita|agendar|agenda|cita|reservar|me interesa|quiero cotizar|cotizar|quiero contratar|contratar|quiero informacion|quiero informaci[oó]n)\b/i.test(message);
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

function buildServiceLeadIntent(intent, message, conversationContext) {
  return withParams(
    {
      ...intent,
      intencion: 'AGENDAR_CITA',
      herramienta_mcp: 'crear_lead'
    },
    {
      interes: intent.parametros?.interes
        ?? conversationContext?.ultimo_texto_busqueda
        ?? intent.parametros?.texto
        ?? message,
      servicio_id: conversationContext?.ultimo_servicio_id ?? intent.parametros?.servicio_id
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
        ?? `Consulta sobre productos en empresa enfocada en servicios: ${message}`
    }
  );
}

export const serviceBusinessStrategy = {
  type: 'SERVICIOS',

  prepareIntent(intent, { conversationContext = null, normalizedMessage = '' } = {}) {
    if (isAppointmentOrInterest(normalizedMessage) || intent.intencion === 'AGENDAR_CITA') {
      return buildServiceLeadIntent(intent, normalizedMessage, conversationContext);
    }

    if (
      hasLastService(conversationContext)
      && !intent.parametros?.servicio_id
      && (intent.intencion === 'CONSULTAR_PRECIO' || isPriceQuestion(normalizedMessage))
    ) {
      return buildServiceDetailIntent(intent, conversationContext);
    }

    if (isProductIntent(intent) && isLikelyProductQuestion(normalizedMessage) && !isLikelyServiceQuestion(normalizedMessage)) {
      return buildAdvisorIntent(intent, normalizedMessage);
    }

    if (isProductIntent(intent) || intent.intencion === 'BUSCAR_SERVICIO' || intent.herramienta_mcp === 'buscar_servicios' || isLikelyServiceQuestion(normalizedMessage)) {
      return asServiceSearchIntent(intent);
    }

    return intent;
  },

  async resolveAfterTool() {
    return null;
  }
};
