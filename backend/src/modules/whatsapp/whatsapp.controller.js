import {
  disconnectWhatsappSession,
  getWhatsappStatusSnapshot,
  listWhatsappStatusSnapshots,
  startWhatsappSession
} from './whatsapp.service.js';
import { resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { auditFromRequest } from '../audit/audit.service.js';

function resolveCompanyId(req) {
  return resolveScopedEmpresaId(req.auth, req.params.empresaId ?? req.body.empresa_id ?? req.query.empresa_id);
}

export async function startSession(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const status = await startWhatsappSession(empresaId);
    await auditFromRequest(req, {
      accion: 'INICIAR_SESION',
      modulo: 'whatsapp',
      descripcion: `Inicio de sesion WhatsApp para empresa #${empresaId}`,
      empresaId
    });
    res.json({ data: status });
  } catch (error) {
    next(error);
  }
}

export async function getStatus(req, res, next) {
  try {
    res.json({ data: await getWhatsappStatusSnapshot(resolveCompanyId(req)) });
  } catch (error) {
    next(error);
  }
}

export async function getQr(req, res, next) {
  try {
    const status = await getWhatsappStatusSnapshot(resolveCompanyId(req));
    res.json({
      data: {
        empresa_id: status.empresa_id,
        status: status.status,
        qr: status.qr,
        qr_image: status.qr_image,
        updated_at: status.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function listStatuses(req, res, next) {
  try {
    if (req.auth.user.rol !== 'SUPER_ADMIN') {
      res.json({ data: [await getWhatsappStatusSnapshot(req.auth.user.empresaId)] });
      return;
    }

    res.json({ data: await listWhatsappStatusSnapshots() });
  } catch (error) {
    next(error);
  }
}

export async function disconnectSession(req, res, next) {
  try {
    res.json({ data: await disconnectWhatsappSession(resolveCompanyId(req)) });
  } catch (error) {
    next(error);
  }
}
