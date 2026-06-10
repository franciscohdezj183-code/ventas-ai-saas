import { generateCompanyReply, getAIStatus, interpretCustomerIntent } from './ai.service.js';
import { resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';

function resolveCompanyId(req) {
  return resolveScopedEmpresaId(req.auth, req.body.empresa_id);
}

export function aiStatus(req, res) {
  res.json({ data: getAIStatus() });
}

export async function testReply(req, res, next) {
  try {
    const result = await generateCompanyReply({
      empresaId: resolveCompanyId(req),
      phone: req.body.telefono ?? 'test',
      message: req.body.mensaje
    });

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function testIntent(req, res, next) {
  try {
    const result = await interpretCustomerIntent({
      empresaId: resolveCompanyId(req),
      message: req.body.mensaje,
      contexto: req.body.contexto ?? {}
    });

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}
