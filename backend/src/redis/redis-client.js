import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let activeClient = null;
let redisStatus = env.queue.enabled ? 'idle' : 'disabled';
const clientsWithEvents = new WeakSet();
const REDIS_ERROR_THROTTLE_MS = 30000;
const redisLogState = new Map();

export function maskRedisUrl(redisUrl = '') {
  try {
    const parsedUrl = new URL(redisUrl);

    if (parsedUrl.password) {
      parsedUrl.password = '***';
    }

    if (parsedUrl.username) {
      parsedUrl.username = '***';
    }

    return parsedUrl.toString();
  } catch {
    return '[invalid-redis-url]';
  }
}

function shouldLogRedisEvent(key, now = Date.now()) {
  const lastLoggedAt = redisLogState.get(key);

  if (lastLoggedAt === undefined || now - lastLoggedAt >= REDIS_ERROR_THROTTLE_MS) {
    redisLogState.set(key, now);
    return true;
  }

  return false;
}

function resetRedisLogDedupe() {
  redisLogState.clear();
}

function attachRedisEvents(client, { loggerInstance = logger } = {}) {
  if (!client || clientsWithEvents.has(client)) {
    return;
  }

  clientsWithEvents.add(client);

  client.on?.('connect', () => {
    redisStatus = 'connecting';
    loggerInstance.info('redis_connecting');
  });
  client.on?.('ready', () => {
    redisStatus = 'ready';
    resetRedisLogDedupe();
    loggerInstance.info('redis_ready');
  });
  client.on?.('error', (error) => {
    redisStatus = 'error';
    const code = error?.code ?? error?.name ?? 'UNKNOWN';
    const message = String(error?.message ?? 'Redis connection error').split('\n')[0];

    if (shouldLogRedisEvent(`redis_error:${code}:${message}`)) {
      loggerInstance.error('redis_error', {
        error: {
          name: error?.name,
          message,
          code: error?.code
        }
      });
    }
  });
  client.on?.('close', () => {
    if (redisStatus !== 'closing') {
      redisStatus = 'error';
    }
    if (shouldLogRedisEvent('redis_closed')) {
      loggerInstance.warn('redis_closed');
    }
  });
  client.on?.('reconnecting', () => {
    redisStatus = 'error';
    if (shouldLogRedisEvent('redis_reconnecting')) {
      loggerInstance.warn('redis_reconnecting');
    }
  });
}

export function createRedisClient({
  queueConfig = env.queue,
  RedisClient = Redis,
  loggerInstance = logger
} = {}) {
  if (!queueConfig.enabled) {
    redisStatus = 'disabled';
    return null;
  }

  redisStatus = 'idle';
  const client = new RedisClient(queueConfig.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    connectTimeout: queueConfig.redisConnectTimeoutMs,
    enableReadyCheck: true
  });

  attachRedisEvents(client, { loggerInstance });
  return client;
}

export function getRedisClient(options = {}) {
  const queueConfig = options.queueConfig ?? env.queue;

  if (!queueConfig.enabled) {
    redisStatus = 'disabled';
    return null;
  }

  if (!activeClient) {
    activeClient = options.client ?? createRedisClient(options);
  }

  return activeClient;
}

export function getRedisStatus() {
  return redisStatus;
}

export async function waitForRedisReady(client = activeClient) {
  if (!client) {
    redisStatus = env.queue.enabled ? 'error' : 'disabled';
    throw new Error('Redis client is not initialized');
  }

  if (client.status === 'wait' || client.status === 'end') {
    await client.connect();
  } else if (client.status !== 'ready' && typeof client.waitUntilReady === 'function') {
    await client.waitUntilReady();
  }

  await client.ping();
  redisStatus = 'ready';
}

export async function closeRedisClient() {
  if (!activeClient) {
    redisStatus = env.queue.enabled ? redisStatus : 'disabled';
    return;
  }

  const client = activeClient;
  activeClient = null;
  redisStatus = 'closing';

  if (typeof client.quit === 'function') {
    await client.quit();
  } else if (typeof client.disconnect === 'function') {
    client.disconnect();
  }

  redisStatus = 'closed';
}

export function resetRedisClientForTests() {
  activeClient = null;
  redisStatus = env.queue.enabled ? 'idle' : 'disabled';
  resetRedisLogDedupe();
}
