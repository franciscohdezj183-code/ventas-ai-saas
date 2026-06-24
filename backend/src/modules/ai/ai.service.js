import { env } from '../../config/env.js';
import { interpretIntentDetailed } from '../../ai/intentInterpreter.js';
import { buildSafeConversationContext } from '../../ai/conversation-context.builder.js';
import { orchestrateIncomingMessage } from '../../bot/messageOrchestrator.js';
import { mcpClient } from '../../mcp/mcpClient.js';
import { createAuditLog } from '../audit/audit.service.js';
import { isPlanLimitAvailable } from '../plans/plan-limits.service.js';
import { registerAIUsage } from '../ai-usage/ai-usage.service.js';
import { normalizeMexicanPhoneNumber } from '../../whatsapp/whatsapp-number.helper.js';
import { logger } from '../../utils/logger.js';
import {
  classifyOpenAIError,
  getOpenAIHealthSnapshot
} from '../../ai/openai-health.service.js';

function normalizePhone(value) {
  return normalizeMexicanPhoneNumber(value);
}

function fallbackMessageText(message, incomingMedia = null) {
  const cleanMessage = String(message ?? '').trim();

  if (cleanMessage) {
    return cleanMessage;
  }

  if (incomingMedia?.hasMedia) {
    const type = String(incomingMedia.type ?? 'archivo').trim() || 'archivo';
    return `[${type} recibido]`;
  }

  return '[mensaje recibido sin texto]';
}

async function saveConversationWithoutReply({
  empresaId,
  phone,
  message,
  whatsappChatId = null,
  whatsappMessageId = null,
  contactName = null,
  incomingMedia = null
}) {
  const result = await mcpClient.callTool('guardar_conversacion', {
    empresa_id: empresaId,
    telefono: phone,
    whatsapp_id: whatsappChatId,
    whatsapp_message_id: whatsappMessageId,
    contact_name: contactName,
    mensaje: fallbackMessageText(message, incomingMedia),
    estado: 'open',
    tipo_mensaje: 'customer'
  });

  return result.conversacion_id;
}

export function getAIStatus() {
  const health = getOpenAIHealthSnapshot();

  return {
    ...health,
    model: env.openai.model,
    auto_reply: env.openai.autoReply,
    mode: 'intent_interpreter_mcp_orchestrator'
  };
}

export async function generateCompanyReply({
  empresaId,
  userId = null,
  phone,
  message,
  whatsappChatId = null,
  whatsappMessageId = null,
  contactName = null,
  incomingMedia = null
}) {
  try {
    const aiLimit = await isPlanLimitAvailable(empresaId, 'aiMessagesMonthly');

    if (!aiLimit.allowed) {
      return {
        respuesta: aiLimit.message,
        intencion: 'PLAN_LIMIT_REACHED',
        herramienta_mcp: null,
        lead_id: null,
        conversacion_id: null
      };
    }

    return await orchestrateIncomingMessage({
      empresaId,
      userId,
      phone,
      message,
      whatsappChatId,
      whatsappMessageId,
      contactName,
      incomingMedia
    });
  } catch (error) {
    const classified = classifyOpenAIError(error);
    await createAuditLog({
      empresaId,
      accion: 'ERROR',
      modulo: 'ai',
      descripcion: `Error IA generando respuesta: ${classified.status}`
    });
    throw error;
  }
}

export async function interpretCustomerIntent({ empresaId, userId = null, message, contexto }) {
  try {
    const aiLimit = await isPlanLimitAvailable(empresaId, 'aiMessagesMonthly');

    if (!aiLimit.allowed) {
      return {
        intencion: 'PLAN_LIMIT_REACHED',
        confianza: 1,
        requiere_respuesta_ia: false,
        herramienta_mcp: null,
        parametros: {},
        message: aiLimit.message
      };
    }

    let usageSnapshot = null;
    const safeContext = buildSafeConversationContext({
      message,
      companyContext: contexto?.empresa ?? contexto ?? {},
      conversationContext: contexto?.conversacion_contexto ?? null,
      recentMessages: contexto?.ultimos_mensajes_relevantes ?? [],
      handoff: contexto?.handoff ?? null
    });
    const diagnostics = await interpretIntentDetailed({
      empresa_id: empresaId,
      mensaje_cliente: message,
      contexto: safeContext,
      onUsage: (usage) => {
        usageSnapshot = usage;
      }
    });

    if (usageSnapshot) {
      await registerAIUsage({
        tenantId: empresaId,
        userId,
        tokensInput: usageSnapshot.tokens_input,
        tokensOutput: usageSnapshot.tokens_output,
        totalTokens: usageSnapshot.total_tokens,
        modelUsed: usageSnapshot.modelo_usado
      });
    }

    return diagnostics;
  } catch (error) {
    const classified = classifyOpenAIError(error);
    await createAuditLog({
      empresaId,
      accion: 'ERROR',
      modulo: 'ai',
      descripcion: `Error IA interpretando intencion: ${classified.status}`
    });
    throw error;
  }
}

export async function processIncomingCustomerMessage({
  empresaId,
  userId = null,
  phone,
  message,
  whatsappChatId = null,
  whatsappMessageId = null,
  contactName = null,
  incomingMedia = null
}) {
  const cleanPhone = normalizePhone(phone);

  if (!env.openai.autoReply) {
    const conversationId = await saveConversationWithoutReply({
      empresaId,
      phone: cleanPhone,
      message,
      whatsappChatId,
      whatsappMessageId,
      contactName,
      incomingMedia
    });

    return {
      respuesta: null,
      intencion: null,
      herramienta_mcp: null,
      lead_id: null,
      conversacion_id: conversationId
    };
  }

  const aiLimit = await isPlanLimitAvailable(empresaId, 'aiMessagesMonthly');

  if (!aiLimit.allowed) {
    const conversationId = await saveConversationWithoutReply({
      empresaId,
      phone: cleanPhone,
      message,
      whatsappChatId,
      whatsappMessageId,
      contactName,
      incomingMedia
    });

    return {
      respuesta: aiLimit.message,
      intencion: 'PLAN_LIMIT_REACHED',
      herramienta_mcp: null,
      lead_id: null,
      conversacion_id: conversationId
    };
  }

  try {
    return await generateCompanyReply({
      empresaId,
      userId,
      phone: cleanPhone,
      message,
      whatsappChatId,
      whatsappMessageId,
      contactName,
      incomingMedia
    });
  } catch (error) {
    const openaiError = classifyOpenAIError(error);
    logger.error('whatsapp_ai_fallback', {
      empresaId,
      telefonoCliente: cleanPhone,
      whatsappChatId,
      openaiStatus: openaiError.status,
      httpStatus: openaiError.httpStatus,
      retryable: openaiError.retryable,
      error: {
        name: error?.name,
        message: openaiError.message,
        code: error?.code,
        status: error?.status
      }
    });

    const conversationId = await saveConversationWithoutReply({
      empresaId,
      phone: cleanPhone,
      message,
      whatsappChatId,
      whatsappMessageId,
      contactName,
      incomingMedia
    });

    logger.info('[WA][MESSAGE_SAVED] messageId', {
      empresaId,
      messageId: conversationId,
      telefonoCliente: cleanPhone,
      reason: 'ai_or_bot_error_fallback'
    });

    return {
      respuesta: null,
      intencion: 'AI_ERROR_FALLBACK',
      error_tipo: 'AI_ERROR_FALLBACK',
      herramienta_mcp: null,
      lead_id: null,
      conversacion_id: conversationId
    };
  }
}

