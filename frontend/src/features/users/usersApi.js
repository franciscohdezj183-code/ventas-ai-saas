import { api } from '../../config/api.js';

export async function fetchUsers() {
  const response = await api.get('/users');
  return response.data.data;
}

export async function createUser(payload) {
  const response = await api.post('/users', payload);
  return response.data.data;
}

export async function updateUser(id, payload) {
  const response = await api.put(`/users/${id}`, payload);
  return response.data.data;
}

export async function deleteUser(id) {
  await api.delete(`/users/${id}`);
}
