import { logger } from '../utils/logger.js';
import { sanitizeRawInterpretation } from './intent-validation.service.js';

export function buildIntentDiagnostics({
  rawInterpretation,
  validatedInterpretation,
  finalInterpretation,
  ignoredFields = [],
  fallbackReason = null,
  model,
  latencyMs,
  usage = {},
  contextUsed = {}
}) {
  return {
    raw_interpretation: sanitizeRawInterpretation(rawInterpretation),
    validated_interpretation: validatedInterpretation,
    final_interpretation: finalInterpretation,
    ignored_fields: ignoredFields,
    fallback_reason: fallbackReason,
    model,
    latency_ms: latencyMs,
    usage,
    context_used: {
      business_type: contextUsed.tipo_negocio ?? null,
      has_recent_messages: Boolean(contextUsed.ultimos_mensajes_relevantes?.length),
      has_last_results: Boolean(contextUsed.ultimos_resultados_mostrados?.length),
      handoff_state: contextUsed.estado_handoff_humano ?? null
    }
  };
}

export function logIntentDiagnostics({ companyId, conversationId = null, diagnostics, errorCode = null }) {
  logger.info('ai_intent_diagnostics', {
    companyId,
    conversationId,
    model: diagnostics.model,
    latency_ms: diagnostics.latency_ms,
    usage: diagnostics.usage,
    intencion_original_openai: diagnostics.raw_interpretation?.intencion ?? null,
    intencion_final_validada: diagnostics.final_interpretation?.intencion ?? null,
    herramienta_original: diagnostics.raw_interpretation?.herramienta_mcp ?? null,
    herramienta_final: diagnostics.final_interpretation?.herramienta_mcp ?? null,
    confianza: diagnostics.final_interpretation?.confianza ?? 0,
    ignored_fields: diagnostics.ignored_fields,
    fallback_reason: diagnostics.fallback_reason,
    error_code: errorCode
  });
}
