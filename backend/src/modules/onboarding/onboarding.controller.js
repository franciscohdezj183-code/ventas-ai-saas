import { createCompanyOnboarding, getOnboardingStatus } from './onboarding.service.js';
import { auditFromRequest } from '../audit/audit.service.js';

export async function onboardingStatus(req, res, next) {
  try {
    res.json({
      data: await getOnboardingStatus(req.auth, req.query.empresa_id)
    });
  } catch (error) {
    next(error);
  }
}

export async function storeCompanyOnboarding(req, res, next) {
  try {
    const result = await createCompanyOnboarding(req.body, req.auth);

    await auditFromRequest(req, {
      accion: 'ONBOARDING_EMPRESA',
      modulo: 'onboarding',
      descripcion: `Onboarding creado para empresa: ${result.company.nombre} (#${result.company.id})`,
      empresaId: result.company.id
    });

    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
}
