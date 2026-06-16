import {
  disconnectWhatsappSession,
  getWhatsappStatusSnapshot,
  listWhatsappStatusSnapshots,
  startWhatsappSession
} from './whatsapp.service.js';
import { resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { normalizeRole, ROLES } from '../../config/permissions.js';
import { assertPlanLimit } from '../plans/plan-limits.service.js';
import { auditFromRequest } from '../audit/audit.service.js';

function sanitizeWhatsappStatus(status) {
  if (!status) {
    return status;
  }

  const { qr, qr_image: qrImage, ...safeStatus } = status;
  return {
    ...safeStatus,
    qr_available: Boolean(qr || qrImage)
  };
}

function resolveCompanyId(req) {
  return resolveScopedEmpresaId(req.auth, req.params.empresaId ?? req.body.empresa_id ?? req.query.empresa_id);
}

export async function startSession(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const currentStatus = await getWhatsappStatusSnapshot(empresaId);

    if (!['INITIALIZING', 'QR_READY', 'AUTHENTICATED', 'CONNECTED', 'RECONNECTING'].includes(currentStatus.status)) {
      await assertPlanLimit(empresaId, 'whatsapp');
    }

    const status = await startWhatsappSession(empresaId);
    await auditFromRequest(req, {
      accion: 'INICIAR_SESION',
      modulo: 'whatsapp',
      descripcion: `Inicio de sesion WhatsApp para empresa #${empresaId}`,
      empresaId
    });
    res.json({ data: sanitizeWhatsappStatus(status) });
  } catch (error) {
    next(error);
  }
}

export async function getStatus(req, res, next) {
  try {
    res.json({ data: sanitizeWhatsappStatus(await getWhatsappStatusSnapshot(resolveCompanyId(req))) });
  } catch (error) {
    next(error);
  }
}

export async function getQr(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const status = await getWhatsappStatusSnapshot(empresaId);
    await auditFromRequest(req, {
      accion: 'CONSULTAR_QR',
      modulo: 'whatsapp',
      descripcion: `Consulta de QR WhatsApp para empresa #${empresaId}`,
      empresaId
    });
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
    if (normalizeRole(req.auth.user.rol) !== ROLES.SUPER_ADMIN) {
      res.json({ data: [sanitizeWhatsappStatus(await getWhatsappStatusSnapshot(req.auth.user.empresaId))] });
      return;
    }

    res.json({ data: (await listWhatsappStatusSnapshots()).map(sanitizeWhatsappStatus) });
  } catch (error) {
    next(error);
  }
}

export async function disconnectSession(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const status = await disconnectWhatsappSession(empresaId);
    await auditFromRequest(req, {
      accion: 'DESCONECTAR_SESION',
      modulo: 'whatsapp',
      descripcion: `Desconexion de sesion WhatsApp para empresa #${empresaId}`,
      empresaId
    });
    res.json({ data: sanitizeWhatsappStatus(status) });
  } catch (error) {
    next(error);
  }
}
