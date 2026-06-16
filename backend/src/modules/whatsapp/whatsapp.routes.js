import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import {
  disconnectSession,
  getQr,
  getStatus,
  listStatuses,
  startSession
} from './whatsapp.controller.js';

export const whatsappRouter = Router();

whatsappRouter.use(requireAuth, attachTenantScope);

whatsappRouter.get('/sessions', requirePermission('whatsapp.view'), listStatuses);
whatsappRouter.post('/sessions/:empresaId/start', requirePermission('whatsapp.manage'), startSession);
whatsappRouter.get('/sessions/:empresaId/status', requirePermission('whatsapp.view'), getStatus);
whatsappRouter.get('/sessions/:empresaId/qr', requirePermission('whatsapp.manage'), getQr);
whatsappRouter.post('/sessions/:empresaId/disconnect', requirePermission('whatsapp.manage'), disconnectSession);
whatsappRouter.post('/session/start', requirePermission('whatsapp.manage'), startSession);
whatsappRouter.get('/session/status', requirePermission('whatsapp.view'), getStatus);
whatsappRouter.get('/session/qr', requirePermission('whatsapp.manage'), getQr);
whatsappRouter.post('/session/disconnect', requirePermission('whatsapp.manage'), disconnectSession);
