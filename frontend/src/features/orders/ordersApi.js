import { api } from '../../config/api.js';

export async function fetchOrders() {
  const response = await api.get('/orders');
  return response.data.data;
}

export async function createOrder(payload) {
  const response = await api.post('/orders', payload);
  return response.data.data;
}

export async function updateOrder(id, payload) {
  const response = await api.put(`/orders/${id}`, payload);
  return response.data.data;
}

export async function deleteOrder(id) {
  await api.delete(`/orders/${id}`);
}
