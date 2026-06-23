import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import {
  closeInboxThread,
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

function preventConversationCache(req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}

conversationsRouter.use(preventConversationCache);
conversationsRouter.use(requireAuth, attachTenantScope);

conversationsRouter.get('/inbox/threads', requirePermission('conversations.view'), listInboxThreads);
conversationsRouter.get('/inbox/threads/:empresaId/:telefono', requirePermission('conversations.view'), getInboxThread);
conversationsRouter.post('/inbox/threads/:empresaId/:telefono/pause', requirePermission('conversations.manage'), pauseInboxThread);
conversationsRouter.post('/inbox/threads/:empresaId/:telefono/resume', requirePermission('conversations.manage'), resumeInboxThread);
conversationsRouter.post('/inbox/threads/:empresaId/:telefono/reply', requirePermission('conversations.manage'), sendInboxReply);
conversationsRouter.post('/inbox/threads/:empresaId/:telefono/close', requirePermission('conversations.manage'), closeInboxThread);
conversationsRouter.get('/', requirePermission('conversations.view'), listConversations);
conversationsRouter.post('/', requirePermission('conversations.manage'), storeConversation);
conversationsRouter.get('/:id', requirePermission('conversations.view'), getConversation);
conversationsRouter.put('/:id', requirePermission('conversations.manage'), patchConversation);
conversationsRouter.delete('/:id', requirePermission('conversations.manage'), removeConversation);
