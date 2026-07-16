import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { closeRedisClient, getRedisClient, waitForRedisReady } from '../redis/redis-client.js';
import { createBullQueue } from './queue-factory.js';
import { createQueueNames } from './queue-names.js';
import { createQueueDisabledError } from './queue-payloads.js';
import { enqueueWhatsappCommand } from './queues/whatsapp-command.queue.js';
import { enqueueInboundMessage } from './queues/whatsapp-inbound.queue.js';
import { enqueueOutboundMessage } from './queues/whatsapp-outbound.queue.js';

let activeRegistry = null;
let initializationPromise = null;
let closingPromise = null;

const QUEUE_ERROR_THROTTLE_MS = 30000;

function createDisabledQueue(queueName) {
  return {
    name: queueName,
    status: 'disabled',
    async enqueue() {
      throw createQueueDisabledError(queueName);
    },
    async close() {}
  };
}

function createErrorQueue(queueName) {
  return {
    name: queueName,
    status: 'error',
    async enqueue() {
      throw createQueueDisabledError(queueName);
    },
    async close() {
      this.status = 'closed';
    }
  };
}

function normalizeQueueError(error) {
  return {
    code: error?.code ?? error?.name ?? 'UNKNOWN',
    message: String(error?.message ?? 'Queue connection error').split('\n')[0]
  };
}

function removeListener(emitter, event, handler) {
  if (typeof emitter?.off === 'function') {
    emitter.off(event, handler);
    return;
  }

  if (typeof emitter?.removeListener === 'function') {
    emitter.removeListener(event, handler);
  }
}

function attachQueueConnectionEvents(
  queue,
  {
    queueName,
    loggerInstance = logger,
    now = () => Date.now(),
    throttleMs = QUEUE_ERROR_THROTTLE_MS,
    onConnectionError = () => {}
  }
) {
  const loggedErrors = new Map();

  const resetErrorDedupe = () => {
    loggedErrors.clear();
  };

  const onError = (error) => {
    onConnectionError();
    const normalizedError = normalizeQueueError(error);
    const dedupeKey = `${queueName}:${normalizedError.code}:${normalizedError.message}`;
    const currentTime = now();
    const lastLoggedAt = loggedErrors.get(dedupeKey);

    if (lastLoggedAt === undefined || currentTime - lastLoggedAt >= throttleMs) {
      loggedErrors.set(dedupeKey, currentTime);
      loggerInstance.error('queue_connection_error', {
        queueName,
        code: normalizedError.code,
        error: {
          message: normalizedError.message
        }
      });
    }
  };

  queue?.on?.('error', onError);
  queue?.on?.('ready', resetErrorDedupe);

  return {
    resetErrorDedupe,
    detach() {
      removeListener(queue, 'error', onError);
      removeListener(queue, 'ready', resetErrorDedupe);
    }
  };
}

function wrapQueue(queue, queueName, enqueueFn, loggerInstance = logger, queueEventOptions = {}) {
  const wrapper = {
    name: queueName,
    status: 'initializing',
    queue,
    resetErrorDedupe: () => {},
    async enqueue(payload) {
      const job = await enqueueFn(queue, payload);
      loggerInstance.info('queue_job_enqueued', {
        queue: queueName,
        jobId: job?.id,
        name: job?.name
      });
      return job;
    },
    async close() {}
  };
  const queueEvents = attachQueueConnectionEvents(queue, {
    queueName,
    loggerInstance,
    onConnectionError: () => {
      wrapper.status = 'error';
    },
    ...queueEventOptions
  });

  wrapper.resetErrorDedupe = queueEvents.resetErrorDedupe;
  wrapper.close = async function close() {
    queueEvents.detach();
    await queue.close?.();
    this.status = 'closed';
  };

  return wrapper;
}

async function waitForQueueReady(queueWrapper) {
  await queueWrapper.queue?.waitUntilReady?.();
  queueWrapper.status = 'ready';
}

export function createQueueRegistry({
  queueConfig = env.queue,
  queueFactory = createBullQueue,
  redisClient = getRedisClient({ queueConfig }),
  waitForRedis = waitForRedisReady,
  loggerInstance = logger,
  now = () => Date.now(),
  queueErrorThrottleMs = QUEUE_ERROR_THROTTLE_MS
} = {}) {
  const names = createQueueNames(queueConfig.redisPrefix);

  if (!queueConfig.enabled) {
    loggerInstance.info('queue_registry_disabled', { enabled: false });
    return {
      enabled: false,
      status: 'disabled',
      whatsappCommandQueue: createDisabledQueue(names.whatsappCommand),
      whatsappInboundQueue: createDisabledQueue(names.whatsappInbound),
      whatsappOutboundQueue: createDisabledQueue(names.whatsappOutbound),
      async close() {}
    };
  }

  const registry = {
    enabled: true,
    status: 'initializing',
    redisClient,
    whatsappCommandQueue: wrapQueue(
      queueFactory({ name: names.whatsappCommand, queueConfig, connection: redisClient }),
      names.whatsappCommand,
      enqueueWhatsappCommand,
      loggerInstance,
      { now, throttleMs: queueErrorThrottleMs }
    ),
    whatsappInboundQueue: wrapQueue(
      queueFactory({ name: names.whatsappInbound, queueConfig, connection: redisClient }),
      names.whatsappInbound,
      enqueueInboundMessage,
      loggerInstance,
      { now, throttleMs: queueErrorThrottleMs }
    ),
    whatsappOutboundQueue: wrapQueue(
      queueFactory({ name: names.whatsappOutbound, queueConfig, connection: redisClient }),
      names.whatsappOutbound,
      enqueueOutboundMessage,
      loggerInstance,
      { now, throttleMs: queueErrorThrottleMs }
    ),
    async waitUntilReady() {
      await waitForRedis(redisClient);
      await Promise.all([
        waitForQueueReady(this.whatsappCommandQueue),
        waitForQueueReady(this.whatsappInboundQueue),
        waitForQueueReady(this.whatsappOutboundQueue)
      ]);
      this.status = 'ready';
    },
    async revalidate() {
      try {
        this.whatsappCommandQueue.resetErrorDedupe?.();
        this.whatsappInboundQueue.resetErrorDedupe?.();
        this.whatsappOutboundQueue.resetErrorDedupe?.();
        await this.waitUntilReady();
      } catch (error) {
        this.status = 'error';
        this.whatsappCommandQueue.status = 'error';
        this.whatsappInboundQueue.status = 'error';
        this.whatsappOutboundQueue.status = 'error';
      }
    },
    async close() {
      this.status = 'closing';
      await Promise.allSettled([
        this.whatsappCommandQueue.close(),
        this.whatsappInboundQueue.close(),
        this.whatsappOutboundQueue.close()
      ]);
      this.detachRedisReadyListener?.();
      await closeRedisClient();
      this.status = 'closed';
      loggerInstance.info('queue_registry_closed');
    }
  };

  const onRedisReady = () => {
    registry.revalidate();
  };

  redisClient?.on?.('ready', onRedisReady);
  registry.detachRedisReadyListener = () => {
    removeListener(redisClient, 'ready', onRedisReady);
  };

  return registry;
}

export async function initializeQueueRegistry(options = {}) {
  const queueConfig = options.queueConfig ?? env.queue;
  const loggerInstance = options.loggerInstance ?? logger;

  if (activeRegistry && activeRegistry.status !== 'closed') {
    return activeRegistry;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    if (!queueConfig.enabled) {
      activeRegistry = createQueueRegistry({ ...options, queueConfig, loggerInstance });
      return activeRegistry;
    }

    loggerInstance.info('queue_registry_initializing');

    try {
      activeRegistry = createQueueRegistry({ ...options, queueConfig, loggerInstance });
      await activeRegistry.waitUntilReady();
      loggerInstance.info('queue_registry_initialized');
      return activeRegistry;
    } catch (error) {
      if (!activeRegistry) {
        activeRegistry = {
          enabled: true,
          status: 'error',
          whatsappCommandQueue: createErrorQueue(createQueueNames(queueConfig.redisPrefix).whatsappCommand),
          whatsappInboundQueue: createErrorQueue(createQueueNames(queueConfig.redisPrefix).whatsappInbound),
          whatsappOutboundQueue: createErrorQueue(createQueueNames(queueConfig.redisPrefix).whatsappOutbound),
          async close() {
            this.status = 'closed';
            loggerInstance.info('queue_registry_closed');
          }
        };
      } else {
        activeRegistry.status = 'error';
        activeRegistry.whatsappCommandQueue.status = 'error';
        activeRegistry.whatsappInboundQueue.status = 'error';
        activeRegistry.whatsappOutboundQueue.status = 'error';
      }
      loggerInstance.error('queue_registry_initialization_error', {
        error: {
          name: error?.name,
          message: error?.message,
          code: error?.code
        }
      });
      throw error;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

export function getQueueRegistry(options = {}) {
  if (!activeRegistry) {
    const queueConfig = options.queueConfig ?? env.queue;

    if (!queueConfig.enabled) {
      activeRegistry = createQueueRegistry(options);
    }
  }

  return activeRegistry;
}

export const whatsappCommandQueue = {
  enqueue(payload) {
    return getQueueRegistry().whatsappCommandQueue.enqueue(payload);
  }
};

export const whatsappInboundQueue = {
  enqueue(payload) {
    return getQueueRegistry().whatsappInboundQueue.enqueue(payload);
  }
};

export const whatsappOutboundQueue = {
  enqueue(payload) {
    return getQueueRegistry().whatsappOutboundQueue.enqueue(payload);
  }
};

export async function closeQueueRegistry() {
  if (closingPromise) {
    return closingPromise;
  }

  if (!activeRegistry) {
    return;
  }

  const registry = activeRegistry;
  activeRegistry = null;
  closingPromise = registry.close().finally(() => {
    closingPromise = null;
  });
  return closingPromise;
}

export function resetQueueRegistryForTests() {
  activeRegistry = null;
  initializationPromise = null;
  closingPromise = null;
}
