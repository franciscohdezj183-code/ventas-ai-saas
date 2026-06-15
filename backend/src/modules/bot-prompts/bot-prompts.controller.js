import {
  BUSINESS_TYPES,
  deleteTemplate,
  listResponseSettings,
  listTemplates,
  saveResponseSettings,
  saveTemplate
} from './bot-prompts.service.js';
import { previewBotResponse } from './bot-preview.service.js';

export async function getPromptCatalog(req, res, next) {
  try {
    res.json({
      data: {
        tipos_negocio: BUSINESS_TYPES,
        templates: await listTemplates(),
        settings: await listResponseSettings()
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function upsertTemplate(req, res, next) {
  try {
    res.json({ data: await saveTemplate({ ...req.body, id: req.params.templateId ?? req.body.id }) });
  } catch (error) {
    next(error);
  }
}

export async function removeTemplate(req, res, next) {
  try {
    await deleteTemplate(req.params.templateId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function upsertResponseSettings(req, res, next) {
  try {
    res.json({ data: await saveResponseSettings(req.body) });
  } catch (error) {
    next(error);
  }
}

export async function previewResponse(req, res, next) {
  try {
    res.json({ data: await previewBotResponse(req.body) });
  } catch (error) {
    next(error);
  }
}
