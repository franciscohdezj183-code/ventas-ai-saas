import { interpretIntent, validateIntentJson } from '../ai/intentInterpreter.js';
import { query } from '../config/database.js';
import { mcpClient as defaultMcpClient } from '../mcp/mcpClient.js';

function normalizePhone(value) {
  return String(value ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

async function saveConversation({ empresaId, phone, message, response }) {
  const [result] = await query(
    `INSERT INTO conversaciones (empresa_id, telefono_cliente, mensaje, respuesta, fecha)
     VALUES (?, ?, ?, ?, NOW())`,
    [empresaId, phone, message, response]
  );

  return result.insertId;
}

function buildProductResponse(result) {
  const products = result?.productos ?? [];

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
    return 'Todavia no hay horario configurado. Te puedo pasar con un asesor para confirmar disponibilidad.';
  }

  return `Estas hablando con ${company.nombre}. Te puedo ayudar con productos, servicios o pasarte con un asesor.`;
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
      return buildProductResponse(toolResult);
    case 'buscar_servicios':
      return buildServiceResponse(toolResult);
    case 'obtener_categorias':
      return buildCategoriesResponse(toolResult);
    case 'obtener_promociones':
      return toolResult?.mensaje ?? 'No hay promociones configuradas en este momento.';
    case 'obtener_configuracion_empresa':
      return buildCompanyInfoResponse(intent, toolResult);
    case 'crear_lead':
      return buildLeadResponse(intent, toolResult);
    default:
      return buildStaticResponse(intent);
  }
}

async function getMinimalCompanyContext(empresaId, mcpClient) {
  try {
    const result = await mcpClient.callTool('obtener_configuracion_empresa', { empresa_id: empresaId });
    const company = result.empresa;

    return {
      nombre: company?.nombre,
      tipo_negocio: company?.tipo_negocio
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
  mcpClient = defaultMcpClient
}) {
  const cleanPhone = normalizePhone(phone);
  const contextoEmpresa = contexto ?? (await getMinimalCompanyContext(empresaId, mcpClient));
  const interpretedIntent = await interpreter({
    empresa_id: empresaId,
    mensaje_cliente: message,
    contexto: contextoEmpresa
  });
  const intent = validateIntentJson(interpretedIntent);
  let toolResult = null;

  if (intent.herramienta_mcp) {
    toolResult = await mcpClient.callTool(intent.herramienta_mcp, {
      empresa_id: empresaId,
      telefono: cleanPhone,
      texto: message,
      interes: message,
      ...intent.parametros
    });
  }

  const response = buildResponse(intent, toolResult);
  const conversationId = await saveConversation({
    empresaId,
    phone: cleanPhone,
    message,
    response
  });

  return {
    respuesta: response,
    intencion: intent.intencion,
    herramienta_mcp: intent.herramienta_mcp,
    parametros: intent.parametros,
    confianza: intent.confianza,
    requiere_respuesta_ia: intent.requiere_respuesta_ia,
    mcp_result: toolResult,
    lead_id: toolResult?.lead_id ?? null,
    conversacion_id: conversationId
  };
}

