import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { attachCompanyScope } from '../../middlewares/company-scope.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import { uploadProductImage, uploadProductsXlsx } from '../../middlewares/upload.middleware.js';
import {
  catalogInsights,
  getProduct,
  importProductsFromExcel,
  listProducts,
  patchProduct,
  removeProduct,
  storeProduct
} from './products.controller.js';

export const productsRouter = Router();

productsRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'), attachCompanyScope);

productsRouter.get('/', listProducts);
productsRouter.get('/insights', catalogInsights);
productsRouter.post('/import', uploadProductsXlsx, importProductsFromExcel);
productsRouter.post('/', uploadProductImage, storeProduct);
productsRouter.get('/:id', getProduct);
productsRouter.put('/:id', uploadProductImage, patchProduct);
productsRouter.delete('/:id', removeProduct);
