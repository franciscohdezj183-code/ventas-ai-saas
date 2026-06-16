import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
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

productsRouter.use(requireAuth, attachTenantScope);

productsRouter.get('/', requirePermission('products.view'), listProducts);
productsRouter.get('/insights', requirePermission('products.view'), catalogInsights);
productsRouter.post('/import', requirePermission('products.manage'), uploadProductsXlsx, importProductsFromExcel);
productsRouter.post('/', requirePermission('products.manage'), uploadProductImage, storeProduct);
productsRouter.get('/:id', requirePermission('products.view'), getProduct);
productsRouter.put('/:id', requirePermission('products.manage'), uploadProductImage, patchProduct);
productsRouter.delete('/:id', requirePermission('products.manage'), removeProduct);
