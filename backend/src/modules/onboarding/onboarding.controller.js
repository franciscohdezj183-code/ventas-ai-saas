import { getOnboardingStatus } from './onboarding.service.js';

export async function onboardingStatus(req, res, next) {
  try {
    res.json({
      data: await getOnboardingStatus(req.auth, req.query.empresa_id)
    });
  } catch (error) {
    next(error);
  }
}
