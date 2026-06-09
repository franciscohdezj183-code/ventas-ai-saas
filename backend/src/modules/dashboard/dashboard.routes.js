import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import { commercialDashboard } from './dashboard.controller.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'));

dashboardRouter.get('/commercial', commercialDashboard);
