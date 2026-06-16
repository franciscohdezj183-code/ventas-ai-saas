import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import { getPlanUsage, listPlans } from './plans.controller.js';

export const plansRouter = Router();

plansRouter.use(requireAuth, attachTenantScope);

plansRouter.get('/', requirePermission('subscriptions.view'), listPlans);
plansRouter.get('/usage', requirePermission('subscriptions.view'), getPlanUsage);
