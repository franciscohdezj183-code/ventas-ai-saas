import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import {
  disconnectSession,
  getQr,
  getStatus,
  listStatuses,
  startSession
} from './whatsapp.controller.js';

export const whatsappRouter = Router();

whatsappRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'));

whatsappRouter.get('/sessions', listStatuses);
whatsappRouter.post('/sessions/:empresaId/start', startSession);
whatsappRouter.get('/sessions/:empresaId/status', getStatus);
whatsappRouter.get('/sessions/:empresaId/qr', getQr);
whatsappRouter.post('/sessions/:empresaId/disconnect', disconnectSession);
whatsappRouter.post('/session/start', startSession);
whatsappRouter.get('/session/status', getStatus);
whatsappRouter.get('/session/qr', getQr);
whatsappRouter.post('/session/disconnect', disconnectSession);
