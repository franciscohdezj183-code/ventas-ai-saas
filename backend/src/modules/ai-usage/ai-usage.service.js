import { query } from '../../config/database.js';
import { env } from '../../config/env.js';
import { getPlanConfig } from '../../config/plans.js';
import { getAuthenticatedEmpresaId, isSuperAdmin, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { createHttpError } from '../../utils/http-error.js';

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeMonth(value) {
  const month = String(value ?? currentMonth()).trim();

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw createHttpError(400, 'El mes debe tener formato YYYY-MM');
  }

  return month;
}

function monthRange(month) {
  const start = `${month}-01 00:00:00`;
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  const nextMonth = next.toISOString().slice(0, 7);

  return {
    month,
    start,
    endExclusive: `${nextMonth}-01 00:00:00`
  };
}

export function estimateAICost({ tokensInput = 0, tokensOutput = 0 }) {
  const inputCost = (Number(tokensInput) / 1_000_000) * env.openai.inputCostPerMillion;
  const outputCost = (Number(tokensOutput) / 1_000_000) * env.openai.outputCostPerMillion;

  return Number((inputCost + outputCost).toFixed(8));
}

export async function registerAIUsage({
  tenantId,
  userId = null,
  conversationId = null,
  tokensInput = 0,
  tokensOutput = 0,
  totalTokens = null,
  estimatedCost = null,
  modelUsed = env.openai.model,
  fecha = null
}) {
  const normalizedTenantId = Number(tenantId);

  if (!Number.isInteger(normalizedTenantId) || normalizedTenantId <= 0) {
    throw createHttpError(400, 'La empresa es requerida para registrar consumo IA');
  }

  const input = Math.max(Number(tokensInput ?? 0), 0);
  const output = Math.max(Number(tokensOutput ?? 0), 0);
  const total = Math.max(Number(totalTokens ?? input + output), 0);
  const cost = estimatedCost ?? estimateAICost({ tokensInput: input, tokensOutput: output });

  const [result] = await query(
    `INSERT INTO ai_usage_logs
       (tenant_id, user_id, conversation_id, tokens_input, tokens_output, total_tokens, costo_estimado, modelo_usado, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
    [
      normalizedTenantId,
      userId ? Number(userId) : null,
      conversationId ? Number(conversationId) : null,
      input,
      output,
      total,
      cost,
      String(modelUsed ?? env.openai.model),
      fecha
    ]
  );

  return {
    id: result.insertId,
    tenant_id: normalizedTenantId,
    user_id: userId ? Number(userId) : null,
    conversation_id: conversationId ? Number(conversationId) : null,
    tokens_input: input,
    tokens_output: output,
    total_tokens: total,
    costo_estimado: cost,
    modelo_usado: String(modelUsed ?? env.openai.model)
  };
}

export async function countAIMessagesForMonth(tenantId, month = currentMonth()) {
  const range = monthRange(normalizeMonth(month));

  try {
    const [rows] = await query(
      `SELECT COUNT(*) AS total
       FROM ai_usage_logs
       WHERE tenant_id = ?
         AND fecha >= ?
         AND fecha < ?`,
      [tenantId, range.start, range.endExclusive]
    );

    return Number(rows[0]?.total ?? 0);
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') {
      throw error;
    }

    const [rows] = await query(
      `SELECT COUNT(*) AS total
       FROM conversaciones
       WHERE empresa_id = ?
         AND respuesta IS NOT NULL
         AND respuesta <> ''
         AND fecha >= ?
         AND fecha < ?`,
      [tenantId, range.start, range.endExclusive]
    );

    return Number(rows[0]?.total ?? 0);
  }
}

export async function getMonthlyAIUsage(auth, filters = {}) {
  const month = normalizeMonth(filters.month ?? filters.mes);
  const range = monthRange(month);
  const requestedCompanyId = filters.empresa_id ?? filters.tenant_id;
  const tenantId = isSuperAdmin(auth)
    ? resolveScopedEmpresaId(auth, requestedCompanyId, { requiredForSuperAdmin: false })
    : getAuthenticatedEmpresaId(auth);
  const scope = tenantId
    ? { clause: 'WHERE a.tenant_id = ?', params: [tenantId] }
    : { clause: '', params: [] };
  const where = {
    clause: scope.clause ? `${scope.clause} AND a.fecha >= ? AND a.fecha < ?` : 'WHERE a.fecha >= ? AND a.fecha < ?',
    params: [...scope.params, range.start, range.endExclusive]
  };

  const [summaryRows] = await query(
    `SELECT
       COUNT(*) AS total_requests,
       COALESCE(SUM(a.tokens_input), 0) AS tokens_input,
       COALESCE(SUM(a.tokens_output), 0) AS tokens_output,
       COALESCE(SUM(a.total_tokens), 0) AS total_tokens,
       COALESCE(SUM(a.costo_estimado), 0) AS costo_estimado
     FROM ai_usage_logs a
     ${where.clause}`,
    where.params
  );
  const summary = summaryRows[0] ?? {};

  const [companyRows] = await query(
    `SELECT
       a.tenant_id,
       e.nombre AS empresa_nombre,
       e.plan,
       COUNT(*) AS total_requests,
       COALESCE(SUM(a.tokens_input), 0) AS tokens_input,
       COALESCE(SUM(a.tokens_output), 0) AS tokens_output,
       COALESCE(SUM(a.total_tokens), 0) AS total_tokens,
       COALESCE(SUM(a.costo_estimado), 0) AS costo_estimado
     FROM ai_usage_logs a
     INNER JOIN empresas e ON e.id = a.tenant_id
     ${where.clause}
     GROUP BY a.tenant_id, e.nombre, e.plan
     ORDER BY total_requests DESC, total_tokens DESC`,
    where.params
  );

  const plan = tenantId && companyRows[0] ? getPlanConfig(companyRows[0].plan) : null;

  return {
    month,
    tenant_id: tenantId,
    total_requests: Number(summary.total_requests ?? 0),
    tokens_input: Number(summary.tokens_input ?? 0),
    tokens_output: Number(summary.tokens_output ?? 0),
    total_tokens: Number(summary.total_tokens ?? 0),
    costo_estimado: Number(Number(summary.costo_estimado ?? 0).toFixed(8)),
    limit: plan?.limits.aiMessagesMonthly ?? null,
    remaining: plan && plan.limits.aiMessagesMonthly !== null
      ? Math.max(Number(plan.limits.aiMessagesMonthly) - Number(summary.total_requests ?? 0), 0)
      : null,
    by_company: companyRows.map((row) => {
      const rowPlan = getPlanConfig(row.plan);
      const requests = Number(row.total_requests ?? 0);
      const limit = rowPlan.limits.aiMessagesMonthly;

      return {
        tenant_id: Number(row.tenant_id),
        empresa_nombre: row.empresa_nombre,
        plan: rowPlan.key,
        plan_label: rowPlan.label,
        total_requests: requests,
        tokens_input: Number(row.tokens_input ?? 0),
        tokens_output: Number(row.tokens_output ?? 0),
        total_tokens: Number(row.total_tokens ?? 0),
        costo_estimado: Number(Number(row.costo_estimado ?? 0).toFixed(8)),
        limit,
        remaining: limit === null ? null : Math.max(Number(limit) - requests, 0)
      };
    })
  };
}
