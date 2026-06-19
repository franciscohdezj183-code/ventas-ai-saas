import { api } from '../../config/api.js';

export async function fetchPlans() {
  const response = await api.get('/plans');
  return response.data.data;
}

export async function fetchPlanUsage(empresaId) {
  const response = await api.get('/plans/usage', {
    params: empresaId ? { empresa_id: empresaId } : {}
  });
  return response.data.data;
}
