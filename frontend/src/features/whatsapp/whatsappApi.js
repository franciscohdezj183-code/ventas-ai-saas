import { api } from '../../config/api.js';

export async function startWhatsappSession(empresaId) {
  const path = empresaId ? `/whatsapp/sessions/${empresaId}/start` : '/whatsapp/session/start';
  const response = await api.post(path);
  return response.data.data;
}

export async function fetchWhatsappStatus(empresaId) {
  const path = empresaId ? `/whatsapp/sessions/${empresaId}/status` : '/whatsapp/session/status';
  const response = await api.get(path);
  return response.data.data;
}

export async function fetchWhatsappQr(empresaId) {
  const path = empresaId ? `/whatsapp/sessions/${empresaId}/qr` : '/whatsapp/session/qr';
  const response = await api.get(path);
  return response.data.data;
}

export async function disconnectWhatsappSession(empresaId) {
  const path = empresaId
    ? `/whatsapp/sessions/${empresaId}/disconnect`
    : '/whatsapp/session/disconnect';
  const response = await api.post(path);
  return response.data.data;
}
