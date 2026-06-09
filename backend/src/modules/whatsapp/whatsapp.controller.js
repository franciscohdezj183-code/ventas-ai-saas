import {
  disconnectWhatsappSession,
  getWhatsappStatus,
  listWhatsappStatuses,
  startWhatsappSession
} from './whatsapp.service.js';

function resolveCompanyId(req) {
  if (req.auth.user.rol === 'SUPER_ADMIN') {
    return req.params.empresaId ?? req.body.empresa_id ?? req.query.empresa_id;
  }

  return req.auth.user.empresaId;
}

export async function startSession(req, res, next) {
  try {
    res.json({ data: await startWhatsappSession(resolveCompanyId(req)) });
  } catch (error) {
    next(error);
  }
}

export function getStatus(req, res, next) {
  try {
    res.json({ data: getWhatsappStatus(resolveCompanyId(req)) });
  } catch (error) {
    next(error);
  }
}

export function getQr(req, res, next) {
  try {
    const status = getWhatsappStatus(resolveCompanyId(req));
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

export function listStatuses(req, res) {
  if (req.auth.user.rol !== 'SUPER_ADMIN') {
    res.json({ data: [getWhatsappStatus(req.auth.user.empresaId)] });
    return;
  }

  res.json({ data: listWhatsappStatuses() });
}

export async function disconnectSession(req, res, next) {
  try {
    res.json({ data: await disconnectWhatsappSession(resolveCompanyId(req)) });
  } catch (error) {
    next(error);
  }
}
