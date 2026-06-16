import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import { getOrder, listOrders, patchOrder, removeOrder, storeOrder } from './orders.controller.js';

export const ordersRouter = Router();

ordersRouter.use(requireAuth, attachTenantScope);

ordersRouter.get('/', requirePermission('orders.view'), listOrders);
ordersRouter.post('/', requirePermission('orders.manage'), storeOrder);
ordersRouter.get('/:id', requirePermission('orders.view'), getOrder);
ordersRouter.put('/:id', requirePermission('orders.manage'), patchOrder);
ordersRouter.delete('/:id', requirePermission('orders.manage'), removeOrder);
