import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import { aiStatus, testReply } from './ai.controller.js';

export const aiRouter = Router();

aiRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'));

aiRouter.get('/status', aiStatus);
aiRouter.post('/test-reply', testReply);
