import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import {
  disconnectSession,
  getQr,
  getStatus,
  listStatuses,
  restartSession,
  setSessionProvider,
  startSession
} from './whatsapp.controller.js';

export const whatsappRouter = Router();

whatsappRouter.use(requireAuth, attachTenantScope);

whatsappRouter.get('/sessions', requirePermission('whatsapp.view'), listStatuses);
whatsappRouter.post('/sessions/:empresaId/start', requirePermission('whatsapp.manage'), startSession);
whatsappRouter.get('/sessions/:empresaId/status', requirePermission('whatsapp.view'), getStatus);
whatsappRouter.get('/sessions/:empresaId/qr', requirePermission('whatsapp.manage'), getQr);
whatsappRouter.post('/sessions/:empresaId/disconnect', requirePermission('whatsapp.manage'), disconnectSession);
whatsappRouter.post('/sessions/:empresaId/restart', requirePermission('whatsapp.manage'), restartSession);
whatsappRouter.put('/sessions/:empresaId/provider', requirePermission('whatsapp.manage'), setSessionProvider);
whatsappRouter.post('/session/start', requirePermission('whatsapp.manage'), startSession);
whatsappRouter.get('/session/status', requirePermission('whatsapp.view'), getStatus);
whatsappRouter.get('/session/qr', requirePermission('whatsapp.manage'), getQr);
whatsappRouter.post('/session/disconnect', requirePermission('whatsapp.manage'), disconnectSession);
whatsappRouter.post('/session/restart', requirePermission('whatsapp.manage'), restartSession);
