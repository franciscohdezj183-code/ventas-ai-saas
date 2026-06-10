import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { attachCompanyScope } from '../../middlewares/company-scope.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import {
  getService,
  listServices,
  patchService,
  removeService,
  storeService
} from './services.controller.js';

export const servicesRouter = Router();

servicesRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'), attachCompanyScope);

servicesRouter.get('/', listServices);
servicesRouter.post('/', storeService);
servicesRouter.get('/:id', getService);
servicesRouter.put('/:id', patchService);
servicesRouter.delete('/:id', removeService);
