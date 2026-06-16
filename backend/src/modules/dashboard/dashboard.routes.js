import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import {
  commercialDashboard,
  dashboardSummary,
  recentErrors,
  topProducts,
  topServices
} from './dashboard.controller.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requirePermission('reports.view'), attachTenantScope);

dashboardRouter.get('/commercial', commercialDashboard);
dashboardRouter.get('/commercial/summary', dashboardSummary);
dashboardRouter.get('/commercial/top-products', topProducts);
dashboardRouter.get('/commercial/top-services', topServices);
dashboardRouter.get('/commercial/errors', recentErrors);
