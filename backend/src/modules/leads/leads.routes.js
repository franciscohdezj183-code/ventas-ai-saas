import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import { getLead, leadStats, listLeads, patchLead, removeLead, storeLead } from './leads.controller.js';

export const leadsRouter = Router();

leadsRouter.use(requireAuth, attachTenantScope);

leadsRouter.get('/', requirePermission('customers.view'), listLeads);
leadsRouter.get('/stats', requirePermission('reports.view'), leadStats);
leadsRouter.post('/', requirePermission('customers.manage'), storeLead);
leadsRouter.get('/:id', requirePermission('customers.view'), getLead);
leadsRouter.put('/:id', requirePermission('customers.manage'), patchLead);
leadsRouter.delete('/:id', requirePermission('customers.manage'), removeLead);
