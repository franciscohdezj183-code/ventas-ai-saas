import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import {
  aiHealth,
  aiStatus,
  checkAIHealth,
  testIntent,
  testReply
} from './ai.controller.js';
import { monthlyAIUsage } from '../ai-usage/ai-usage.controller.js';

export const aiRouter = Router();

aiRouter.use(requireAuth, attachTenantScope);

aiRouter.get('/status', requirePermission('ai_config.view'), aiStatus);
aiRouter.get('/health', requirePermission('ai_config.view'), aiHealth);
aiRouter.post('/health/check', requirePermission('ai_config.manage'), checkAIHealth);
aiRouter.get('/usage/monthly', requirePermission('reports.view'), monthlyAIUsage);
aiRouter.post('/test-intent', requirePermission('ai_config.manage'), testIntent);
aiRouter.post('/test-reply', requirePermission('ai_config.manage'), testReply);
