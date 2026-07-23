import { env } from '../../config/env.js';
import { interpretIntentDetailed } from '../../ai/intentInterpreter.js';
import { buildSafeConversationContext } from '../../ai/conversation-context.builder.js';
import { orchestrateIncomingMessage } from '../../bot/messageOrchestrator.js';
import { runConversationEngine } from '../../conversation-engine/conversation-engine.service.js';
import { executeAdvisorNotification } from '../../conversation-engine/advisor-notification.js';
import { runNcieShadowComparison } from '../../conversation-engine/shadow-evaluation.service.js';
import {
  assessNcieRisk,
  ENGINE_VERSIONS,
  getTenantEngineConfig,
  maybeRollbackTenantEngine,
  recordNcieEngineEvent,
  selectTenantEngine
} from '../../conversation-engine/tenant-engine.service.js';
import { mcpClient } from '../../mcp/mcpClient.js';
import { createAuditLog } from '../audit/audit.service.js';
import { isPlanLimitAvailable } from '../plans/plan-limits.service.js';
import { registerAIUsage } from '../ai-usage/ai-usage.service.js';
import { normalizeMexicanPhoneNumber } from '../../whatsapp/whatsapp-number.helper.js';
import { logger } from '../../utils/logger.js';
import { classifyAppError } from '../../utils/error-classifier.js';
import { requestHandoff } from '../../bot/humanHandoffManager.js';
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

function scheduleNcieEngineEvent(event) {
  setImmediate(() => {
    recordNcieEngineEvent(event).catch((error) => {
      logger.error('ncie_shadow_completed', {
        empresaId: event.empresa_id,
        status: 'failed',
        error: {
          name: error?.name,
          message: error?.message
        }
      });
    });
  });
}

function scheduleNcieShadowComparison(payload, selection) {
  setImmediate(() => {
    runNcieShadowComparison(payload)
      .then((evaluation) => {
        if (!evaluation) return;
        return recordNcieEngineEvent({
          empresa_id: payload.empresaId,
          conversacion_id: payload.legacyResult?.conversacion_id ?? null,
          engine_config: selection.config.conversation_engine_version,
          engine_selected: ENGINE_VERSIONS.SHADOW,
          engine_responded: ENGINE_VERSIONS.LEGACY,
          canary_selected: false,
          fallback_to_legacy: false,
          confidence_ncie: evaluation.confidence_ncie,
          retrieval_score: evaluation.retrieval_score,
          ncie_hizo_pregunta: evaluation.ncie_hizo_pregunta,
          handoff_confusion: false,
          falso_negativo_sospechoso: evaluation.posible_riesgo,
          error_ncie: false,
          tiempo_ncie_ms: evaluation.tiempo_ncie_ms
        });
      })
      .catch((error) => {
        logger.error('ncie_shadow_completed', {
          empresaId: payload.empresaId,
          status: 'failed',
          error: {
            name: error?.name,
            message: error?.message
          }
        });
      });
  });
}

async function persistNcieEngineEventAndRollback({ event, empresaId, config, latestRisk = null }) {
  try {
    await recordNcieEngineEvent(event);

    if (latestRisk) {
      await maybeRollbackTenantEngine({ empresaId, config, latestRisk });
    }
  } catch (error) {
    logger.error('ncie_metrics_persist_error', {
      empresaId,
      error: {
        name: error?.name,
        message: error?.message
      }
    });
  }
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

    const tenantConfig = await getTenantEngineConfig(empresaId);
    const selection = selectTenantEngine({
      config: tenantConfig,
      conversationKey: whatsappChatId ?? phone
    });
    logger.info('ncie_engine_selected', {
      empresaId,
      configuredEngine: selection.config.conversation_engine_version,
      selectedEngine: selection.engine,
      responseEngine: selection.responseEngine,
      configSource: selection.config.config_source
    });

    if (selection.config.conversation_engine_version === ENGINE_VERSIONS.NCIE) {
      logger.info(selection.canarySelected ? 'ncie_canary_selected' : 'ncie_canary_skipped', {
        empresaId,
        canaryPercentage: selection.config.ncie_canary_percentage,
        selectedEngine: selection.engine
      });
    }

    if (selection.responseEngine === ENGINE_VERSIONS.NCIE) {
      const startedAt = Date.now();

      try {
        const ncieResult = await runConversationEngine({
          empresaId,
          userId,
          phone,
          message,
          whatsappChatId,
          whatsappMessageId,
          contactName,
          incomingMedia
        });
        if (ncieResult?.ncie?.advisorNotificationRequired) {
          try {
            const notificationResult = await executeAdvisorNotification({
              empresaId,
              phone: normalizePhone(phone),
              whatsappChatId,
              conversationId: ncieResult.conversacion_id ?? null,
              response: ncieResult.respuesta,
              advisorNotification: ncieResult.ncie.advisorNotification,
              handoffManager: { request: requestHandoff }
            });
            ncieResult.notificacion = notificationResult;
            logger.info('ncie_advisor_notification_sent', {
              empresaId,
              conversationId: ncieResult.conversacion_id ?? null,
              reason: ncieResult.ncie.notificationReason
            });
            if (ncieResult.ncie.notificationReason === 'handoff_explicit') {
              logger.info('ncie_handoff_enabled', {
                empresaId,
                conversationId: ncieResult.conversacion_id ?? null
              });
            }
          } catch (error) {
            ncieResult.notificacion = {
              estado: 'ERROR',
              error: error?.message ?? 'advisor_notification_failed'
            };
            logger.error('ncie_handoff_failed', {
              empresaId,
              conversationId: ncieResult.conversacion_id ?? null,
              reason: ncieResult.ncie.notificationReason,
              error: {
                name: error?.name,
                message: error?.message
              }
            });
          }
        }
        const risk = assessNcieRisk({ config: selection.config, ncieResult });

        await persistNcieEngineEventAndRollback({
          empresaId,
          config: selection.config,
          latestRisk: risk,
          event: {
            empresa_id: empresaId,
            conversacion_id: ncieResult.conversacion_id ?? null,
            engine_config: selection.config.conversation_engine_version,
            engine_selected: ENGINE_VERSIONS.NCIE,
            engine_responded: ENGINE_VERSIONS.NCIE,
            canary_selected: selection.canarySelected,
            fallback_to_legacy: false,
            confidence_ncie: risk.confidence,
            retrieval_score: risk.retrievalScore,
            ncie_hizo_pregunta: risk.ncieHizoPregunta,
            handoff_confusion: risk.handoffConfusion,
            falso_negativo_sospechoso: risk.falseNegativeRisk || risk.risky,
            error_ncie: false,
            tiempo_ncie_ms: Date.now() - startedAt
          }
        });

        return ncieResult;
      } catch (error) {
        const risk = assessNcieRisk({ config: selection.config, error });
        logger.error('ncie_error', {
          empresaId,
          error: {
            name: error?.name,
            message: error?.message
          }
        });
        logger.error('ncie_fallback_to_legacy', {
          empresaId,
          error: {
            name: error?.name,
            message: error?.message
          }
        });
        await persistNcieEngineEventAndRollback({
          empresaId,
          config: selection.config,
          latestRisk: risk,
          event: {
            empresa_id: empresaId,
            conversacion_id: null,
            engine_config: selection.config.conversation_engine_version,
            engine_selected: ENGINE_VERSIONS.NCIE,
            engine_responded: ENGINE_VERSIONS.LEGACY,
            canary_selected: selection.canarySelected,
            fallback_to_legacy: true,
            confidence_ncie: risk.confidence,
            retrieval_score: risk.retrievalScore,
            ncie_hizo_pregunta: false,
            handoff_confusion: true,
            falso_negativo_sospechoso: true,
            error_ncie: true,
            error_message: risk.errorMessage,
            tiempo_ncie_ms: Date.now() - startedAt
          }
        });
      }
    }

    const legacyResult = await orchestrateIncomingMessage({
      empresaId,
      userId,
      phone,
      message,
      whatsappChatId,
      whatsappMessageId,
      contactName,
      incomingMedia
    });

    if (selection.engine === ENGINE_VERSIONS.SHADOW) {
      scheduleNcieShadowComparison({
        empresaId,
        phone,
        message,
        whatsappChatId,
        whatsappMessageId,
        contactName,
        incomingMedia,
        legacyResult
      }, selection);
    } else {
      scheduleNcieEngineEvent({
        empresa_id: empresaId,
        conversacion_id: legacyResult?.conversacion_id ?? null,
        engine_config: selection.config.conversation_engine_version,
        engine_selected: ENGINE_VERSIONS.LEGACY,
        engine_responded: ENGINE_VERSIONS.LEGACY,
        canary_selected: false,
        fallback_to_legacy: false,
        handoff_confusion: false,
        error_ncie: false
      });
    }

    return legacyResult;
  } catch (error) {
    const classified = classifyAppError(error);
    await createAuditLog({
      empresaId,
      accion: 'ERROR',
      modulo: 'ai',
      descripcion: `Error generando respuesta automatica (${classified.category}): ${classified.status}`
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
    const classified = classifyAppError(error);
    await createAuditLog({
      empresaId,
      accion: 'ERROR',
      modulo: 'ai',
      descripcion: `Error interpretando intencion (${classified.category}): ${classified.status}`
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
    const appError = classifyAppError(error);
    const openaiError = classifyOpenAIError(error);
    logger.error('whatsapp_ai_fallback', {
      empresaId,
      telefonoCliente: cleanPhone,
      whatsappChatId,
      errorCategory: appError.category,
      botErrorStatus: appError.status,
      openaiStatus: appError.category === 'openai' ? openaiError.status : null,
      httpStatus: appError.category === 'openai' ? openaiError.httpStatus : null,
      openaiErrorCode: appError.category === 'openai' ? openaiError.errorCode : null,
      openaiErrorType: appError.category === 'openai' ? openaiError.errorType : null,
      openaiErrorName: appError.category === 'openai' ? openaiError.errorName : null,
      openaiModel: appError.category === 'openai' ? env.openai.model : null,
      retryable: appError.retryable,
      mysqlError: appError.mysql ?? null,
      error: {
        name: error?.name,
        message: appError.safeMessage,
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

    logger.info('[WA][CONVERSATION_SAVED] fallback', {
      empresaId,
      conversationId,
      telefonoCliente: cleanPhone,
      reason: 'ai_or_bot_error_fallback'
    });

    return {
      respuesta: appError.category === 'mysql' ? appError.safeMessage : null,
      intencion: appError.category === 'mysql' ? 'MYSQL_ERROR_FALLBACK' : 'AI_ERROR_FALLBACK',
      error_tipo: appError.status,
      herramienta_mcp: null,
      lead_id: null,
      conversacion_id: conversationId
    };
  }
}

