import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { attachCompanyScope } from '../../middlewares/company-scope.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import { onboardingStatus } from './onboarding.controller.js';

export const onboardingRouter = Router();

onboardingRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'), attachCompanyScope);
onboardingRouter.get('/status', onboardingStatus);
