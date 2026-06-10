import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { attachCompanyScope } from '../../middlewares/company-scope.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import {
  commercialDashboard,
  dashboardSummary,
  recentErrors,
  topProducts,
  topServices
} from './dashboard.controller.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'), attachCompanyScope);

dashboardRouter.get('/commercial', commercialDashboard);
dashboardRouter.get('/commercial/summary', dashboardSummary);
dashboardRouter.get('/commercial/top-products', topProducts);
dashboardRouter.get('/commercial/top-services', topServices);
dashboardRouter.get('/commercial/errors', recentErrors);
