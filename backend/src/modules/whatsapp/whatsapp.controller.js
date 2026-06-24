import {
  disconnectSession as disconnectWhatsappSession,
  destroySession as destroyWhatsappSession,
  getQr as getWhatsappQr,
  getSessionStatus,
  listSessions,
  requestStartSession as requestWhatsappStartSession,
  restartSession as restartWhatsappSession,
} from '../../whatsapp/whatsapp-session.manager.js';
import { resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { normalizeRole, ROLES } from '../../config/permissions.js';
import { assertPlanLimit } from '../plans/plan-limits.service.js';
import { auditFromRequest } from '../audit/audit.service.js';

function resolveCompanyId(req) {
  return resolveScopedEmpresaId(
    req.auth,
    req.params.empresaId ?? req.body.companyId ?? req.body.empresa_id ?? req.query.companyId ?? req.query.empresa_id
  );
}

export async function getStatus(req, res, next) {
  try {
    res.json({ data: await getSessionStatus(resolveCompanyId(req)) });
  } catch (error) {
    next(error);
  }
}

export async function startSession(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const currentStatus = await getSessionStatus(empresaId);

    if (!['initializing', 'qr', 'authenticated', 'ready'].includes(currentStatus.status)) {
      await assertPlanLimit(empresaId, 'whatsapp');
    }

    const status = await requestWhatsappStartSession(empresaId);
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

export async function restartSession(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const status = await restartWhatsappSession(empresaId);
    await auditFromRequest(req, {
      accion: 'REINICIAR_SESION',
      modulo: 'whatsapp',
      descripcion: `Reinicio de sesion WhatsApp para empresa #${empresaId}`,
      empresaId
    });
    res.json({ data: status });
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
      descripcion: `Desconexion de sesion WhatsApp para empresa #${empresaId} conservando credenciales`,
      empresaId
    });
    res.json({ data: status });
  } catch (error) {
    next(error);
  }
}

export async function destroySession(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    const status = await destroyWhatsappSession(empresaId);
    await auditFromRequest(req, {
      accion: 'DESTRUIR_SESION',
      modulo: 'whatsapp',
      descripcion: `Destruccion de sesion WhatsApp para empresa #${empresaId}`,
      empresaId
    });
    res.json({ data: status });
  } catch (error) {
    next(error);
  }
}

export async function getQr(req, res, next) {
  try {
    const empresaId = resolveCompanyId(req);
    res.json({ data: await getWhatsappQr(empresaId) });
  } catch (error) {
    next(error);
  }
}

export async function listStatuses(req, res, next) {
  try {
    if (normalizeRole(req.auth.user.rol) !== ROLES.SUPER_ADMIN) {
      res.json({ data: [await getSessionStatus(req.auth.user.empresaId)] });
      return;
    }

    res.json({ data: await listSessions() });
  } catch (error) {
    next(error);
  }
}
