import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { attachCompanyScope } from '../../middlewares/company-scope.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import {
  getCategory,
  listCategories,
  patchCategory,
  removeCategory,
  storeCategory
} from './categories.controller.js';

export const categoriesRouter = Router();

categoriesRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'), attachCompanyScope);

categoriesRouter.get('/', listCategories);
categoriesRouter.post('/', storeCategory);
categoriesRouter.get('/:id', getCategory);
categoriesRouter.put('/:id', patchCategory);
categoriesRouter.delete('/:id', removeCategory);
