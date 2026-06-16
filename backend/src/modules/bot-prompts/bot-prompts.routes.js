import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/access-control.middleware.js';
import {
  getPromptCatalog,
  previewResponse,
  removeTemplate,
  upsertResponseSettings,
  upsertTemplate
} from './bot-prompts.controller.js';

export const botPromptsRouter = Router();

botPromptsRouter.use(requireAuth, requireRole('super_admin'));

botPromptsRouter.get('/', getPromptCatalog);
botPromptsRouter.post('/templates', upsertTemplate);
botPromptsRouter.put('/templates/:templateId', upsertTemplate);
botPromptsRouter.delete('/templates/:templateId', removeTemplate);
botPromptsRouter.put('/settings', upsertResponseSettings);
botPromptsRouter.post('/preview', previewResponse);
