import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission, requireRole } from '../../middlewares/access-control.middleware.js';
import { onboardingStatus, storeCompanyOnboarding } from './onboarding.controller.js';

export const onboardingRouter = Router();

onboardingRouter.use(requireAuth, attachTenantScope);
onboardingRouter.get('/status', requirePermission('reports.view'), onboardingStatus);
onboardingRouter.post('/companies', requireRole('super_admin'), storeCompanyOnboarding);
