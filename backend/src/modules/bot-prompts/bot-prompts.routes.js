import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import {
  getPromptCatalog,
  previewResponse,
  removeTemplate,
  upsertResponseSettings,
  upsertTemplate
} from './bot-prompts.controller.js';

export const botPromptsRouter = Router();

botPromptsRouter.use(authenticate, authorizeRoles('SUPER_ADMIN'));

botPromptsRouter.get('/', getPromptCatalog);
botPromptsRouter.post('/templates', upsertTemplate);
botPromptsRouter.put('/templates/:templateId', upsertTemplate);
botPromptsRouter.delete('/templates/:templateId', removeTemplate);
botPromptsRouter.put('/settings', upsertResponseSettings);
botPromptsRouter.post('/preview', previewResponse);
