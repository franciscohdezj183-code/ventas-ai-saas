import { interpretIntent, validateIntentJson } from '../ai/intentInterpreter.js';
import {
  findConversationContext,
  saveConversationContext
} from './conversationContext.service.js';
import { notifyOwnerForLead, shouldNotifyOwner } from './notification.service.js';
import { mcpClient as defaultMcpClient } from '../mcp/mcpClient.js';

function normalizePhone(value) {
  return String(value ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

function buildProductResponse(result) {
  const products = result?.productos ?? [];
  const product = result?.producto;

  if (product) {
    const price = Number(product.precio).toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });
    const stock = Number(product.stock) > 0 ? `Tenemos ${product.stock} disponible(s).` : 'Por ahora aparece sin stock disponible.';

    return `${product.nombre} cuesta ${price}. ${stock}`;
  }

  if (products.length === 0) {
    return 'No encontre productos disponibles con esos criterios. Puedo ayudarte a buscar otra opcion o pasarte con un asesor.';
  }

  const lines = products.map((product) => {
    const price = Number(product.precio).toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });
    const stock = Number(product.stock) > 0 ? `stock: ${product.stock}` : 'sin stock disponible';
    return `- ${product.nombre} (${product.categoria ?? 'sin categoria'}): ${price}, ${stock}`;
  });

  return ['Encontre estas opciones para ti:', ...lines].join('\n');
}

function buildServiceResponse(result) {
  const services = result?.servicios ?? [];
  const service = result?.servicio;

  if (service) {
    const price = Number(service.precio).toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });
    const duration = service.duracion ? ` Dura aproximadamente ${service.duracion} min.` : '';

    return `${service.nombre} cuesta ${price}.${duration}`;
  }

  if (services.length === 0) {
    return 'No encontre servicios con esos criterios. Puedo ayudarte a revisar otra opcion o pasarte con un asesor.';
  }

  const lines = services.map((service) => {
    const price = Number(service.precio).toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });
    const duration = service.duracion ? `, duracion ${service.duracion} min` : '';
    return `- ${service.nombre}: ${price}${duration}`;
  });

  return ['Estos servicios pueden interesarte:', ...lines].join('\n');
}

function buildCategoriesResponse(result) {
  const categories = result?.categorias ?? [];

  if (categories.length === 0) {
    return 'Todavia no hay categorias configuradas para esta empresa.';
  }

  return `Tenemos estas categorias: ${categories.map((category) => category.nombre).join(', ')}.`;
}

function buildCompanyInfoResponse(intent, result) {
  const company = result?.empresa;

  if (!company) {
    return 'No pude consultar la informacion de la empresa en este momento.';
  }

  if (intent.intencion === 'CONSULTAR_UBICACION') {
    return company.direccion
      ? `Nuestra ubicacion es: ${company.direccion}.`
      : 'Todavia no tenemos una ubicacion configurada. Te puedo pasar con un asesor.';
  }

  if (intent.intencion === 'CONSULTAR_HORARIO') {
    return company.horario_atencion
      ? `Nuestro horario de atencion es: ${company.horario_atencion}.`
      : 'Todavia no hay horario configurado. Te puedo pasar con un asesor para confirmar disponibilidad.';
  }

  if (intent.intencion === 'CONSULTAR_METODOS_PAGO') {
    return company.politica_pagos
      ? `Metodos y politica de pago: ${company.politica_pagos}.`
      : 'Todavia no hay metodos de pago configurados. Te puedo pasar con un asesor.';
  }

  if (intent.intencion === 'CONSULTAR_ENVIOS') {
    return company.politica_entrega
      ? `Politica de entregas y envios: ${company.politica_entrega}.`
      : 'Todavia no hay politica de envios configurada. Te puedo pasar con un asesor.';
  }

  return `Estas hablando con ${company.nombre_bot ?? company.nombre}. Te puedo ayudar con productos, servicios o pasarte con un asesor.`;
}

function buildLeadResponse(intent, result) {
  if (intent.intencion === 'HABLAR_ASESOR') {
    return 'Perfecto, ya registre tu solicitud. Un asesor te contactara para darte seguimiento.';
  }

  if (intent.intencion === 'AGENDAR_CITA') {
    return 'Listo, registre tu interes para agendar una cita. Un asesor te contactara para confirmar horario.';
  }

  return 'Perfecto, registre tu interes. Un asesor te contactara para ayudarte con la compra.';
}

function buildStaticResponse(intent) {
  const responses = {
    SALUDO: 'Hola, gracias por escribirnos. Puedo ayudarte con productos, servicios, precios o disponibilidad.',
    DESPEDIDA: 'Gracias por escribirnos. Que tengas excelente dia.',
    AGRADECIMIENTO: 'Con gusto. Estoy para ayudarte.',
    AYUDA: 'Puedo ayudarte a buscar productos, revisar servicios, consultar precios, disponibilidad o contactar a un asesor.',
    FUERA_DE_TEMA: 'Puedo ayudarte con informacion de productos, servicios y atencion comercial de esta empresa.',
    MENSAJE_GENERAL: 'Gracias por escribirnos. Puedes contarme que producto o servicio estas buscando.'
  };

  return responses[intent.intencion] ?? responses.MENSAJE_GENERAL;
}

function buildResponse(intent, toolResult) {
  switch (intent.herramienta_mcp) {
    case 'buscar_productos':
    case 'obtener_producto':
      return buildProductResponse(toolResult);
    case 'buscar_servicios':
    case 'obtener_servicio':
      return buildServiceResponse(toolResult);
    case 'obtener_categorias':
      return buildCategoriesResponse(toolResult);
    case 'obtener_promociones':
      return toolResult?.mensaje ?? 'No hay promociones configuradas en este momento.';
    case 'obtener_configuracion_empresa':
      return buildCompanyInfoResponse(intent, toolResult);
    case 'crear_lead':
    case 'registrar_intencion_compra':
      return buildLeadResponse(intent, toolResult);
    default:
      return buildStaticResponse(intent);
  }
}

function buildToolArgs(toolName, { empresaId, phone, message, intent, conversationContext }) {
  const params = intent.parametros ?? {};

  switch (toolName) {
    case 'buscar_productos':
      return {
        empresa_id: empresaId,
        texto: params.texto ?? message,
        categoria: params.categoria,
        color: params.color,
        tamano: params.tamano,
        presupuesto: params.presupuesto,
        precio_min: params.precio_min,
        precio_max: params.precio_max,
        stock_requerido: params.stock_requerido
      };
    case 'obtener_producto':
      return {
        empresa_id: empresaId,
        producto_id: params.producto_id ?? params.id ?? conversationContext?.ultimo_producto_id
      };
    case 'buscar_servicios':
      return {
        empresa_id: empresaId,
        texto: params.texto ?? message
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

function isPriceFollowUp(message) {
  return /\b(cu[aá]nto cuesta|cuanto cuesta|precio|costo|vale|cu[aá]nto vale)\b/i.test(message);
}

function isPurchaseFollowUp(message) {
  return /\b(me interesa|lo quiero|la quiero|quiero comprar|comprar|ap[aá]rtalo|apartalo|me lo llevo)\b/i.test(message);
}

function applyConversationContext(intent, message, conversationContext) {
  const nextIntent = {
    ...intent,
    parametros: { ...(intent.parametros ?? {}) }
  };

  if (!conversationContext) {
    return nextIntent;
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

function extractContextPatch({ intent, toolResult, message }) {
  const products = toolResult?.productos ?? [];
  const services = toolResult?.servicios ?? [];
  const product = toolResult?.producto ?? products[0] ?? null;
  const service = toolResult?.servicio ?? services[0] ?? null;
  const leadProductId = toolResult?.producto_id ?? intent.parametros?.producto_id ?? null;
  const leadServiceId = toolResult?.servicio_id ?? intent.parametros?.servicio_id ?? null;

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
        ? {
            id: product.id,
            nombre: product.nombre,
            precio: product.precio
          }
        : null,
      servicio: service
        ? {
            id: service.id,
            nombre: service.nombre,
            precio: service.precio
          }
        : null
    }
  };
}

async function getMinimalCompanyContext(empresaId, mcpClient) {
  try {
    const result = await mcpClient.callTool('obtener_configuracion_empresa', { empresa_id: empresaId });
    const company = result.empresa;

    return {
      nombre: company?.nombre,
      tipo_negocio: company?.tipo_negocio,
      nombre_bot: company?.nombre_bot,
      tono_respuesta: company?.tono_respuesta,
      horario_atencion: company?.horario_atencion,
      politica_entrega: company?.politica_entrega,
      politica_pagos: company?.politica_pagos
    };
  } catch {
    return {};
  }
}

export async function orchestrateIncomingMessage({
  empresaId,
  phone,
  message,
  contexto = null,
  interpreter = interpretIntent,
  mcpClient = defaultMcpClient,
  contextStore = {
    find: findConversationContext,
    save: saveConversationContext
  }
}) {
  const cleanPhone = normalizePhone(phone);
  const conversationContext = await contextStore.find({ empresaId, phone: cleanPhone });
  const contextoEmpresa = contexto ?? (await getMinimalCompanyContext(empresaId, mcpClient));
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
    mensaje_cliente: message,
    contexto: contextoCompleto
  });
  const intent = applyConversationContext(validateIntentJson(interpretedIntent), message, conversationContext);
  let toolResult = null;
  let notificationResult = null;

  if (intent.herramienta_mcp) {
    toolResult = await mcpClient.callTool(
      intent.herramienta_mcp,
      buildToolArgs(intent.herramienta_mcp, {
        empresaId,
        phone: cleanPhone,
        message,
        intent,
        conversationContext
      })
    );
  }

  if (shouldNotifyOwner(intent.intencion) && toolResult?.lead_id) {
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

  const response = buildResponse(intent, toolResult);
  const savedConversation = await mcpClient.callTool('guardar_conversacion', {
    empresa_id: empresaId,
    telefono: cleanPhone,
    mensaje: message,
    respuesta: response
  });
  await contextStore.save({
    empresaId,
    phone: cleanPhone,
    ...extractContextPatch({ intent, toolResult, message })
  });

  return {
    respuesta: response,
    intencion: intent.intencion,
    herramienta_mcp: intent.herramienta_mcp,
    parametros: intent.parametros,
    confianza: intent.confianza,
    requiere_respuesta_ia: intent.requiere_respuesta_ia,
    mcp_result: toolResult,
    notificacion: notificationResult,
    lead_id: toolResult?.lead_id ?? null,
    conversacion_id: savedConversation.conversacion_id
  };
}

