import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { createRateLimiter } from '../../middlewares/rate-limit.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
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
authRouter.post('/logout', authenticate, logout);
authRouter.get('/me', authenticate, me);
authRouter.get('/super-admin', authenticate, authorizeRoles('SUPER_ADMIN'), me);
authRouter.get('/owner', authenticate, authorizeRoles('OWNER'), me);
