import { api } from '../../config/api.js';

export async function fetchAIStatus() {
  const response = await api.get('/ai/status');
  return response.data.data;
}
