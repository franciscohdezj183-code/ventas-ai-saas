import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { attachCompanyScope } from '../../middlewares/company-scope.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import {
  getConversation,
  getInboxThread,
  listInboxThreads,
  listConversations,
  pauseInboxThread,
  patchConversation,
  removeConversation,
  resumeInboxThread,
  sendInboxReply,
  storeConversation
} from './conversations.controller.js';

export const conversationsRouter = Router();

conversationsRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'), attachCompanyScope);

conversationsRouter.get('/inbox/threads', listInboxThreads);
conversationsRouter.get('/inbox/threads/:empresaId/:telefono', getInboxThread);
conversationsRouter.post('/inbox/threads/:empresaId/:telefono/pause', pauseInboxThread);
conversationsRouter.post('/inbox/threads/:empresaId/:telefono/resume', resumeInboxThread);
conversationsRouter.post('/inbox/threads/:empresaId/:telefono/reply', sendInboxReply);
conversationsRouter.get('/', listConversations);
conversationsRouter.post('/', storeConversation);
conversationsRouter.get('/:id', getConversation);
conversationsRouter.put('/:id', patchConversation);
conversationsRouter.delete('/:id', removeConversation);
