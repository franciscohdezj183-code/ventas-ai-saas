import { logger } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info('http_request', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.auth?.user?.id,
      empresaId: req.auth?.user?.empresaId
    });
  });

  next();
}
