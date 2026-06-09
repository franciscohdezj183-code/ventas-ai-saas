import { api } from '../../config/api.js';

export async function fetchCommercialDashboard() {
  const response = await api.get('/dashboard/commercial');
  return response.data.data;
}
