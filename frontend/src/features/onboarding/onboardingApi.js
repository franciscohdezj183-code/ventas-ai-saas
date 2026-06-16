import { api } from '../../config/api.js';

export async function fetchOnboardingStatus(params = {}) {
  const response = await api.get('/onboarding/status', { params });
  return response.data.data;
}

export async function createCompanyOnboarding(payload) {
  const response = await api.post('/onboarding/companies', payload);
  return response.data.data;
}
