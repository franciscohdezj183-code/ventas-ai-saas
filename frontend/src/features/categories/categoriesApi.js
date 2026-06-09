import { api } from '../../config/api.js';

export async function fetchCategories() {
  const response = await api.get('/categories');
  return response.data.data;
}

export async function createCategory(payload) {
  const response = await api.post('/categories', payload);
  return response.data.data;
}

export async function updateCategory(id, payload) {
  const response = await api.put(`/categories/${id}`, payload);
  return response.data.data;
}

export async function deleteCategory(id) {
  await api.delete(`/categories/${id}`);
}
