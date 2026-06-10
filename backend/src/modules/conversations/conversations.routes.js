import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { attachCompanyScope } from '../../middlewares/company-scope.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import {
  getConversation,
  listConversations,
  patchConversation,
  removeConversation,
  storeConversation
} from './conversations.controller.js';

export const conversationsRouter = Router();

conversationsRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'), attachCompanyScope);

conversationsRouter.get('/', listConversations);
conversationsRouter.post('/', storeConversation);
conversationsRouter.get('/:id', getConversation);
conversationsRouter.put('/:id', patchConversation);
conversationsRouter.delete('/:id', removeConversation);
