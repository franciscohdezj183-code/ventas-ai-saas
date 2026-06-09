import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import { uploadProductImage, uploadProductsXlsx } from '../../middlewares/upload.middleware.js';
import {
  getProduct,
  importProductsFromExcel,
  listProducts,
  patchProduct,
  removeProduct,
  storeProduct
} from './products.controller.js';

export const productsRouter = Router();

productsRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'));

productsRouter.get('/', listProducts);
productsRouter.post('/import', uploadProductsXlsx, importProductsFromExcel);
productsRouter.post('/', uploadProductImage, storeProduct);
productsRouter.get('/:id', getProduct);
productsRouter.put('/:id', uploadProductImage, patchProduct);
productsRouter.delete('/:id', removeProduct);
