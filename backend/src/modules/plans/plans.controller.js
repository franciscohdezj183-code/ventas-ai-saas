import { PLAN_CONFIG } from '../../config/plans.js';
import { resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { getTenantPlanUsage } from './plan-limits.service.js';

function serializePlan(plan) {
  return {
    key: plan.key,
    label: plan.label,
    limits: plan.limits,
    features: plan.features,
    estimatedMonthlyPrice: plan.estimatedMonthlyPrice
  };
}

export async function listPlans(req, res, next) {
  try {
    res.json({ data: Object.values(PLAN_CONFIG).map(serializePlan) });
  } catch (error) {
    next(error);
  }
}

export async function getPlanUsage(req, res, next) {
  try {
    const empresaId = resolveScopedEmpresaId(req.auth, req.query.empresa_id);
    res.json({ data: await getTenantPlanUsage(empresaId) });
  } catch (error) {
    next(error);
  }
}
