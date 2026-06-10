import {
  getCommercialDashboard,
  getDashboardSummary,
  getRecentErrors,
  getTopProducts,
  getTopServices
} from './dashboard.service.js';

export async function commercialDashboard(req, res, next) {
  try {
    res.json({ data: await getCommercialDashboard(req.auth, req.query) });
  } catch (error) {
    next(error);
  }
}

export async function dashboardSummary(req, res, next) {
  try {
    res.json({ data: await getDashboardSummary(req.auth, req.query) });
  } catch (error) {
    next(error);
  }
}

export async function topProducts(req, res, next) {
  try {
    res.json({ data: await getTopProducts(req.auth, req.query) });
  } catch (error) {
    next(error);
  }
}

export async function topServices(req, res, next) {
  try {
    res.json({ data: await getTopServices(req.auth, req.query) });
  } catch (error) {
    next(error);
  }
}

export async function recentErrors(req, res, next) {
  try {
    res.json({ data: await getRecentErrors(req.auth, req.query) });
  } catch (error) {
    next(error);
  }
}
