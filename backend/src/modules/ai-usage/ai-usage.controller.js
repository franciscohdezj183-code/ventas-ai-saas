import { getMonthlyAIUsage } from './ai-usage.service.js';

export async function monthlyAIUsage(req, res, next) {
  try {
    res.json({ data: await getMonthlyAIUsage(req.auth, req.query) });
  } catch (error) {
    next(error);
  }
}
