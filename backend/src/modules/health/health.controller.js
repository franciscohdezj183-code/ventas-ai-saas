import { checkDatabaseConnection } from '../../config/database.js';

export async function getHealth(req, res, next) {
  try {
    await checkDatabaseConnection();

    res.json({
      status: 'ok',
      database: 'connected',
      service: 'ventas-ai-saas-api'
    });
  } catch (error) {
    next(error);
  }
}
