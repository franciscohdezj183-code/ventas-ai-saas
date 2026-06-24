import { asServiceSearchIntent } from './shared-response-helpers.js';
import { extractMeasurement } from './service-pricing.helper.js';
import {
  isPriceQuestion,
  isServiceInterest,
  isShortAffirmation
} from './service-intent.helper.js';

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
  return /\b(producto|productos|articulo|mercancia|pieza|piezas|modelo|modelos|catalogo|stock|existencia|existencias|inventario|comprar)\b/i.test(message);
}

function isLikelyServiceQuestion(message) {
  return /\b(servicio|servicios|cita|agenda|agendar|reservar|cotizar|cotizacion|instalacion|mantenimiento|reparacion|consulta|asesoria|atencion|diseno|limpieza|soporte|diagnostico|lona|lonas|vinil|tarjeta|tarjetas|logotipo|logotipos|logo|logos|branding|identidad|visual|redes|sociales|flyer|flyers|publicidad|marketing|senaletica|textil|promocionales|banner|web)\b/i.test(message)
    || /\b(pagina|sitio)\s+web\b/i.test(message);
}

function hasExplicitServiceSubject(message) {
  return /\b(lona|lonas|vinil|tarjeta|tarjetas|logotipo|logotipos|logo|logos|branding|identidad|visual|redes|sociales|flyer|flyers|publicidad|marketing|senaletica|textil|promocionales|banner|coroplast|trovicel|dtf|serigrafia|web)\b/i.test(message)
    || /\b(pagina|sitio)\s+web\b/i.test(message);
}

function buildExplicitServiceSearchIntent(intent, message) {
  const {
    servicio_id: _serviceId,
    id: _id,
    ...params
  } = intent.parametros ?? {};

  return {
    ...intent,
    intencion: 'BUSCAR_SERVICIO',
    herramienta_mcp: 'buscar_servicios',
    parametros: {
      ...params,
      texto: message
    }
  };
}

function isAppointmentOrInterest(message) {
  return /\b(quiero agendar|quiero cita|agendar|agenda|cita|reservar|me interesa|quiero cotizar|cotizar|quiero contratar|contratar|quiero informacion)\b/i.test(message);
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

function getLastServiceContext(conversationContext) {
  return conversationContext?.datos_json?.servicio
    ?? conversationContext?.datos_json?.parametros?.service_context
    ?? conversationContext?.datos_json?.service_context
    ?? null;
}

function buildContextLeadIntent(intent, message, conversationContext) {
  const lastService = getLastServiceContext(conversationContext);
  const interest = lastService?.nombre
    ? `${lastService.nombre}: ${message}`
    : message;

  return buildServiceLeadIntent(
    withParams(intent, { interes: intent.parametros?.interes ?? interest }),
    message,
    conversationContext
  );
}

export const serviceBusinessStrategy = {
  type: 'SERVICIOS',

  prepareIntent(intent, { conversationContext = null, normalizedMessage = '' } = {}) {
    if (hasExplicitServiceSubject(normalizedMessage)) {
      return buildExplicitServiceSearchIntent(intent, normalizedMessage);
    }

    if (
      intent.herramienta_mcp === 'obtener_servicio'
      && Number(intent.parametros?.servicio_id) > 0
    ) {
      return intent;
    }

    if (hasLastService(conversationContext) && extractMeasurement(normalizedMessage)) {
      return buildServiceDetailIntent(intent, conversationContext);
    }

    if (
      hasLastService(conversationContext)
      && (isServiceInterest(normalizedMessage) || isShortAffirmation(normalizedMessage) || isAppointmentOrInterest(normalizedMessage) || intent.intencion === 'AGENDAR_CITA')
    ) {
      return buildContextLeadIntent(intent, normalizedMessage, conversationContext);
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

    if (
      isProductIntent(intent)
      || intent.intencion === 'BUSCAR_SERVICIO'
      || intent.herramienta_mcp === 'buscar_servicios'
      || isLikelyServiceQuestion(normalizedMessage)
      || isAppointmentOrInterest(normalizedMessage)
    ) {
      return asServiceSearchIntent(intent);
    }

    return intent;
  },

  async resolveAfterTool() {
    return null;
  }
};
