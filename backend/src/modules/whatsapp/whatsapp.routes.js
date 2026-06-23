import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import {
  destroySession,
  disconnectSession,
  getQr,
  getStatus,
  listStatuses,
  restartSession,
  startSession
} from './whatsapp.controller.js';

export const whatsappRouter = Router();

whatsappRouter.use(requireAuth, attachTenantScope);

whatsappRouter.get('/sessions', requirePermission('whatsapp.view'), listStatuses);

whatsappRouter.get('/session/status', requirePermission('whatsapp.view'), getStatus);
whatsappRouter.post('/session/start', requirePermission('whatsapp.manage'), startSession);
whatsappRouter.post('/session/restart', requirePermission('whatsapp.manage'), restartSession);
whatsappRouter.post('/session/disconnect', requirePermission('whatsapp.manage'), disconnectSession);
whatsappRouter.delete('/session', requirePermission('whatsapp.manage'), destroySession);
whatsappRouter.get('/session/qr', requirePermission('whatsapp.manage'), getQr);

// Compatibility routes for super-admin company selection in the current UI.
whatsappRouter.get('/sessions/:empresaId/status', requirePermission('whatsapp.view'), getStatus);
whatsappRouter.post('/sessions/:empresaId/start', requirePermission('whatsapp.manage'), startSession);
whatsappRouter.post('/sessions/:empresaId/restart', requirePermission('whatsapp.manage'), restartSession);
whatsappRouter.post('/sessions/:empresaId/disconnect', requirePermission('whatsapp.manage'), disconnectSession);
whatsappRouter.delete('/sessions/:empresaId', requirePermission('whatsapp.manage'), destroySession);
whatsappRouter.get('/sessions/:empresaId/qr', requirePermission('whatsapp.manage'), getQr);
