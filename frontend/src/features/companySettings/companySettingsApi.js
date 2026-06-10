import { api } from '../../config/api.js';

export async function fetchCompanySettings() {
  const response = await api.get('/configuracion-empresa');
  return response.data.data;
}

export async function fetchCompanySetting(empresaId) {
  const response = await api.get(`/configuracion-empresa/${empresaId}`);
  return response.data.data;
}

export async function saveCompanySetting(payload) {
  const path = payload.empresa_id ? `/configuracion-empresa/${payload.empresa_id}` : '/configuracion-empresa';
  const response = await api.put(path, payload);
  return response.data.data;
}

export async function deleteCompanySetting(empresaId) {
  await api.delete(`/configuracion-empresa/${empresaId}`);
}
