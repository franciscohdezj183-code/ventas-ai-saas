import { env } from '../../config/env.js';
import { interpretIntent } from '../../ai/intentInterpreter.js';
import { orchestrateIncomingMessage } from '../../bot/messageOrchestrator.js';
import { query } from '../../config/database.js';

function normalizePhone(value) {
  return String(value ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

async function saveConversationWithoutReply({ empresaId, phone, message }) {
  const [result] = await query(
    `INSERT INTO conversaciones (empresa_id, telefono_cliente, mensaje, respuesta, fecha)
     VALUES (?, ?, ?, NULL, NOW())`,
    [empresaId, phone, message]
  );

  return result.insertId;
}

export function getAIStatus() {
  return {
    configured: Boolean(env.openai.apiKey),
    model: env.openai.model,
    auto_reply: env.openai.autoReply,
    mode: 'intent_interpreter_mcp_orchestrator'
  };
}

export async function generateCompanyReply({ empresaId, phone, message }) {
  return orchestrateIncomingMessage({
    empresaId,
    phone,
    message
  });
}

export async function interpretCustomerIntent({ empresaId, message, contexto }) {
  return interpretIntent({
    empresa_id: empresaId,
    mensaje_cliente: message,
    contexto
  });
}

export async function processIncomingCustomerMessage({ empresaId, phone, message }) {
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
    message
  });
}

