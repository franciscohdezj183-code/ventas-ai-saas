import { validateIntentJson } from '../../ai/intentInterpreter.js';
import { orchestrateIncomingMessage } from '../../bot/messageOrchestrator.js';
import { mcpClient } from '../../mcp/mcpClient.js';
import { getBotResponseProfile } from './bot-prompts.service.js';

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function previewIntentForMessage(message) {
  const text = normalize(message);

  if (!text || /\b(hola|buenos dias|buen dia|buenas tardes|buenas noches)\b/.test(text)) {
    return { intencion: 'SALUDO', herramienta_mcp: '', parametros: {}, confianza: 0.9 };
  }

  if (/\b(asesor|humano|persona|me interesa|comprar|lo quiero|la quiero|cotizar|cotizacion)\b/.test(text)) {
    return {
      intencion: text.includes('asesor') || text.includes('humano') || text.includes('persona') ? 'HABLAR_ASESOR' : 'INTENCION_COMPRA',
      herramienta_mcp: text.includes('asesor') || text.includes('humano') || text.includes('persona') ? 'crear_lead' : 'registrar_intencion_compra',
      parametros: { interes: message, texto: message },
      confianza: 0.86
    };
  }

  if (/\b(categorias|categoria|catalogo|que manejan|que ofrecen|servicios ofrecen)\b/.test(text)) {
    return { intencion: 'VER_CATEGORIAS', herramienta_mcp: 'obtener_categorias', parametros: {}, confianza: 0.85 };
  }

  if (/\b(horario|abren|cierran)\b/.test(text)) {
    return { intencion: 'CONSULTAR_HORARIO', herramienta_mcp: 'obtener_configuracion_empresa', parametros: {}, confianza: 0.84 };
  }

  if (/\b(ubicacion|direccion|donde estan)\b/.test(text)) {
    return { intencion: 'CONSULTAR_UBICACION', herramienta_mcp: 'obtener_configuracion_empresa', parametros: {}, confianza: 0.84 };
  }

  if (/\b(pago|pagos|tarjeta|transferencia|efectivo)\b/.test(text)) {
    return { intencion: 'CONSULTAR_METODOS_PAGO', herramienta_mcp: 'obtener_configuracion_empresa', parametros: {}, confianza: 0.84 };
  }

  if (/\b(envio|entrega|domicilio|mandan)\b/.test(text)) {
    return { intencion: 'CONSULTAR_ENVIOS', herramienta_mcp: 'obtener_configuracion_empresa', parametros: {}, confianza: 0.84 };
  }

  if (/\b(servicio|diseno|impresion|rotulacion|senaletica|textil|banner|promocional|instalacion)\b/.test(text)) {
    return { intencion: 'BUSCAR_SERVICIO', herramienta_mcp: 'buscar_servicios', parametros: { texto: message }, confianza: 0.82 };
  }

  return { intencion: 'BUSCAR_PRODUCTO', herramienta_mcp: 'buscar_productos', parametros: { texto: message }, confianza: 0.78 };
}

function createPreviewMcpClient() {
  return {
    listTools: () => mcpClient.listTools(),
    async callTool(toolName, args = {}, auth = null) {
      if (toolName === 'guardar_conversacion') {
        return { conversacion_id: 0, preview: true };
      }

      if (toolName === 'crear_lead' || toolName === 'registrar_intencion_compra') {
        return {
          lead_id: 0,
          telefono: args.telefono,
          interes: args.interes ?? args.texto,
          producto_id: args.producto_id ?? null,
          servicio_id: args.servicio_id ?? null,
          preview: true
        };
      }

      return mcpClient.callTool(toolName, args, auth);
    }
  };
}

export async function previewBotResponse(payload) {
  const empresaId = Number(payload.empresa_id);
  const message = String(payload.mensaje ?? '').trim() || 'Hola';
  const responseProfile = empresaId ? await getBotResponseProfile(empresaId) : null;
  const result = await orchestrateIncomingMessage({
    empresaId,
    phone: 'preview',
    message,
    whatsappChatId: 'preview@c.us',
    contexto: {
      response_profile: responseProfile
    },
    interpreter: async () => validateIntentJson(previewIntentForMessage(message)),
    mcpClient: createPreviewMcpClient(),
    handoffManager: {
      hasActive: async () => false,
      request: async () => ({ handoff_id: 0, estado: 'PREVIEW', duplicate: false })
    },
    contextStore: {
      find: async () => null,
      save: async () => null
    }
  });

  return {
    mensaje: message,
    tipo_prueba: result.herramienta_mcp || result.intencion || 'RESPUESTA',
    respuesta: result.respuesta,
    intencion: result.intencion,
    herramienta_mcp: result.herramienta_mcp,
    parametros: result.parametros,
    mcp_result: result.mcp_result
  };
}
