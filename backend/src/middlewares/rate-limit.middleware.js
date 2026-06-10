import { createHttpError } from '../utils/http-error.js';

function clientKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

export function createRateLimiter({ windowMs, maxRequests, message = 'Too many requests' }) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = clientKey(req);
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      next();
      return;
    }

    current.count += 1;

    if (current.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      next(createHttpError(429, message));
      return;
    }

    next();
  };
}
