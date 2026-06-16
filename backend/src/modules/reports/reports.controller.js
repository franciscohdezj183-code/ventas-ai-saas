import { getReportsOverview } from './reports.service.js';

export async function reportsOverview(req, res, next) {
  try {
    res.json({ data: await getReportsOverview(req.auth, req.query) });
  } catch (error) {
    next(error);
  }
}
