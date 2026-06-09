import { getCommercialDashboard } from './dashboard.service.js';

export async function commercialDashboard(req, res, next) {
  try {
    res.json({ data: await getCommercialDashboard(req.auth) });
  } catch (error) {
    next(error);
  }
}
