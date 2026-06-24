import { api } from '../../config/api.js';

export async function fetchAIStatus() {
  const response = await api.get('/ai/status');
  return response.data.data;
}

export async function checkAIHealth() {
  const response = await api.post('/ai/health/check');
  return response.data.data;
}
