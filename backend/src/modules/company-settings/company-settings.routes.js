import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { attachCompanyScope } from '../../middlewares/company-scope.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import {
  getCompanySettings,
  listCompanySettings,
  removeCompanySettings,
  saveCompanySettings
} from './company-settings.controller.js';

export const companySettingsRouter = Router();

companySettingsRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'), attachCompanyScope);

companySettingsRouter.get('/', listCompanySettings);
companySettingsRouter.put('/', saveCompanySettings);
companySettingsRouter.get('/:empresaId', getCompanySettings);
companySettingsRouter.put('/:empresaId', saveCompanySettings);
companySettingsRouter.delete('/:empresaId', removeCompanySettings);
