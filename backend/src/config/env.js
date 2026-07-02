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
    const parsedUrl = new URL(value);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error();
    }

    return parsedUrl.origin;
  } catch {
    throw new Error(`Invalid URL environment variable: ${name}`);
  }
}

function optionalStringEnv(name) {
  const value = process.env[name];
  return value === undefined || value === '' ? null : value;
}

function isLocalHostname(hostname) {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '0.0.0.0' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]' ||
    normalizedHostname.startsWith('127.') ||
    normalizedHostname.endsWith('.local')
  );
}

function isIpAddress(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

function isProductionOrigin(origin) {
  const parsedUrl = new URL(origin);

  return (
    parsedUrl.protocol === 'https:' &&
    !isLocalHostname(parsedUrl.hostname) &&
    !isIpAddress(parsedUrl.hostname) &&
    parsedUrl.hostname.includes('.')
  );
}

function hasEnvValue(name) {
  return process.env[name] !== undefined && process.env[name] !== '';
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
    const requiredProductionEnv = [
      'API_URL',
      'FRONTEND_URL',
      'CORS_ORIGINS',
      'JWT_SECRET',
      'DB_HOST',
      'DB_PORT',
      'DB_USER',
      'DB_PASSWORD',
      'DB_NAME',
      'OPENAI_API_KEY'
    ];
    const missingProductionEnv = requiredProductionEnv.filter((name) => !hasEnvValue(name));

    if (missingProductionEnv.length > 0) {
      errors.push(`Missing required production environment variables: ${missingProductionEnv.join(', ')}`);
    }

    if (!isProductionOrigin(nextEnv.apiUrl)) {
      errors.push('API_URL must use an https production domain and cannot point to localhost or an IP address');
    }

    if (!isProductionOrigin(nextEnv.frontendUrl)) {
      errors.push('FRONTEND_URL must use an https production domain and cannot point to localhost or an IP address');
    }

    if (nextEnv.jwt.secret === 'change_this_secret_in_production' || nextEnv.jwt.secret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters and not use the default value in production');
    }

    if (nextEnv.cors.allowedOrigins.length === 0) {
      errors.push('CORS_ORIGINS or FRONTEND_URL must include at least one production origin');
    }

    const invalidCorsOrigins = nextEnv.cors.allowedOrigins.filter((origin) => !isProductionOrigin(origin));

    if (invalidCorsOrigins.length > 0) {
      errors.push('CORS_ORIGINS must only include https production domains in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }
}

const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const apiUrl = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const normalizedFrontendUrl = validateUrl(frontendUrl, 'FRONTEND_URL');
const normalizedApiUrl = validateUrl(apiUrl, 'API_URL');
const corsOrigins = listEnv('CORS_ORIGINS', frontendUrl).map((origin) => validateUrl(origin, 'CORS_ORIGINS'));

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: numberEnv('PORT', 4000),
  apiUrl: normalizedApiUrl,
  frontendUrl: normalizedFrontendUrl,
  cors: {
    allowedOrigins: corsOrigins
  },
  security: {
    jsonLimit: process.env.JSON_BODY_LIMIT ?? '1mb',
    rateLimitWindowMs: numberEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    rateLimitMax: numberEnv('RATE_LIMIT_MAX', 300),
    authRateLimitMax: numberEnv('AUTH_RATE_LIMIT_MAX', 20),
    encryptionKey: process.env.FIELD_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'change_this_secret_in_production'
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change_this_secret_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d'
  },
  whatsapp: {
    sessionPath: process.env.WHATSAPP_SESSION_PATH ?? 'storage/whatsapp',
    restoreSessions: booleanEnv('WHATSAPP_RESTORE_SESSIONS', false),
    restoreSessionDelayMs: numberEnv('WHATSAPP_RESTORE_SESSION_DELAY_MS', 2000),
    headless: booleanEnv('WHATSAPP_HEADLESS', true),
    puppeteerExecutablePath: optionalStringEnv('WHATSAPP_PUPPETEER_EXECUTABLE_PATH'),
    puppeteerArgs: listEnv('WHATSAPP_PUPPETEER_ARGS')
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
    autoReply: booleanEnv('OPENAI_AUTO_REPLY', true),
    timeoutMs: numberEnv('OPENAI_TIMEOUT_MS', 15000),
    maxRetries: numberEnv('OPENAI_MAX_RETRIES', 1),
    temperature: numberEnv('OPENAI_TEMPERATURE', 0),
    maxTokens: numberEnv('OPENAI_MAX_TOKENS', 300),
    inputCostPerMillion: numberEnv('OPENAI_INPUT_COST_PER_MILLION', 0),
    outputCostPerMillion: numberEnv('OPENAI_OUTPUT_COST_PER_MILLION', 0)
  },
  conversationEngine: {
    version: ['legacy', 'ncie'].includes(String(process.env.CONVERSATION_ENGINE_VERSION ?? 'legacy').toLowerCase())
      ? String(process.env.CONVERSATION_ENGINE_VERSION ?? 'legacy').toLowerCase()
      : 'legacy',
    shadowMode: booleanEnv('CONVERSATION_ENGINE_SHADOW_MODE', false)
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
