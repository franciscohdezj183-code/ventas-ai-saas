import axios from 'axios';
import { getStoredToken } from '../features/auth/tokenStorage.js';

const configuredApiUrl = import.meta.env.VITE_API_URL;
const devApiUrl = '/api';

function isLocalApiUrl(value) {
  const parsedUrl = new URL(value);
  const hostname = parsedUrl.hostname.toLowerCase();

  return (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.startsWith('127.')
  );
}

function resolveApiUrl() {
  if (!configuredApiUrl) {
    throw new Error('VITE_API_URL is required. Create frontend/.env.local or set it in the deployment environment.');
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(configuredApiUrl);
  } catch {
    throw new Error('VITE_API_URL must be a valid URL');
  }

  if (import.meta.env.PROD && (parsedUrl.protocol !== 'https:' || isLocalApiUrl(configuredApiUrl))) {
    throw new Error('VITE_API_URL must use an https production domain');
  }

  if (!import.meta.env.PROD) {
    return devApiUrl;
  }

  return parsedUrl.toString().replace(/\/$/, '');
}

export const api = axios.create({
  baseURL: resolveApiUrl(),
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  return config;
});
