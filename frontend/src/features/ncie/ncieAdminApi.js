import { api } from '../../config/api.js';

export async function fetchNcieTenants() {
  const response = await api.get('/admin/ncie/tenants');
  return response.data.data;
}

export async function fetchNcieQuality(empresaId) {
  const response = await api.get('/admin/ncie/quality', {
    params: empresaId ? { empresa_id: empresaId } : undefined
  });
  return response.data.data;
}

export async function updateNcieTenantEngine(empresaId, payload) {
  const response = await api.patch(`/admin/ncie/tenants/${empresaId}/engine`, payload);
  return response.data.data;
}
