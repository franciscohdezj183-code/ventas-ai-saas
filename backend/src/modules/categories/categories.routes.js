import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import {
  getCategory,
  listCategories,
  patchCategory,
  removeCategory,
  storeCategory
} from './categories.controller.js';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth, attachTenantScope);

categoriesRouter.get('/', requirePermission('products.view'), listCategories);
categoriesRouter.post('/', requirePermission('products.manage'), storeCategory);
categoriesRouter.get('/:id', requirePermission('products.view'), getCategory);
categoriesRouter.put('/:id', requirePermission('products.manage'), patchCategory);
categoriesRouter.delete('/:id', requirePermission('products.manage'), removeCategory);
