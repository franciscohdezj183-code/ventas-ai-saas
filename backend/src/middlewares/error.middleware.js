import { logger } from '../utils/logger.js';

export function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode ?? error.status ?? (error.message === 'CORS origin not allowed' ? 403 : 500);
  const publicMessage = statusCode >= 500 ? 'Internal server error' : error.message;

  logger.error('request_error', {
    error,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    userId: req.auth?.user?.id,
    empresaId: req.auth?.user?.empresaId
  });

  res.status(statusCode).json({
    message: publicMessage,
    statusCode
  });
}
