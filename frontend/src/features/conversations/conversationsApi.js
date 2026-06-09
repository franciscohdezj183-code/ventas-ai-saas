import { api } from '../../config/api.js';

export async function fetchConversations(filters = {}) {
  const response = await api.get('/conversations', { params: filters });
  return response.data.data;
}

export async function createConversation(payload) {
  const response = await api.post('/conversations', payload);
  return response.data.data;
}

export async function updateConversation(id, payload) {
  const response = await api.put(`/conversations/${id}`, payload);
  return response.data.data;
}

export async function deleteConversation(id) {
  await api.delete(`/conversations/${id}`);
}
