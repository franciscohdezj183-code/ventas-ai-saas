import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/access-control.middleware.js';
import { createRateLimiter } from '../../middlewares/rate-limit.middleware.js';
import { env } from '../../config/env.js';
import { login, logout, me } from './auth.controller.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  createRateLimiter({
    windowMs: env.security.rateLimitWindowMs,
    maxRequests: env.security.authRateLimitMax,
    message: 'Too many login attempts'
  }),
  login
);
authRouter.post('/logout', requireAuth, logout);
authRouter.get('/me', requireAuth, me);
authRouter.get('/super-admin', requireAuth, requireRole('super_admin'), me);
authRouter.get('/owner', requireAuth, requireRole('owner'), me);
