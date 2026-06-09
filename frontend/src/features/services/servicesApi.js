import { api } from '../../config/api.js';

export async function fetchServices() {
  const response = await api.get('/services');
  return response.data.data;
}

export async function createService(payload) {
  const response = await api.post('/services', payload);
  return response.data.data;
}

export async function updateService(id, payload) {
  const response = await api.put(`/services/${id}`, payload);
  return response.data.data;
}

export async function deleteService(id) {
  await api.delete(`/services/${id}`);
}
