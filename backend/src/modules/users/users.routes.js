import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { attachCompanyScope } from '../../middlewares/company-scope.middleware.js';
import { authorizeRoles } from '../../middlewares/roles.middleware.js';
import { getUser, listUsers, patchUser, removeUser, storeUser } from './users.controller.js';

export const usersRouter = Router();

usersRouter.use(authenticate, authorizeRoles('SUPER_ADMIN', 'OWNER'), attachCompanyScope);

usersRouter.get('/', listUsers);
usersRouter.post('/', storeUser);
usersRouter.get('/:id', getUser);
usersRouter.put('/:id', patchUser);
usersRouter.delete('/:id', removeUser);
