import {
  deleteCompanySettings,
  findCompanySettings,
  findCompanySettingsByCompanyId,
  upsertCompanySettings
} from './company-settings.service.js';

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

    res.json({ data: settings });
  } catch (error) {
    next(error);
  }
}

export async function removeCompanySettings(req, res, next) {
  try {
    await deleteCompanySettings(req.params.empresaId ?? req.body.empresa_id, req.auth);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
