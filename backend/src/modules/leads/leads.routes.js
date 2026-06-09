import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import { getLead, leadStats, listLeads, patchLead, removeLead, storeLead } from './leads.controller.js';

export const leadsRouter = Router();

leadsRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'));

leadsRouter.get('/', listLeads);
leadsRouter.get('/stats', leadStats);
leadsRouter.post('/', storeLead);
leadsRouter.get('/:id', getLead);
leadsRouter.put('/:id', patchLead);
leadsRouter.delete('/:id', removeLead);
