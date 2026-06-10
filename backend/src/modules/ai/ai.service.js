import { env } from '../../config/env.js';
import { interpretIntent } from '../../ai/intentInterpreter.js';
import { orchestrateIncomingMessage } from '../../bot/messageOrchestrator.js';
import { mcpClient } from '../../mcp/mcpClient.js';
import { createAuditLog } from '../audit/audit.service.js';

function normalizePhone(value) {
  return String(value ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

async function saveConversationWithoutReply({ empresaId, phone, message }) {
  const result = await mcpClient.callTool('guardar_conversacion', {
    empresa_id: empresaId,
    telefono: phone,
    mensaje: message
  });

  return result.conversacion_id;
}

export function getAIStatus() {
  return {
    configured: Boolean(env.openai.apiKey),
    model: env.openai.model,
    auto_reply: env.openai.autoReply,
    mode: 'intent_interpreter_mcp_orchestrator'
  };
}

export async function generateCompanyReply({ empresaId, phone, message, whatsappChatId = null }) {
  try {
    return await orchestrateIncomingMessage({
      empresaId,
      phone,
      message,
      whatsappChatId
    });
  } catch (error) {
    await createAuditLog({
      empresaId,
      accion: 'ERROR',
      modulo: 'ai',
      descripcion: `Error IA generando respuesta: ${error.message}`
    });
    throw error;
  }
}

export async function interpretCustomerIntent({ empresaId, message, contexto }) {
  try {
    return await interpretIntent({
      empresa_id: empresaId,
      mensaje_cliente: message,
      contexto
    });
  } catch (error) {
    await createAuditLog({
      empresaId,
      accion: 'ERROR',
      modulo: 'ai',
      descripcion: `Error IA interpretando intencion: ${error.message}`
    });
    throw error;
  }
}

export async function processIncomingCustomerMessage({ empresaId, phone, message, whatsappChatId = null }) {
  const cleanPhone = normalizePhone(phone);

  if (!env.openai.apiKey || !env.openai.autoReply) {
    const conversationId = await saveConversationWithoutReply({
      empresaId,
      phone: cleanPhone,
      message
    });

    return {
      respuesta: null,
      intencion: null,
      herramienta_mcp: null,
      lead_id: null,
      conversacion_id: conversationId
    };
  }

  return generateCompanyReply({
    empresaId,
    phone: cleanPhone,
    message,
    whatsappChatId
  });
}

