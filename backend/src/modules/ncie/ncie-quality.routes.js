import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/access-control.middleware.js';
import { listNcieTenants, ncieQuality, updateNcieTenantEngine } from './ncie-quality.controller.js';

export const ncieQualityRouter = Router();

ncieQualityRouter.use(requireAuth, requireRole('super_admin'));
ncieQualityRouter.get('/quality', ncieQuality);
ncieQualityRouter.get('/tenants', listNcieTenants);
ncieQualityRouter.patch('/tenants/:empresaId/engine', updateNcieTenantEngine);
