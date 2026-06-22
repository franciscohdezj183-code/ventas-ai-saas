import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { notFoundHandler } from './middlewares/not-found.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { createRateLimiter } from './middlewares/rate-limit.middleware.js';
import { requestLogger } from './middlewares/request-logger.middleware.js';
import { sanitizeInput } from './middlewares/sanitize-input.middleware.js';
import { createHttpError } from './utils/http-error.js';

export const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.resolve(__dirname, '../uploads');
const publicUploads = [
  {
    route: '/uploads/products',
    directory: path.join(uploadsPath, 'products')
  },
  {
    route: '/uploads/companies',
    directory: path.join(uploadsPath, 'companies')
  }
];

function setStaticUploadHeaders(res, filePath) {
  if (path.extname(filePath).toLowerCase() === '.jfif') {
    res.setHeader('Content-Type', 'image/jpeg');
  }
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", ...env.cors.allowedOrigins]
      }
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin && env.nodeEnv !== 'production') {
        callback(null, true);
        return;
      }

      if (env.cors.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(createHttpError(403, 'CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json({ limit: env.security.jsonLimit }));
app.use(sanitizeInput);
app.use(
  createRateLimiter({
    windowMs: env.security.rateLimitWindowMs,
    maxRequests: env.security.rateLimitMax
  })
);
app.use(requestLogger);
for (const upload of publicUploads) {
  app.use(
    upload.route,
    express.static(upload.directory, {
      setHeaders: setStaticUploadHeaders
    })
  );
}

app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
