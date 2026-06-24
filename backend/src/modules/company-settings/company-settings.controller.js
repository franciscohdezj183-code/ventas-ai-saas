import {
  deleteCompanySettings,
  findCompanySettings,
  findCompanySettingsByCompanyId,
  upsertCompanySettings
} from './company-settings.service.js';
import { auditFromRequest } from '../audit/audit.service.js';
import { resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';

export async function listCompanySettings(req, res, next) {
  try {
    res.json({ data: await findCompanySettings(req.auth) });
  } catch (error) {
    next(error);
  }
}

export async function getCompanySettings(req, res, next) {
  try {
    const settings = await findCompanySettingsByCompanyId(req.params.empresaId, req.auth);

    if (!settings) {
      res.status(404).json({ message: 'Configuracion no encontrada' });
      return;
    }

    res.json({ data: settings });
  } catch (error) {
    next(error);
  }
}

export async function saveCompanySettings(req, res, next) {
  try {
    const settings = await upsertCompanySettings(
      {
        ...req.body,
        empresa_id: req.params.empresaId ?? req.body.empresa_id
      },
      req.auth
    );

    await auditFromRequest(req, {
      accion: 'ACTUALIZAR',
      modulo: 'configuracion_ia',
      descripcion: `Configuracion IA actualizada para empresa #${settings.empresa_id}`,
      empresaId: settings.empresa_id
    });

    res.json({ data: settings });
  } catch (error) {
    next(error);
  }
}

export async function removeCompanySettings(req, res, next) {
  try {
    const requestedEmpresaId = req.params.empresaId ?? req.body.empresa_id;
    const empresaId = resolveScopedEmpresaId(req.auth, requestedEmpresaId);
    await deleteCompanySettings(empresaId, req.auth);
    await auditFromRequest(req, {
      accion: 'ELIMINAR',
      modulo: 'configuracion_ia',
      descripcion: `Configuracion IA restablecida para empresa #${empresaId}`,
      empresaId
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
