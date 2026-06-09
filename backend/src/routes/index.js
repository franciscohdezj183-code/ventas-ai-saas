import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { companiesRouter } from '../modules/companies/companies.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { categoriesRouter } from '../modules/categories/categories.routes.js';
import { productsRouter } from '../modules/products/products.routes.js';
import { servicesRouter } from '../modules/services/services.routes.js';
import { leadsRouter } from '../modules/leads/leads.routes.js';
import { conversationsRouter } from '../modules/conversations/conversations.routes.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { whatsappRouter } from '../modules/whatsapp/whatsapp.routes.js';
import { aiRouter } from '../modules/ai/ai.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/companies', companiesRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/services', servicesRouter);
apiRouter.use('/leads', leadsRouter);
apiRouter.use('/conversations', conversationsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/whatsapp', whatsappRouter);
apiRouter.use('/ai', aiRouter);
