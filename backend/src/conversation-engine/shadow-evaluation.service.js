import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { runConversationEngine } from './conversation-engine.service.js';
import { ensureNcieEngineEventsTable, getTenantEngineConfig } from './tenant-engine.service.js';

const NO_CONTAMOS_PATTERN = /\b(no contamos|no manejamos|no tenemos|no ofrecemos|no encontre|no encontramos|no hay|no pude encontrar)\b/i;
const LOW_CONFIDENCE_THRESHOLD = 0.55;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ncie_shadow_evaluations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  conversacion_id BIGINT UNSIGNED NULL,
  mensaje_cliente TEXT NOT NULL,
  respuesta_legacy TEXT NULL,
  respuesta_ncie TEXT NULL,
  intent_ncie VARCHAR(80) NULL,
  confidence_ncie DECIMAL(5,4) NULL,
  retrieval_score DECIMAL(10,4) NULL,
  decision_ncie VARCHAR(80) NULL,
  tiempo_ncie_ms INT UNSIGNED NULL,
  legacy_dijo_no_contamos TINYINT(1) NOT NULL DEFAULT 0,
  ncie_hizo_pregunta TINYINT(1) NOT NULL DEFAULT 0,
  ncie_encontro_opciones TINYINT(1) NOT NULL DEFAULT 0,
  posible_mejora TINYINT(1) NOT NULL DEFAULT 0,
  posible_riesgo TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ncie_shadow_empresa_created_index (empresa_id, created_at),
  KEY ncie_shadow_conversacion_index (conversacion_id),
  KEY ncie_shadow_intent_index (intent_ncie),
  KEY ncie_shadow_mejora_index (posible_mejora),
  KEY ncie_shadow_riesgo_index (posible_riesgo),
  CONSTRAINT ncie_shadow_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT ncie_shadow_conversacion_foreign
    FOREIGN KEY (conversacion_id) REFERENCES conversaciones (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

let ensureTablePromise = null;

function bool(value) {
  return value ? 1 : 0;
}

function hasNoContamos(text) {
  return NO_CONTAMOS_PATTERN.test(String(text ?? ''));
}

function maxRetrievalScore(retrieval) {
  const scores = [
    ...(retrieval?.services ?? []).map((item) => Number(item?.score ?? 0)),
    ...(retrieval?.products ?? []).map((item) => Number(item?.score ?? 0))
  ];

  return scores.length ? Math.max(...scores) : 0;
}

function normalizePercent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((Number(numerator ?? 0) / Number(denominator)) * 100).toFixed(2));
}

export async function ensureShadowEvaluationTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = query(CREATE_TABLE_SQL).catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }

  await ensureTablePromise;
}

export function buildShadowEvaluation({ empresaId, message, legacyResult, ncieResult, tiempoNcieMs }) {
  const ncie = ncieResult?.ncie ?? {};
  const retrieval = ncie.retrieval ?? ncieResult?.mcp_result ?? {};
  const decision = ncie.decision ?? {};
  const responseNcie = ncieResult?.respuesta ?? '';
  const legacyResponse = legacyResult?.respuesta ?? '';
  const retrievalScore = maxRetrievalScore(retrieval);
  const legacyDijoNoContamos = hasNoContamos(legacyResponse);
  const ncieDijoNoContamos = hasNoContamos(responseNcie);
  const ncieHizoPregunta = /[?¿]/.test(responseNcie);
  const ncieEncontroOpciones = (retrieval?.services?.length ?? 0) + (retrieval?.products?.length ?? 0) > 0;
  const confidence = Number(ncieResult?.confianza ?? ncie.nlu?.confidence ?? 0);
  const decisionAction = decision?.action ?? null;
  const posibleMejora = legacyDijoNoContamos && !ncieDijoNoContamos && (ncieHizoPregunta || ncieEncontroOpciones);
  const posibleRiesgo =
    decision?.falseNegativeRisk === true ||
    confidence < LOW_CONFIDENCE_THRESHOLD ||
    (!ncieEncontroOpciones && !ncieHizoPregunta && !ncieDijoNoContamos);

  return {
    empresa_id: empresaId,
    conversacion_id: legacyResult?.conversacion_id ?? null,
    mensaje_cliente: String(message ?? ''),
    respuesta_legacy: legacyResponse,
    respuesta_ncie: responseNcie,
    intent_ncie: ncieResult?.intencion ?? ncie.nlu?.intent ?? null,
    confidence_ncie: confidence,
    retrieval_score: retrievalScore,
    decision_ncie: decisionAction,
    tiempo_ncie_ms: tiempoNcieMs,
    legacy_dijo_no_contamos: legacyDijoNoContamos,
    ncie_hizo_pregunta: ncieHizoPregunta,
    ncie_encontro_opciones: ncieEncontroOpciones,
    posible_mejora: posibleMejora,
    posible_riesgo: posibleRiesgo
  };
}

export async function recordShadowEvaluation(evaluation) {
  await ensureShadowEvaluationTable();
  const [result] = await query(
    `INSERT INTO ncie_shadow_evaluations (
      empresa_id,
      conversacion_id,
      mensaje_cliente,
      respuesta_legacy,
      respuesta_ncie,
      intent_ncie,
      confidence_ncie,
      retrieval_score,
      decision_ncie,
      tiempo_ncie_ms,
      legacy_dijo_no_contamos,
      ncie_hizo_pregunta,
      ncie_encontro_opciones,
      posible_mejora,
      posible_riesgo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      evaluation.empresa_id,
      evaluation.conversacion_id,
      evaluation.mensaje_cliente,
      evaluation.respuesta_legacy,
      evaluation.respuesta_ncie,
      evaluation.intent_ncie,
      evaluation.confidence_ncie,
      evaluation.retrieval_score,
      evaluation.decision_ncie,
      evaluation.tiempo_ncie_ms,
      bool(evaluation.legacy_dijo_no_contamos),
      bool(evaluation.ncie_hizo_pregunta),
      bool(evaluation.ncie_encontro_opciones),
      bool(evaluation.posible_mejora),
      bool(evaluation.posible_riesgo)
    ]
  );

  return result.insertId;
}

export async function runNcieShadowComparison({
  empresaId,
  phone,
  message,
  whatsappChatId = null,
  whatsappMessageId = null,
  contactName = null,
  incomingMedia = null,
  legacyResult
}) {
  logger.info('ncie_shadow_started', {
    empresaId,
    conversacionId: legacyResult?.conversacion_id ?? null
  });
  const startedAt = Date.now();

  try {
    const ncieResult = await runConversationEngine({
      empresaId,
      phone,
      message,
      whatsappChatId,
      whatsappMessageId,
      contactName,
      incomingMedia,
      persist: false
    });
    const evaluation = buildShadowEvaluation({
      empresaId,
      message,
      legacyResult,
      ncieResult,
      tiempoNcieMs: Date.now() - startedAt
    });
    const evaluationId = await recordShadowEvaluation(evaluation);

    logger.info('ncie_shadow_comparison', {
      empresaId,
      evaluationId,
      legacyDijoNoContamos: evaluation.legacy_dijo_no_contamos,
      ncieEncontroOpciones: evaluation.ncie_encontro_opciones,
      posibleMejora: evaluation.posible_mejora,
      posibleRiesgo: evaluation.posible_riesgo
    });
    logger.info('ncie_shadow_completed', {
      empresaId,
      evaluationId,
      tiempoNcieMs: evaluation.tiempo_ncie_ms
    });
    return evaluation;
  } catch (error) {
    logger.error('ncie_shadow_completed', {
      empresaId,
      status: 'failed',
      error: {
        name: error?.name,
        message: error?.message
      }
    });
    return null;
  }
}

export async function listShadowEvaluationsForExport({ limit = 5000 } = {}) {
  await ensureShadowEvaluationTable();
  const [rows] = await query(
    `SELECT
      id,
      empresa_id,
      conversacion_id,
      mensaje_cliente,
      respuesta_legacy,
      respuesta_ncie,
      intent_ncie,
      confidence_ncie,
      retrieval_score,
      decision_ncie,
      tiempo_ncie_ms,
      legacy_dijo_no_contamos,
      ncie_hizo_pregunta,
      ncie_encontro_opciones,
      posible_mejora,
      posible_riesgo,
      created_at
    FROM ncie_shadow_evaluations
    ORDER BY created_at DESC, id DESC
    LIMIT ?`,
    [Number(limit)]
  );

  return rows;
}

function tenantWhere(alias, empresaId) {
  return empresaId ? { clause: `WHERE ${alias}.empresa_id = ?`, params: [empresaId] } : { clause: '', params: [] };
}

export async function getNcieQualitySummary({ empresaId = null } = {}) {
  await ensureShadowEvaluationTable();
  await ensureNcieEngineEventsTable();
  const shadowScope = tenantWhere('n', empresaId);
  const eventScope = tenantWhere('e', empresaId);
  const [[summary]] = await query(
    `SELECT
      COUNT(*) AS total,
      SUM(posible_mejora) AS mejoras,
      SUM(posible_riesgo) AS riesgos,
      AVG(confidence_ncie) AS promedio_confidence,
      AVG(retrieval_score) AS promedio_retrieval_score,
      AVG(tiempo_ncie_ms) AS promedio_tiempo_ncie_ms
    FROM ncie_shadow_evaluations n
    ${shadowScope.clause}`,
    shadowScope.params
  );
  const [[eventsSummary]] = await query(
    `SELECT
      COUNT(*) AS total_eventos,
      SUM(CASE WHEN engine_responded = 'legacy' THEN 1 ELSE 0 END) AS legacy_total,
      SUM(CASE WHEN engine_responded = 'ncie' THEN 1 ELSE 0 END) AS ncie_total,
      SUM(fallback_to_legacy) AS fallback_total,
      AVG(confidence_ncie) AS promedio_confidence,
      AVG(retrieval_score) AS promedio_retrieval_score,
      AVG(tiempo_ncie_ms) AS promedio_tiempo_ncie_ms,
      SUM(ncie_hizo_pregunta) AS aclaraciones,
      SUM(handoff_confusion) AS handoffs_confusion,
      SUM(falso_negativo_sospechoso) AS falsos_negativos_sospechosos,
      SUM(error_ncie) AS errores
    FROM ncie_engine_events e
    ${eventScope.clause}`,
    eventScope.params
  );
  const total = Number(summary?.total ?? 0);
  const totalEventos = Number(eventsSummary?.total_eventos ?? 0);
  const [intentsRows] = await query(
    `SELECT intent_ncie AS intent, COUNT(*) AS total
     FROM ncie_shadow_evaluations n
     ${shadowScope.clause}
     GROUP BY intent_ncie
     ORDER BY total DESC
     LIMIT 10`,
    shadowScope.params
  );
  const [lowConfidenceRows] = await query(
    `SELECT id, empresa_id, conversacion_id, mensaje_cliente, intent_ncie, confidence_ncie, retrieval_score, created_at
     FROM ncie_shadow_evaluations n
     WHERE confidence_ncie < ?
       ${empresaId ? 'AND n.empresa_id = ?' : ''}
     ORDER BY created_at DESC, id DESC
     LIMIT 20`,
    empresaId ? [LOW_CONFIDENCE_THRESHOLD, empresaId] : [LOW_CONFIDENCE_THRESHOLD]
  );
  const [noResultsRows] = await query(
    `SELECT id, empresa_id, conversacion_id, mensaje_cliente, intent_ncie, confidence_ncie, retrieval_score, created_at
     FROM ncie_shadow_evaluations n
     WHERE ncie_encontro_opciones = 0
       ${empresaId ? 'AND n.empresa_id = ?' : ''}
     ORDER BY created_at DESC, id DESC
     LIMIT 20`,
    empresaId ? [empresaId] : []
  );
  const [legacyNoContamosRows] = await query(
    `SELECT id, empresa_id, conversacion_id, mensaje_cliente, respuesta_legacy, respuesta_ncie, intent_ncie, confidence_ncie, retrieval_score, created_at
     FROM ncie_shadow_evaluations n
     WHERE legacy_dijo_no_contamos = 1
       AND posible_mejora = 1
       ${empresaId ? 'AND n.empresa_id = ?' : ''}
     ORDER BY created_at DESC, id DESC
     LIMIT 20`,
    empresaId ? [empresaId] : []
  );
  const estadoActual = empresaId ? await getTenantEngineConfig(empresaId) : null;

  return {
    empresa_id: empresaId ? Number(empresaId) : null,
    total_evaluaciones_shadow: total,
    total_mensajes_evaluados: totalEventos,
    porcentaje_legacy: normalizePercent(eventsSummary?.legacy_total, totalEventos),
    porcentaje_ncie: normalizePercent(eventsSummary?.ncie_total, totalEventos),
    tasa_fallback: normalizePercent(eventsSummary?.fallback_total, totalEventos),
    porcentaje_ncie_mejora_legacy: normalizePercent(summary?.mejoras, total),
    porcentaje_riesgo: normalizePercent(summary?.riesgos, total),
    promedios: {
      confidence_ncie: Number(Number(eventsSummary?.promedio_confidence ?? summary?.promedio_confidence ?? 0).toFixed(4)),
      retrieval_score: Number(Number(eventsSummary?.promedio_retrieval_score ?? summary?.promedio_retrieval_score ?? 0).toFixed(4)),
      tiempo_ncie_ms: Number(Number(eventsSummary?.promedio_tiempo_ncie_ms ?? summary?.promedio_tiempo_ncie_ms ?? 0).toFixed(2))
    },
    aclaraciones: Number(eventsSummary?.aclaraciones ?? 0),
    handoffs_confusion: Number(eventsSummary?.handoffs_confusion ?? 0),
    falsos_negativos_sospechosos: Number(eventsSummary?.falsos_negativos_sospechosos ?? 0),
    errores: Number(eventsSummary?.errores ?? 0),
    estado_actual_motor: estadoActual,
    intents_mas_comunes: intentsRows.map((row) => ({
      intent: row.intent ?? 'UNKNOWN',
      total: Number(row.total ?? 0)
    })),
    mensajes_baja_confianza: lowConfidenceRows,
    mensajes_sin_resultados: noResultsRows,
    legacy_dijo_no_contamos_y_ncie_no: legacyNoContamosRows
  };
}
