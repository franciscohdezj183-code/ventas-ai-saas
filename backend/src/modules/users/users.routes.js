import { Router } from 'express';
import { attachTenantScope, requireAuth, requirePermission } from '../../middlewares/access-control.middleware.js';
import { getUser, listUsers, patchUser, removeUser, storeUser } from './users.controller.js';

export const usersRouter = Router();

usersRouter.use(requireAuth, attachTenantScope);

usersRouter.get('/', requirePermission('users.view'), listUsers);
usersRouter.post('/', requirePermission('users.manage'), storeUser);
usersRouter.get('/:id', requirePermission('users.view'), getUser);
usersRouter.put('/:id', requirePermission('users.manage'), patchUser);
usersRouter.delete('/:id', requirePermission('users.manage'), removeUser);
