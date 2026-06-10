import { api } from '../../config/api.js';

export async function fetchBotPromptCatalog() {
  const response = await api.get('/bot-prompts');
  return response.data.data;
}

export async function saveBotPromptTemplate(payload) {
  const path = payload.id ? `/bot-prompts/templates/${payload.id}` : '/bot-prompts/templates';
  const method = payload.id ? 'put' : 'post';
  const response = await api[method](path, payload);
  return response.data.data;
}

export async function deleteBotPromptTemplate(templateId) {
  await api.delete(`/bot-prompts/templates/${templateId}`);
}

export async function saveBotResponseSettings(payload) {
  const response = await api.put('/bot-prompts/settings', payload);
  return response.data.data;
}

export async function previewBotPrompt(payload) {
  const response = await api.post('/bot-prompts/preview', payload);
  return response.data.data;
}
