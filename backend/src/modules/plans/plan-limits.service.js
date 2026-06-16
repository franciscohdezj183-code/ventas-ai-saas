import { query } from '../../config/database.js';
import { getPlanConfig, isUnlimitedLimit } from '../../config/plans.js';
import { createHttpError } from '../../utils/http-error.js';
import { countAIMessagesForMonth } from '../ai-usage/ai-usage.service.js';

async function getCompanyPlan(companyId) {
  const [rows] = await query('SELECT id, nombre, plan FROM empresas WHERE id = ? LIMIT 1', [companyId]);
  const company = rows[0];

  if (!company) {
    throw createHttpError(404, 'Empresa no encontrada');
  }

  return {
    company,
    plan: getPlanConfig(company.plan)
  };
}

async function getUsageValue(companyId, resource) {
  if (resource === 'users') {
    const [rows] = await query(
      "SELECT COUNT(*) AS total FROM usuarios WHERE empresa_id = ? AND estado = 'ACTIVO'",
      [companyId]
    );
    return Number(rows[0]?.total ?? 0);
  }

  if (resource === 'products') {
    const [rows] = await query(
      "SELECT COUNT(*) AS total FROM productos WHERE empresa_id = ? AND estado = 'ACTIVO'",
      [companyId]
    );
    return Number(rows[0]?.total ?? 0);
  }

  if (resource === 'whatsapp') {
    try {
      const [rows] = await query(
        "SELECT COUNT(*) AS total FROM whatsapp_session_status WHERE empresa_id = ? AND status IN ('INITIALIZING','QR_READY','AUTHENTICATED','CONNECTED','RECONNECTING')",
        [companyId]
      );
      return Number(rows[0]?.total ?? 0);
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return 0;
      }

      throw error;
    }
  }

  if (resource === 'aiMessagesMonthly') {
    return countAIMessagesForMonth(companyId);
  }

  throw createHttpError(500, `Limite no soportado: ${resource}`);
}

function limitLabel(resource) {
  return {
    users: 'usuarios',
    products: 'productos',
    whatsapp: 'WhatsApp conectados',
    aiMessagesMonthly: 'mensajes IA mensuales'
  }[resource] ?? resource;
}

export async function getTenantPlanUsage(companyId) {
  const { company, plan } = await getCompanyPlan(companyId);
  const [users, products, whatsapp, aiMessagesMonthly] = await Promise.all([
    getUsageValue(companyId, 'users'),
    getUsageValue(companyId, 'products'),
    getUsageValue(companyId, 'whatsapp'),
    getUsageValue(companyId, 'aiMessagesMonthly')
  ]);

  return {
    tenant_id: Number(companyId),
    empresa_nombre: company.nombre,
    plan: plan.key,
    plan_label: plan.label,
    limits: plan.limits,
    usage: {
      users,
      products,
      whatsapp,
      aiMessagesMonthly
    },
    features: plan.features
  };
}

export async function assertPlanLimit(companyId, resource, increment = 1) {
  const { plan } = await getCompanyPlan(companyId);
  const limit = plan.limits[resource];

  if (isUnlimitedLimit(limit)) {
    return true;
  }

  const currentUsage = await getUsageValue(companyId, resource);

  if (currentUsage + increment > limit) {
    throw createHttpError(
      402,
      `Tu plan ${plan.label} permite hasta ${limit} ${limitLabel(resource)}. Uso actual: ${currentUsage}. Actualiza tu plan para continuar.`
    );
  }

  return true;
}

export async function isPlanLimitAvailable(companyId, resource, increment = 1) {
  try {
    await assertPlanLimit(companyId, resource, increment);
    return { allowed: true };
  } catch (error) {
    if (error.statusCode === 402) {
      return { allowed: false, message: error.message };
    }

    throw error;
  }
}
