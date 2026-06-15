import { api } from '../../config/api.js';

export async function fetchOnboardingStatus(params = {}) {
  const response = await api.get('/onboarding/status', { params });
  return response.data.data;
}
