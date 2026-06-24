import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import {
  getCompanySettings,
  listCompanySettings,
  removeCompanySettings,
  saveCompanySettings
} from './company-settings.controller.js';

export const companySettingsRouter = Router();

companySettingsRouter.use(requireAuth, attachTenantScope);

companySettingsRouter.get('/', requirePermission('ai_config.view'), listCompanySettings);
companySettingsRouter.put('/', requirePermission('ai_config.manage'), saveCompanySettings);
companySettingsRouter.get('/:empresaId', requirePermission('ai_config.view'), getCompanySettings);
companySettingsRouter.put('/:empresaId', requirePermission('ai_config.manage'), saveCompanySettings);
companySettingsRouter.delete('/:empresaId', requirePermission('ai_config.manage'), removeCompanySettings);
