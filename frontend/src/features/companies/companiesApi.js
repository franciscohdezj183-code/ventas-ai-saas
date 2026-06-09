import { api } from '../../config/api.js';

export async function fetchCompanies() {
  const response = await api.get('/companies');
  return response.data.data;
}

export async function createCompany(payload) {
  const response = await api.post('/companies', payload);
  return response.data.data;
}

export async function updateCompany(id, payload) {
  const response = await api.put(`/companies/${id}`, payload);
  return response.data.data;
}

export async function deleteCompany(id) {
  await api.delete(`/companies/${id}`);
}
