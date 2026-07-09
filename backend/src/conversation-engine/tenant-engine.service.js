import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

export const ENGINE_VERSIONS = Object.freeze({
  LEGACY: 'legacy',
  NCIE: 'ncie',
  SHADOW: 'shadow'
});

export const DEFAULT_TENANT_ENGINE_CONFIG = Object.freeze({
  conversation_engine_version: ENGINE_VERSIONS.LEGACY,
  ncie_enabled: false,
  ncie_canary_percentage: 0,
  ncie_min_confidence: 0.55,
  ncie_min_retrieval_score: 1,
  ncie_auto_rollback_enabled: false,
  ncie_max_risk_rate: 0.35
});

const CREATE_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ncie_engine_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id BIGINT UNSIGNED NOT NULL,
  conversacion_id BIGINT UNSIGNED NULL,
  engine_config VARCHAR(20) NOT NULL,
  engine_selected VARCHAR(20) NOT NULL,
  engine_responded VARCHAR(20) NOT NULL,
  canary_selected TINYINT(1) NOT NULL DEFAULT 0,
  fallback_to_legacy TINYINT(1) NOT NULL DEFAULT 0,
  confidence_ncie DECIMAL(5,4) NULL,
  retrieval_score DECIMAL(10,4) NULL,
  ncie_hizo_pregunta TINYINT(1) NOT NULL DEFAULT 0,
  handoff_confusion TINYINT(1) NOT NULL DEFAULT 0,
  falso_negativo_sospechoso TINYINT(1) NOT NULL DEFAULT 0,
  error_ncie TINYINT(1) NOT NULL DEFAULT 0,
  error_message VARCHAR(255) NULL,
  tiempo_ncie_ms INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ncie_engine_events_empresa_created_index (empresa_id, created_at),
  KEY ncie_engine_events_selected_index (engine_selected),
  KEY ncie_engine_events_responded_index (engine_responded),
  KEY ncie_engine_events_fallback_index (fallback_to_legacy),
  KEY ncie_engine_events_error_index (error_ncie),
  CONSTRAINT ncie_engine_events_empresa_foreign
    FOREIGN KEY (empresa_id) REFERENCES empresas (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT ncie_engine_events_conversacion_foreign
    FOREIGN KEY (conversacion_id) REFERENCES conversaciones (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

let ensureEventsTablePromise = null;

function normalizeVersion(value, fallback = ENGINE_VERSIONS.LEGACY) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Object.values(ENGINE_VERSIONS).includes(normalized) ? normalized : fallback;
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1' || value === 'true';
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function globalDefaultVersion() {
  if (env.conversationEngine.shadowMode) return ENGINE_VERSIONS.SHADOW;
  return normalizeVersion(env.conversationEngine.version, ENGINE_VERSIONS.LEGACY);
}

function globalDefaultConfig(empresaId = null) {
  const version = globalDefaultVersion();

  return {
    ...DEFAULT_TENANT_ENGINE_CONFIG,
    empresa_id: empresaId,
    conversation_engine_version: version,
    ncie_enabled: version === ENGINE_VERSIONS.NCIE,
    ncie_canary_percentage: version === ENGINE_VERSIONS.NCIE ? 100 : 0,
    ncie_auto_rollback_enabled: env.conversationEngine.autoRollbackEnabled,
    config_source: 'env'
  };
}

export function normalizeTenantEngineConfig(row = {}) {
  const configSource = row.config_source ?? 'tenant';

  return {
    empresa_id: row.empresa_id ?? row.id ?? null,
    conversation_engine_version: normalizeVersion(row.conversation_engine_version, globalDefaultVersion()),
    ncie_enabled: normalizeBoolean(row.ncie_enabled, row.conversation_engine_version === ENGINE_VERSIONS.NCIE),
    ncie_canary_percentage: clampNumber(row.ncie_canary_percentage, DEFAULT_TENANT_ENGINE_CONFIG.ncie_canary_percentage, 0, 100),
    ncie_min_confidence: clampNumber(row.ncie_min_confidence, DEFAULT_TENANT_ENGINE_CONFIG.ncie_min_confidence, 0, 1),
    ncie_min_retrieval_score: clampNumber(row.ncie_min_retrieval_score, DEFAULT_TENANT_ENGINE_CONFIG.ncie_min_retrieval_score, 0, 1000),
    ncie_auto_rollback_enabled: normalizeBoolean(row.ncie_auto_rollback_enabled, env.conversationEngine.autoRollbackEnabled),
    ncie_max_risk_rate: clampNumber(row.ncie_max_risk_rate, DEFAULT_TENANT_ENGINE_CONFIG.ncie_max_risk_rate, 0, 1),
    config_source: configSource
  };
}

export function resolveTenantEngineConfig(row = {}, empresaId = null) {
  const hasTenantConfig =
    row?.tenant_config_empresa_id !== null &&
    row?.tenant_config_empresa_id !== undefined &&
    normalizeBoolean(row?.conversation_engine_explicit, false);

  return hasTenantConfig
    ? normalizeTenantEngineConfig({ ...row, config_source: 'tenant' })
    : globalDefaultConfig(row?.empresa_id ?? empresaId);
}

export function selectTenantEngine({ config, conversationKey }) {
  const normalizedConfig = normalizeTenantEngineConfig(config);
  const configuredVersion = normalizedConfig.conversation_engine_version;

  if (configuredVersion === ENGINE_VERSIONS.SHADOW) {
    return {
      engine: ENGINE_VERSIONS.SHADOW,
      responseEngine: ENGINE_VERSIONS.LEGACY,
      shouldRunNcie: true,
      canarySelected: false,
      config: normalizedConfig
    };
  }

  if (configuredVersion !== ENGINE_VERSIONS.NCIE || !normalizedConfig.ncie_enabled) {
    return {
      engine: ENGINE_VERSIONS.LEGACY,
      responseEngine: ENGINE_VERSIONS.LEGACY,
      shouldRunNcie: false,
      canarySelected: false,
      config: normalizedConfig
    };
  }

  return {
    engine: ENGINE_VERSIONS.NCIE,
    responseEngine: ENGINE_VERSIONS.NCIE,
    shouldRunNcie: true,
    canarySelected: true,
    config: normalizedConfig
  };
}

export function assessNcieRisk({ config, ncieResult = null, error = null }) {
  const normalizedConfig = normalizeTenantEngineConfig(config);
  const retrieval = ncieResult?.ncie?.retrieval ?? ncieResult?.mcp_result ?? {};
  const confidence = Number(ncieResult?.confianza ?? ncieResult?.ncie?.nlu?.confidence ?? 0);
  const retrievalScore = Math.max(
    0,
    ...[...(retrieval.services ?? []), ...(retrieval.products ?? [])].map((item) => Number(item?.score ?? 0))
  );
  const response = String(ncieResult?.respuesta ?? '');
  const ncieHizoPregunta = response.includes('?') || response.includes('\u00bf');
  const decisionAction = ncieResult?.ncie?.decision?.action;
  const generalCatalogSafe =
    ['LISTAR_SERVICIOS', 'LISTAR_CATALOGO', 'LISTAR_PRODUCTOS'].includes(ncieResult?.intencion) &&
    [decisionAction, ncieResult?.ncie?.nlu?.recommended_action].some((action) => (
      action === 'answer_with_results' ||
      action === 'list_service_families' ||
      action === 'ask_clarifying_question'
    ));
  const falseNegativeRisk = ncieResult?.ncie?.decision?.falseNegativeRisk === true;
  const handoffConfusion =
    decisionAction === 'escalate_human' ||
    ncieResult?.intencion === 'ACLARACION_CLIENTE' ||
    /confund|frustr/i.test(String(ncieResult?.ncie?.nlu?.entities?.problem ?? ''));
  const risky = !generalCatalogSafe && (
    Boolean(error) ||
    confidence < normalizedConfig.ncie_min_confidence ||
    retrievalScore < normalizedConfig.ncie_min_retrieval_score ||
    falseNegativeRisk ||
    handoffConfusion
  );

  return {
    risky,
    confidence,
    retrievalScore,
    ncieHizoPregunta,
    handoffConfusion: generalCatalogSafe ? false : handoffConfusion,
    falseNegativeRisk: generalCatalogSafe ? false : falseNegativeRisk,
    error: Boolean(error),
    errorMessage: error?.message ? String(error.message).slice(0, 255) : null
  };
}

export function shouldTriggerAutoRollback({ config, latestRisk, total = 0, risky = 0, clarifications = 0, handoffs = 0 }) {
  const normalizedConfig = normalizeTenantEngineConfig(config);

  if (!normalizedConfig.ncie_auto_rollback_enabled || normalizedConfig.conversation_engine_version !== ENGINE_VERSIONS.NCIE) {
    return false;
  }

  if (Number(total) < 20) {
    return false;
  }

  const adjustedRisky = Number(risky ?? 0) + (latestRisk?.risky ? 1 : 0);
  const riskRate = total > 0 ? adjustedRisky / total : latestRisk?.risky ? 1 : 0;
  const clarificationRate = total > 0 ? Number(clarifications ?? 0) / total : 0;
  const handoffRate = total > 0 ? Number(handoffs ?? 0) / total : 0;

  return Boolean(
    latestRisk?.error ||
    riskRate > normalizedConfig.ncie_max_risk_rate ||
    clarificationRate > 0.65 ||
    handoffRate > 0.35
  );
}

export async function ensureNcieEngineEventsTable() {
  if (!ensureEventsTablePromise) {
    ensureEventsTablePromise = query(CREATE_EVENTS_TABLE_SQL).catch((error) => {
      ensureEventsTablePromise = null;
      throw error;
    });
  }

  await ensureEventsTablePromise;
}

export async function getTenantEngineConfig(empresaId) {
  const [rows] = await query(
    `SELECT
      e.id AS empresa_id,
      ce.empresa_id AS tenant_config_empresa_id,
      ce.conversation_engine_explicit,
      ce.conversation_engine_version,
      ce.ncie_enabled,
      ce.ncie_canary_percentage,
      ce.ncie_min_confidence,
      ce.ncie_min_retrieval_score,
      ce.ncie_auto_rollback_enabled,
      ce.ncie_max_risk_rate
     FROM empresas e
     LEFT JOIN configuracion_empresas ce ON ce.empresa_id = e.id
     WHERE e.id = ?
     LIMIT 1`,
    [empresaId]
  );
  const config = resolveTenantEngineConfig(rows[0] ?? { empresa_id: empresaId }, empresaId);

  logger.info('ncie_tenant_config_loaded', {
    empresaId,
    conversationEngineVersion: config.conversation_engine_version,
    ncieEnabled: config.ncie_enabled,
    canaryPercentage: config.ncie_canary_percentage,
    configSource: config.config_source
  });

  return config;
}

export async function updateTenantEngineConfig(empresaId, patch) {
  const current = await getTenantEngineConfig(empresaId);
  const next = normalizeTenantEngineConfig({
    ...current,
    ...patch,
    empresa_id: empresaId
  });

  await query(
    `INSERT INTO configuracion_empresas (
      empresa_id,
      conversation_engine_explicit,
      conversation_engine_version,
      ncie_enabled,
      ncie_canary_percentage,
      ncie_min_confidence,
      ncie_min_retrieval_score,
      ncie_auto_rollback_enabled,
      ncie_max_risk_rate
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      conversation_engine_explicit = VALUES(conversation_engine_explicit),
      conversation_engine_version = VALUES(conversation_engine_version),
      ncie_enabled = VALUES(ncie_enabled),
      ncie_canary_percentage = VALUES(ncie_canary_percentage),
      ncie_min_confidence = VALUES(ncie_min_confidence),
      ncie_min_retrieval_score = VALUES(ncie_min_retrieval_score),
      ncie_auto_rollback_enabled = VALUES(ncie_auto_rollback_enabled),
      ncie_max_risk_rate = VALUES(ncie_max_risk_rate)`,
    [
      empresaId,
      1,
      next.conversation_engine_version,
      next.ncie_enabled ? 1 : 0,
      next.ncie_canary_percentage,
      next.ncie_min_confidence,
      next.ncie_min_retrieval_score,
      next.ncie_auto_rollback_enabled ? 1 : 0,
      next.ncie_max_risk_rate
    ]
  );

  logger.info('ncie_tenant_engine_updated', {
    empresaId,
    conversationEngineVersion: next.conversation_engine_version,
    ncieEnabled: next.ncie_enabled,
    canaryPercentage: next.ncie_canary_percentage
  });

  return next;
}

export async function listTenantEngineConfigs() {
  await ensureNcieEngineEventsTable();
  const [rows] = await query(
    `SELECT
      e.id AS empresa_id,
      e.nombre AS empresa_nombre,
      ce.empresa_id AS tenant_config_empresa_id,
      ce.conversation_engine_explicit,
      ce.conversation_engine_version,
      ce.ncie_enabled,
      ce.ncie_canary_percentage,
      ce.ncie_min_confidence,
      ce.ncie_min_retrieval_score,
      ce.ncie_auto_rollback_enabled,
      ce.ncie_max_risk_rate,
      COUNT(ne.id) AS total_eventos,
      AVG(ne.confidence_ncie) AS promedio_confidence,
      AVG(ne.retrieval_score) AS promedio_retrieval_score,
      SUM(ne.error_ncie) AS errores,
      SUM(ne.falso_negativo_sospechoso) AS riesgos,
      SUM(ne.handoff_confusion) AS handoffs_confusion
     FROM empresas e
     LEFT JOIN configuracion_empresas ce ON ce.empresa_id = e.id
     LEFT JOIN ncie_engine_events ne ON ne.empresa_id = e.id
       AND ne.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY e.id, e.nombre, ce.conversation_engine_version, ce.ncie_enabled, ce.ncie_canary_percentage,
       ce.ncie_min_confidence, ce.ncie_min_retrieval_score, ce.ncie_auto_rollback_enabled, ce.ncie_max_risk_rate
     ORDER BY e.fecha_creacion DESC`
  );

  return rows.map((row) => {
    const totalEventos = Number(row.total_eventos ?? 0);
    const riesgos = Number(row.riesgos ?? 0);
    const errores = Number(row.errores ?? 0);
    const handoffsConfusion = Number(row.handoffs_confusion ?? 0);
    const riskRate = totalEventos > 0 ? (riesgos + errores + handoffsConfusion) / totalEventos : 0;

    return {
      empresa_id: row.empresa_id,
      empresa_nombre: row.empresa_nombre,
      ...resolveTenantEngineConfig(row, row.empresa_id),
      total_eventos_7d: totalEventos,
      quality_score: Number(Math.max(0, 100 - riskRate * 100).toFixed(2)),
      promedio_confidence: Number(Number(row.promedio_confidence ?? 0).toFixed(4)),
      promedio_retrieval_score: Number(Number(row.promedio_retrieval_score ?? 0).toFixed(4)),
      errores,
      riesgos,
      handoffs_confusion: handoffsConfusion
    };
  });
}

export async function recordNcieEngineEvent(event) {
  await ensureNcieEngineEventsTable();
  await query(
    `INSERT INTO ncie_engine_events (
      empresa_id,
      conversacion_id,
      engine_config,
      engine_selected,
      engine_responded,
      canary_selected,
      fallback_to_legacy,
      confidence_ncie,
      retrieval_score,
      ncie_hizo_pregunta,
      handoff_confusion,
      falso_negativo_sospechoso,
      error_ncie,
      error_message,
      tiempo_ncie_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.empresa_id,
      event.conversacion_id ?? null,
      event.engine_config,
      event.engine_selected,
      event.engine_responded,
      event.canary_selected ? 1 : 0,
      event.fallback_to_legacy ? 1 : 0,
      event.confidence_ncie ?? null,
      event.retrieval_score ?? null,
      event.ncie_hizo_pregunta ? 1 : 0,
      event.handoff_confusion ? 1 : 0,
      event.falso_negativo_sospechoso ? 1 : 0,
      event.error_ncie ? 1 : 0,
      event.error_message ?? null,
      event.tiempo_ncie_ms ?? null
    ]
  );
}

export async function maybeRollbackTenantEngine({ empresaId, config, latestRisk }) {
  const normalizedConfig = normalizeTenantEngineConfig(config);

  if (!normalizedConfig.ncie_auto_rollback_enabled || normalizedConfig.conversation_engine_version !== ENGINE_VERSIONS.NCIE) {
    return false;
  }

  await ensureNcieEngineEventsTable();
  const [rows] = await query(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN error_ncie = 1 OR falso_negativo_sospechoso = 1 OR handoff_confusion = 1 OR confidence_ncie < ? OR retrieval_score < ? THEN 1 ELSE 0 END) AS risky,
      SUM(CASE WHEN ncie_hizo_pregunta = 1 THEN 1 ELSE 0 END) AS clarifications,
      SUM(CASE WHEN handoff_confusion = 1 THEN 1 ELSE 0 END) AS handoffs
     FROM (
       SELECT error_ncie, falso_negativo_sospechoso, handoff_confusion, confidence_ncie, retrieval_score, ncie_hizo_pregunta
       FROM ncie_engine_events
       WHERE empresa_id = ?
         AND engine_selected = 'ncie'
       ORDER BY created_at DESC, id DESC
       LIMIT 20
     ) recent`,
    [normalizedConfig.ncie_min_confidence, normalizedConfig.ncie_min_retrieval_score, empresaId]
  );
  const total = Number(rows[0]?.total ?? 0);
  const risky = Number(rows[0]?.risky ?? 0);
  const clarifications = Number(rows[0]?.clarifications ?? 0);
  const handoffs = Number(rows[0]?.handoffs ?? 0);
  const riskRate = total > 0 ? (risky + (latestRisk?.risky ? 1 : 0)) / total : latestRisk?.risky ? 1 : 0;
  const clarificationRate = total > 0 ? clarifications / total : 0;
  const shouldRollback = shouldTriggerAutoRollback({
    config: normalizedConfig,
    latestRisk: latestRisk?.error ? latestRisk : { risky: false, error: false },
    total,
    risky,
    clarifications,
    handoffs
  });

  if (!shouldRollback) {
    return false;
  }

  await updateTenantEngineConfig(empresaId, {
    conversation_engine_version: ENGINE_VERSIONS.LEGACY,
    ncie_enabled: false,
    ncie_canary_percentage: 0
  });
  logger.error('ncie_auto_rollback_triggered', {
    empresaId,
    reason: latestRisk?.error ? 'ncie_error' : 'quality_threshold',
    riskRate,
    clarificationRate,
    total
  });

  return true;
}
