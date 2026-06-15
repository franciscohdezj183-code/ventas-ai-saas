import { api } from '../../config/api.js';

function toProductFormData(payload) {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, value);
    }
  });

  return formData;
}

export async function fetchProducts(params = {}) {
  const response = await api.get('/products', { params });
  return {
    data: response.data.data,
    meta: response.data.meta
  };
}

export async function fetchCatalogInsights() {
  const response = await api.get('/products/insights');
  return response.data.data;
}

export async function createProduct(payload) {
  const response = await api.post('/products', toProductFormData(payload), {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.data;
}

export async function updateProduct(id, payload) {
  const response = await api.put(`/products/${id}`, toProductFormData(payload), {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.data;
}

export async function deleteProduct(id) {
  await api.delete(`/products/${id}`);
}

export async function importProducts(payload) {
  const formData = new FormData();

  formData.append('archivo', payload.archivo);

  if (payload.empresa_id) {
    formData.append('empresa_id', payload.empresa_id);
  }

  const response = await api.post('/products/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return response.data.data;
}
