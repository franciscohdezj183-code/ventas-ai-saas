import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { attachCompanyScope } from '../../middlewares/company-scope.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import {
  getCompany,
  listCompanies,
  patchCompany,
  removeCompany,
  storeCompany
} from './companies.controller.js';

export const companiesRouter = Router();

companiesRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'), attachCompanyScope);

companiesRouter.get('/', listCompanies);
companiesRouter.get('/:id', getCompany);
companiesRouter.put('/:id', patchCompany);

companiesRouter.use(authorizeRoles('SUPER_ADMIN'));
companiesRouter.post('/', storeCompany);
companiesRouter.delete('/:id', removeCompany);
