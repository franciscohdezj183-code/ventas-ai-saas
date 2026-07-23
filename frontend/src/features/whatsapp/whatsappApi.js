import { api } from '../../config/api.js';
import { getStoredToken } from '../auth/tokenStorage.js';

export function resolveSocketUrl() {
  const configuredApiUrl = import.meta.env.VITE_API_URL;

  if (configuredApiUrl) {
    return new URL(configuredApiUrl).origin;
  }

  if (api.defaults.baseURL?.startsWith('http')) {
    return new URL(api.defaults.baseURL).origin;
  }

  return window.location.origin;
}

export function resolveSocketPath() {
  const configuredSocketPath = import.meta.env.VITE_SOCKET_IO_PATH ?? import.meta.env.VITE_SOCKET_PATH;

  if (configuredSocketPath) {
    return configuredSocketPath.startsWith('/') ? configuredSocketPath : `/${configuredSocketPath}`;
  }

  const configuredApiUrl = import.meta.env.VITE_API_URL;

  if (configuredApiUrl) {
    const pathname = new URL(configuredApiUrl).pathname.replace(/\/$/, '');
    return `${pathname}/socket.io`;
  }

  return '/api/socket.io';
}

export function getWhatsappSocketToken() {
  return getStoredToken();
}

export function resolveSocketTransports() {
  const configuredTransports = import.meta.env.VITE_SOCKET_TRANSPORTS;

  if (!configuredTransports) {
    return ['polling'];
  }

  return configuredTransports
    .split(',')
    .map((transport) => transport.trim())
    .filter(Boolean);
}

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

export async function restartWhatsappSession(empresaId) {
  const path = empresaId ? `/whatsapp/sessions/${empresaId}/restart` : '/whatsapp/session/restart';
  const response = await api.post(path);
  return response.data.data;
}

export async function destroyWhatsappSession(empresaId) {
  const path = empresaId ? `/whatsapp/sessions/${empresaId}` : '/whatsapp/session';
  const response = await api.delete(path);
  return response.data.data;
}

export async function disconnectWhatsappSession(empresaId) {
  const path = empresaId
    ? `/whatsapp/sessions/${empresaId}/disconnect`
    : '/whatsapp/session/disconnect';
  const response = await api.post(path);
  return response.data.data;
}
