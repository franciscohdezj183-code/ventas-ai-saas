import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import { reportsOverview } from './reports.controller.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requirePermission('reports.view'), attachTenantScope);

reportsRouter.get('/overview', reportsOverview);
