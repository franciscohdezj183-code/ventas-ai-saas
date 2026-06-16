import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission, requireRole } from '../../middlewares/access-control.middleware.js';
import {
  getCompanySettings,
  listCompanySettings,
  removeCompanySettings,
  saveCompanySettings
} from './company-settings.controller.js';

export const companySettingsRouter = Router();

companySettingsRouter.use(requireAuth, attachTenantScope);

companySettingsRouter.get('/', requirePermission('ai_config.view'), listCompanySettings);
companySettingsRouter.put('/', requireRole('owner'), saveCompanySettings);
companySettingsRouter.get('/:empresaId', requirePermission('ai_config.view'), getCompanySettings);
companySettingsRouter.put('/:empresaId', requireRole('owner'), saveCompanySettings);
companySettingsRouter.delete('/:empresaId', requireRole('owner'), removeCompanySettings);
