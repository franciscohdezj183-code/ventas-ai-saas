import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import { login, logout, me } from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', login);
authRouter.post('/logout', authenticate, logout);
authRouter.get('/me', authenticate, me);
authRouter.get('/super-admin', authenticate, authorizeRoles('SUPER_ADMIN'), me);
authRouter.get('/owner', authenticate, authorizeRoles('OWNER'), me);
