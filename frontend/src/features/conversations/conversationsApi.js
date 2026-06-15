import { api } from '../../config/api.js';

export async function fetchConversations(filters = {}) {
  const response = await api.get('/conversations', { params: filters });
  return response.data.data;
}

export async function fetchInboxThreads(filters = {}) {
  const response = await api.get('/conversations/inbox/threads', { params: filters });
  return response.data.data;
}

export async function fetchInboxThread({ empresaId, telefono }) {
  const response = await api.get(`/conversations/inbox/threads/${empresaId}/${telefono}`);
  return response.data.data;
}

export async function pauseInboxThread({ empresaId, telefono }) {
  const response = await api.post(`/conversations/inbox/threads/${empresaId}/${telefono}/pause`);
  return response.data.data;
}

export async function resumeInboxThread({ empresaId, telefono }) {
  const response = await api.post(`/conversations/inbox/threads/${empresaId}/${telefono}/resume`);
  return response.data.data;
}

export async function sendInboxReply({ empresaId, telefono, mensaje }) {
  const response = await api.post(`/conversations/inbox/threads/${empresaId}/${telefono}/reply`, { mensaje });
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
