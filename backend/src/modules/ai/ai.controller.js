import { generateCompanyReply, getAIStatus, interpretCustomerIntent } from './ai.service.js';

function resolveCompanyId(req) {
  if (req.auth.user.rol === 'SUPER_ADMIN') {
    return req.body.empresa_id;
  }

  return req.auth.user.empresaId;
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
