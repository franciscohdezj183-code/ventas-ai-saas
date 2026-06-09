import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import {
  getCompany,
  listCompanies,
  patchCompany,
  removeCompany,
  storeCompany
} from './companies.controller.js';

export const companiesRouter = Router();

companiesRouter.use(authenticate, authorizeRoles('SUPER_ADMIN'));

companiesRouter.get('/', listCompanies);
companiesRouter.post('/', storeCompany);
companiesRouter.get('/:id', getCompany);
companiesRouter.put('/:id', patchCompany);
companiesRouter.delete('/:id', removeCompany);
