import { api } from '../../config/api.js';

export async function fetchLeads() {
  const response = await api.get('/leads');
  return response.data.data;
}

export async function fetchLeadStats() {
  const response = await api.get('/leads/stats');
  return response.data.data;
}

export async function createLead(payload) {
  const response = await api.post('/leads', payload);
  return response.data.data;
}

export async function updateLead(id, payload) {
  const response = await api.put(`/leads/${id}`, payload);
  return response.data.data;
}

export async function deleteLead(id) {
  await api.delete(`/leads/${id}`);
}
