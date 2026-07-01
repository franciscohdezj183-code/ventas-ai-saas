import { getNcieQualitySummary } from '../../conversation-engine/shadow-evaluation.service.js';
import { listTenantEngineConfigs, updateTenantEngineConfig } from '../../conversation-engine/tenant-engine.service.js';
import { createHttpError } from '../../utils/http-error.js';

function normalizeEmpresaId(value) {
  if (value === undefined || value === null || value === '') return null;
  const empresaId = Number(value);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw createHttpError(400, 'empresa_id debe ser un entero positivo');
  }

  return empresaId;
}

export async function ncieQuality(req, res, next) {
  try {
    res.json({ data: await getNcieQualitySummary({ empresaId: normalizeEmpresaId(req.query.empresa_id) }) });
  } catch (error) {
    next(error);
  }
}

export async function listNcieTenants(req, res, next) {
  try {
    res.json({ data: await listTenantEngineConfigs() });
  } catch (error) {
    next(error);
  }
}

export async function updateNcieTenantEngine(req, res, next) {
  try {
    const empresaId = normalizeEmpresaId(req.params.empresaId);
    const updated = await updateTenantEngineConfig(empresaId, req.body ?? {});

    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
}
