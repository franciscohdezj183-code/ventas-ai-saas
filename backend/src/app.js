import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { notFoundHandler } from './middlewares/not-found.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';

export const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.resolve(__dirname, '../uploads');

app.use(helmet());
app.use(cors({ origin: env.frontendUrl }));
app.use(express.json());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use('/uploads', express.static(uploadsPath));

app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
