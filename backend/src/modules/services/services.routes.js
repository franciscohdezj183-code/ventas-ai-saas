import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import {
  getService,
  listServices,
  patchService,
  removeService,
  storeService
} from './services.controller.js';

export const servicesRouter = Router();

servicesRouter.use(requireAuth, attachTenantScope);

servicesRouter.get('/', requirePermission('products.view'), listServices);
servicesRouter.post('/', requirePermission('products.manage'), storeService);
servicesRouter.get('/:id', requirePermission('products.view'), getService);
servicesRouter.put('/:id', requirePermission('products.manage'), patchService);
servicesRouter.delete('/:id', requirePermission('products.manage'), removeService);
