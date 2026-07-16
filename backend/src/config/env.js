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

function stringEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
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

  if (nextEnv.queue.enabled) {
    try {
      new URL(nextEnv.queue.redisUrl);
    } catch {
      errors.push('REDIS_URL must be a valid URL when QUEUE_ENABLED=true');
    }
  }

  if (!Number.isInteger(nextEnv.queue.redisConnectTimeoutMs) || nextEnv.queue.redisConnectTimeoutMs <= 0) {
    errors.push('REDIS_CONNECT_TIMEOUT_MS must be a positive integer');
  }

  if (!Number.isInteger(nextEnv.queue.removeOnComplete) || nextEnv.queue.removeOnComplete < 0) {
    errors.push('QUEUE_REMOVE_ON_COMPLETE must be a non-negative integer');
  }

  if (!Number.isInteger(nextEnv.queue.removeOnFail) || nextEnv.queue.removeOnFail < 0) {
    errors.push('QUEUE_REMOVE_ON_FAIL must be a non-negative integer');
  }

  if (!Number.isInteger(nextEnv.queue.attempts) || nextEnv.queue.attempts <= 0) {
    errors.push('QUEUE_ATTEMPTS must be a positive integer');
  }

  if (!Number.isInteger(nextEnv.queue.backoffMs) || nextEnv.queue.backoffMs < 0) {
    errors.push('QUEUE_BACKOFF_MS must be a non-negative integer');
  }

  if (nextEnv.whatsapp.commandsViaQueue && !nextEnv.queue.enabled) {
    errors.push('QUEUE_ENABLED must be true when WHATSAPP_COMMANDS_VIA_QUEUE=true');
  }

  if (nextEnv.whatsapp.commandWorker.enabled && !nextEnv.queue.enabled) {
    errors.push('QUEUE_ENABLED must be true when WHATSAPP_COMMAND_WORKER_ENABLED=true');
  }

  if (!Number.isInteger(nextEnv.whatsapp.commandWorker.concurrency) || nextEnv.whatsapp.commandWorker.concurrency <= 0) {
    errors.push('WHATSAPP_COMMAND_CONCURRENCY must be a positive integer');
  }

  if (!Number.isInteger(nextEnv.whatsapp.commandWorker.timeoutMs) || nextEnv.whatsapp.commandWorker.timeoutMs <= 0) {
    errors.push('WHATSAPP_COMMAND_TIMEOUT_MS must be a positive integer');
  }

  if (!Number.isInteger(nextEnv.whatsapp.commandWorker.staleMs) || nextEnv.whatsapp.commandWorker.staleMs <= 0) {
    errors.push('WHATSAPP_COMMAND_STALE_MS must be a positive integer');
  }

  if (nextEnv.whatsapp.commandsViaQueue && process.env.WHATSAPP_LEGACY_WORKER_ENABLED === 'true') {
    errors.push('WHATSAPP_LEGACY_WORKER_ENABLED cannot be true when WHATSAPP_COMMANDS_VIA_QUEUE=true');
  }

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
    authRateLimitMax: numberEnv('AUTH_RATE_LIMIT_MAX', 20),
    encryptionKey: process.env.FIELD_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'change_this_secret_in_production'
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change_this_secret_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d'
  },
  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER ?? 'whatsapp-web',
    sessionPath: process.env.WHATSAPP_SESSION_PATH ?? 'storage/whatsapp',
    headless: booleanEnv('WHATSAPP_HEADLESS', true),
    commandsViaQueue: booleanEnv('WHATSAPP_COMMANDS_VIA_QUEUE', false),
    commandWorker: {
      enabled: booleanEnv('WHATSAPP_COMMAND_WORKER_ENABLED', false),
      concurrency: numberEnv('WHATSAPP_COMMAND_CONCURRENCY', 1),
      timeoutMs: numberEnv('WHATSAPP_COMMAND_TIMEOUT_MS', 120000),
      staleMs: numberEnv('WHATSAPP_COMMAND_STALE_MS', 300000)
    }
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
    autoReply: booleanEnv('OPENAI_AUTO_REPLY', true),
    inputCostPerMillion: numberEnv('OPENAI_INPUT_COST_PER_MILLION', 0),
    outputCostPerMillion: numberEnv('OPENAI_OUTPUT_COST_PER_MILLION', 0)
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: numberEnv('DB_PORT', 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'ventas_ai_saas'
  },
  queue: {
    enabled: booleanEnv('QUEUE_ENABLED', false),
    redisUrl: stringEnv('REDIS_URL', 'redis://127.0.0.1:6379'),
    redisPrefix: stringEnv('REDIS_PREFIX', 'nexus'),
    redisConnectTimeoutMs: numberEnv('REDIS_CONNECT_TIMEOUT_MS', 5000),
    removeOnComplete: numberEnv('QUEUE_REMOVE_ON_COMPLETE', 1000),
    removeOnFail: numberEnv('QUEUE_REMOVE_ON_FAIL', 5000),
    attempts: numberEnv('QUEUE_ATTEMPTS', 5),
    backoffMs: numberEnv('QUEUE_BACKOFF_MS', 2000)
  }
};

validateEnv(env);
