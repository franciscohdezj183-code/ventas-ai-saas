import { logger } from '../utils/logger.js';

function redactPath(value) {
  try {
    const url = new URL(value, 'http://internal.local');
    for (const key of [...url.searchParams.keys()]) {
      if (/token|password|secret|qr|code/i.test(key)) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return String(value ?? '').replace(/(token|password|secret|qr|code)=([^&]+)/gi, '$1=[REDACTED]');
  }
}

export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info('http_request', {
      method: req.method,
      path: redactPath(req.originalUrl),
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
