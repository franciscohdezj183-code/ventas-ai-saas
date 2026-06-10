import dotenv from 'dotenv';

dotenv.config();

function numberEnv(name, fallback) {
  const value = process.env[name];
  const parsed = Number(value ?? fallback);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }

  return parsed;
}

function listEnv(name, fallback = '') {
  return String(process.env[name] ?? fallback)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function booleanEnv(name, fallback = true) {
  const value = process.env[name];

  if (value === undefined || value === '') {
    return fallback;
  }

  return value !== 'false';
}

function validateUrl(value, name) {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`Invalid URL environment variable: ${name}`);
  }
}

function validateEnv(nextEnv) {
  const errors = [];

  if (!Number.isInteger(nextEnv.port) || nextEnv.port <= 0) {
    errors.push('PORT must be a positive integer');
  }

  if (!Number.isInteger(nextEnv.db.port) || nextEnv.db.port <= 0) {
    errors.push('DB_PORT must be a positive integer');
  }

  if (!nextEnv.db.host) errors.push('DB_HOST is required');
  if (!nextEnv.db.user) errors.push('DB_USER is required');
  if (!nextEnv.db.database) errors.push('DB_NAME is required');

  if (nextEnv.nodeEnv === 'production') {
    if (!nextEnv.apiUrl.startsWith('https://')) {
      errors.push('API_URL must use https in production');
    }

    if (nextEnv.jwt.secret === 'change_this_secret_in_production' || nextEnv.jwt.secret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters and not use the default value in production');
    }

    if (nextEnv.cors.allowedOrigins.length === 0) {
      errors.push('CORS_ORIGINS or FRONTEND_URL must include at least one production origin');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }
}

const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const corsOrigins = listEnv('CORS_ORIGINS', frontendUrl).map((origin) => validateUrl(origin, 'CORS_ORIGINS'));

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: numberEnv('PORT', 4000),
  apiUrl,
  frontendUrl,
  cors: {
    allowedOrigins: corsOrigins
  },
  security: {
    jsonLimit: process.env.JSON_BODY_LIMIT ?? '1mb',
    rateLimitWindowMs: numberEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    rateLimitMax: numberEnv('RATE_LIMIT_MAX', 300),
    authRateLimitMax: numberEnv('AUTH_RATE_LIMIT_MAX', 20)
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change_this_secret_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d'
  },
  whatsapp: {
    sessionPath: process.env.WHATSAPP_SESSION_PATH ?? 'storage/whatsapp',
    headless: booleanEnv('WHATSAPP_HEADLESS', true)
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
    autoReply: booleanEnv('OPENAI_AUTO_REPLY', true)
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: numberEnv('DB_PORT', 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'ventas_ai_saas'
  }
};

validateEnv(env);
