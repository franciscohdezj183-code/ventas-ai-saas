import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission, requireRole } from '../../middlewares/access-control.middleware.js';
import { uploadCompanyLogo } from '../../middlewares/upload.middleware.js';
import {
  getCompany,
  impersonateOwner,
  listCompanies,
  patchCompany,
  removeCompany,
  saasGlobalOverview,
  storeCompany
} from './companies.controller.js';

export const companiesRouter = Router();

companiesRouter.use(requireAuth, attachTenantScope);

companiesRouter.get('/', requirePermission('tenants.view'), listCompanies);
companiesRouter.get('/saas/global', requireRole('super_admin'), saasGlobalOverview);
companiesRouter.get('/:id', requirePermission('tenants.view'), getCompany);
companiesRouter.put('/:id', requirePermission('tenants.manage'), uploadCompanyLogo, patchCompany);

companiesRouter.use(requireRole('super_admin'));
companiesRouter.post('/:id/impersonate', impersonateOwner);
companiesRouter.post('/', uploadCompanyLogo, storeCompany);
companiesRouter.delete('/:id', removeCompany);
