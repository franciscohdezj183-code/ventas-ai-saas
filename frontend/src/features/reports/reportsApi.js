import { api } from '../../config/api.js';

export async function fetchReportsOverview(filters = {}) {
  const response = await api.get('/reports/overview', { params: filters });
  return response.data.data;
}
