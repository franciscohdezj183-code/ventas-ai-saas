import { api } from '../../config/api.js';

export async function fetchCommercialDashboard(filters = {}) {
  const response = await api.get('/dashboard/commercial', {
    params: filters
  });
  return response.data.data;
}
