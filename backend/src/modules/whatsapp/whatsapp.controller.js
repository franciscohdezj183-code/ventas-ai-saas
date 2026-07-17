import { messagingService } from '../../messaging/messaging.service.js';
import { whatsappCommandService } from './whatsapp-command.service.js';
import { resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { normalizeRole, ROLES } from '../../config/permissions.js';
import { assertPlanLimit } from '../plans/plan-limits.service.js';
import { auditFromRequest } from '../audit/audit.service.js';
import { companyProviderService } from '../../messaging/company-provider.service.js';
import { createHttpError } from '../../utils/http-error.js';

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

export function sendCommandResponse(res, status) {
  res.status(status?.queued ? 202 : 200).json({ data: sanitizeWhatsappStatus(status) });
}

export async function startSession(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const currentStatus = await messagingService.getStatusSnapshot(empresaId);

    if (!['INITIALIZING', 'QR_READY', 'AUTHENTICATED', 'CONNECTED', 'RECONNECTING'].includes(currentStatus.status)) {
      await assertPlanLimit(empresaId, 'whatsapp');
    }

    const status = await whatsappCommandService.requestStartSession(empresaId, {
      requestedBy: req.auth?.user?.id ? `user:${req.auth.user.id}` : null
    });
    await auditFromRequest(req, {
      accion: 'INICIAR_SESION',
      modulo: 'whatsapp',
      descripcion: `Inicio de sesion WhatsApp para empresa #${empresaId}`,
      empresaId
    });
    sendCommandResponse(res, status);
  } catch (error) {
    next(error);
  }
}

export async function getStatus(req, res, next) {
  try {
    res.json({ data: sanitizeWhatsappStatus(await messagingService.getStatusSnapshot(resolveCompanyId(req))) });
  } catch (error) {
    next(error);
  }
}

export async function getQr(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const status = await messagingService.getStatusSnapshot(empresaId);
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
      res.json({ data: [sanitizeWhatsappStatus(await messagingService.getStatusSnapshot(req.auth.user.empresaId))] });
      return;
    }

    res.json({ data: (await messagingService.listStatusSnapshots()).map(sanitizeWhatsappStatus) });
  } catch (error) {
    next(error);
  }
}

export async function disconnectSession(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const status = await whatsappCommandService.requestDisconnectSession(empresaId, {
      requestedBy: req.auth?.user?.id ? `user:${req.auth.user.id}` : null
    });
    await auditFromRequest(req, {
      accion: 'DESCONECTAR_SESION',
      modulo: 'whatsapp',
      descripcion: `Desconexion de sesion WhatsApp para empresa #${empresaId}`,
      empresaId
    });
    sendCommandResponse(res, status);
  } catch (error) {
    next(error);
  }
}

export async function restartSession(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const status = await whatsappCommandService.requestRestartSession(empresaId, {
      requestedBy: req.auth?.user?.id ? `user:${req.auth.user.id}` : null
    });
    await auditFromRequest(req, {
      accion: 'REINICIAR_SESION',
      modulo: 'whatsapp',
      descripcion: `Reinicio de sesion WhatsApp para empresa #${empresaId}`,
      empresaId
    });
    sendCommandResponse(res, status);
  } catch (error) {
    next(error);
  }
}

export async function setSessionProvider(req, res, next) {
  try {
    if (normalizeRole(req.auth.user.rol) !== ROLES.SUPER_ADMIN) {
      throw createHttpError(403, 'Solo SUPER_ADMIN puede cambiar el proveedor de WhatsApp');
    }

    const empresaId = resolveCompanyId(req);
    const provider = req.body?.provider;
    const currentStatus = await messagingService.getStatusSnapshot(empresaId);
    const config = await companyProviderService.setProvider(empresaId, provider, {
      currentStatus,
      requestedBy: req.auth?.user?.id ? `user:${req.auth.user.id}` : null
    });
    await auditFromRequest(req, {
      accion: 'CAMBIAR_PROVIDER_WHATSAPP',
      modulo: 'whatsapp',
      descripcion: `Cambio de proveedor WhatsApp para empresa #${empresaId}: ${config.effectiveProvider}`,
      empresaId
    });
    res.json({ data: config });
  } catch (error) {
    next(error);
  }
}
