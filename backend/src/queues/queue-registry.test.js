import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createQueueRegistry,
  initializeQueueRegistry,
  getQueueRegistry,
  closeQueueRegistry,
  resetQueueRegistryForTests
} from './queue-registry.js';
import { getQueueHealth, isQueueHealthDegraded } from './queue-health.service.js';
import { createRedisClient, resetRedisClientForTests } from '../redis/redis-client.js';
import { enqueueWhatsappCommand } from './queues/whatsapp-command.queue.js';
import { enqueueInboundMessage } from './queues/whatsapp-inbound.queue.js';
import { enqueueOutboundMessage } from './queues/whatsapp-outbound.queue.js';
import { createMessagingService } from '../messaging/messaging.service.js';

function queueConfig(overrides = {}) {
  return {
    enabled: false,
    redisUrl: 'redis://:secret@127.0.0.1:6379',
    redisPrefix: 'nexus',
    redisConnectTimeoutMs: 5000,
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 5,
    backoffMs: 2000,
    ...overrides
  };
}

function createFakeQueue() {
  const calls = [];

  return {
    calls,
    closed: false,
    async add(name, payload, options) {
      calls.push({ name, payload, options });
      return { id: options.jobId, name, data: payload };
    },
    async close() {
      this.closed = true;
    }
  };
}

function createReadyQueue() {
  const listeners = new Map();

  return {
    closed: false,
    readyCalls: 0,
    listeners,
    on(event, handler) {
      const nextListeners = listeners.get(event) ?? [];
      nextListeners.push(handler);
      listeners.set(event, nextListeners);
    },
    off(event, handler) {
      listeners.set(event, (listeners.get(event) ?? []).filter((listener) => listener !== handler));
    },
    emit(event, ...args) {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args);
      }
    },
    async add(name, payload, options) {
      return { id: options.jobId, name, data: payload };
    },
    async waitUntilReady() {
      this.readyCalls += 1;
    },
    async close() {
      this.closed = true;
    }
  };
}

function createFakeRedisClient() {
  const listeners = new Map();

  return {
    status: 'ready',
    listeners,
    on(event, handler) {
      const nextListeners = listeners.get(event) ?? [];
      nextListeners.push(handler);
      listeners.set(event, nextListeners);
    },
    off(event, handler) {
      listeners.set(event, (listeners.get(event) ?? []).filter((listener) => listener !== handler));
    },
    emit(event, ...args) {
      for (const handler of listeners.get(event) ?? []) {
        handler(...args);
      }
    }
  };
}

function createFakeRedisClass(instances) {
  return class FakeRedis {
    constructor() {
      this.listeners = new Map();
      instances.push(this);
    }

    on(event, handler) {
      const nextListeners = this.listeners.get(event) ?? [];
      nextListeners.push(handler);
      this.listeners.set(event, nextListeners);
    }

    emit(event, ...args) {
      for (const handler of this.listeners.get(event) ?? []) {
        handler(...args);
      }
    }
  };
}

function silentLogger() {
  return { logs: [], info() {}, warn() {}, error() {} };
}

function captureLogger() {
  const logs = [];

  return {
    logs,
    info(message, meta) {
      logs.push({ level: 'info', message, meta });
    },
    warn(message, meta) {
      logs.push({ level: 'warn', message, meta });
    },
    error(message, meta) {
      logs.push({ level: 'error', message, meta });
    }
  };
}

test('QUEUE_ENABLED=false does not create queues or Redis connections', () => {
  let factoryCalls = 0;
  const registry = createQueueRegistry({
    queueConfig: queueConfig({ enabled: false }),
    queueFactory: () => {
      factoryCalls += 1;
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  assert.equal(registry.enabled, false);
  assert.equal(factoryCalls, 0);
  assert.equal(registry.whatsappCommandQueue.status, 'disabled');
});

test('disabled queues fail with controlled QUEUE_DISABLED error', async () => {
  const registry = createQueueRegistry({
    queueConfig: queueConfig({ enabled: false }),
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  await assert.rejects(
    () => registry.whatsappCommandQueue.enqueue({ command: 'START_SESSION', empresaId: 5 }),
    (error) => error.code === 'QUEUE_DISABLED' && error.statusCode === 503
  );
});

test('enqueue helpers validate and use deterministic job ids', async () => {
  const queue = createFakeQueue();
  const job = await enqueueWhatsappCommand(queue, {
    jobId: 'empresa-5:start',
    command: 'START_SESSION',
    empresaId: 5,
    requestedAt: '2026-07-16T10:00:00.000Z',
    payload: {}
  });

  assert.equal(job.id, 'whatsapp-command-empresa-5-start');
  assert.equal(queue.calls[0].name, 'START_SESSION');
});

test('inbound and outbound enqueue helpers validate contracts', async () => {
  const inboundQueue = createFakeQueue();
  const outboundQueue = createFakeQueue();

  await enqueueInboundMessage(inboundQueue, {
    eventId: 'evt-1',
    empresaId: 5,
    whatsappChatId: '113950146457660@lid',
    phone: '527712345678',
    messageId: 'msg-1',
    messageType: 'text',
    body: 'hola',
    receivedAt: '2026-07-16T10:00:00.000Z'
  });
  await enqueueOutboundMessage(outboundQueue, {
    messageId: 'out-1',
    empresaId: 5,
    whatsappChatId: '113950146457660@lid',
    type: 'text',
    text: 'Hola',
    createdAt: '2026-07-16T10:00:00.000Z'
  });

  assert.equal(inboundQueue.calls[0].options.jobId, 'whatsapp-inbound:evt-1');
  assert.equal(outboundQueue.calls[0].options.jobId, 'whatsapp-outbound:out-1');
});

test('closeQueueRegistry is idempotent', async () => {
  resetQueueRegistryForTests();
  await closeQueueRegistry();
  await closeQueueRegistry();
});

test('initializeQueueRegistry creates Redis and three queues when enabled', async () => {
  resetQueueRegistryForTests();
  const redisClient = createFakeRedisClient();
  const queues = [];
  const registry = await initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient,
    waitForRedis: async () => {},
    queueFactory: () => {
      const queue = createReadyQueue();
      queues.push(queue);
      return queue;
    },
    loggerInstance: silentLogger()
  });

  assert.equal(registry.status, 'ready');
  assert.equal(queues.length, 3);
  assert.equal(registry.whatsappCommandQueue.status, 'ready');
  assert.equal(registry.whatsappInboundQueue.status, 'ready');
  assert.equal(registry.whatsappOutboundQueue.status, 'ready');
});

test('concurrent initialization creates one registry and one set of queues', async () => {
  resetQueueRegistryForTests();
  const redisClient = createFakeRedisClient();
  let factoryCalls = 0;
  let redisReadyCalls = 0;
  const options = {
    queueConfig: queueConfig({ enabled: true }),
    redisClient,
    waitForRedis: async () => {
      redisReadyCalls += 1;
    },
    queueFactory: () => {
      factoryCalls += 1;
      return createReadyQueue();
    },
    loggerInstance: silentLogger()
  };

  const [first, second] = await Promise.all([
    initializeQueueRegistry(options),
    initializeQueueRegistry(options)
  ]);

  assert.equal(first, second);
  assert.equal(factoryCalls, 3);
  assert.equal(redisReadyCalls, 1);
});

test('each queue has one error listener after initialization', async () => {
  resetQueueRegistryForTests();
  const queues = [];
  await initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient: createFakeRedisClient(),
    waitForRedis: async () => {},
    queueFactory: () => {
      const queue = createReadyQueue();
      queues.push(queue);
      return queue;
    },
    loggerInstance: silentLogger()
  });

  assert.equal(queues.length, 3);
  assert.equal(queues.every((queue) => queue.listeners.get('error')?.length === 1), true);
});

test('concurrent initialization does not duplicate queue error listeners', async () => {
  resetQueueRegistryForTests();
  const queues = [];
  const options = {
    queueConfig: queueConfig({ enabled: true }),
    redisClient: createFakeRedisClient(),
    waitForRedis: async () => {},
    queueFactory: () => {
      const queue = createReadyQueue();
      queues.push(queue);
      return queue;
    },
    loggerInstance: silentLogger()
  };

  await Promise.all([
    initializeQueueRegistry(options),
    initializeQueueRegistry(options)
  ]);

  assert.equal(queues.length, 3);
  assert.equal(queues.every((queue) => queue.listeners.get('error')?.length === 1), true);
});

test('first queue ECONNREFUSED error is logged without console.error', async () => {
  resetQueueRegistryForTests();
  const queues = [];
  const loggerInstance = captureLogger();
  const originalConsoleError = console.error;
  let consoleErrorCalls = 0;
  console.error = () => {
    consoleErrorCalls += 1;
  };

  try {
    await initializeQueueRegistry({
      queueConfig: queueConfig({ enabled: true }),
      redisClient: createFakeRedisClient(),
      waitForRedis: async () => {},
      queueFactory: () => {
        const queue = createReadyQueue();
        queues.push(queue);
        return queue;
      },
      loggerInstance
    });

    queues[0].emit('error', Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), {
      code: 'ECONNREFUSED'
    }));
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(consoleErrorCalls, 0);
  assert.deepEqual(loggerInstance.logs.filter((log) => log.message === 'queue_connection_error'), [
    {
      level: 'error',
      message: 'queue_connection_error',
      meta: {
        queueName: 'nexus:whatsapp:commands:v1',
        code: 'ECONNREFUSED',
        error: {
          message: 'connect ECONNREFUSED 127.0.0.1:6379'
        }
      }
    }
  ]);
});

test('identical queue errors within throttle window are deduplicated', async () => {
  resetQueueRegistryForTests();
  const queues = [];
  const loggerInstance = captureLogger();
  let currentTime = 1000;
  await initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient: createFakeRedisClient(),
    waitForRedis: async () => {},
    queueFactory: () => {
      const queue = createReadyQueue();
      queues.push(queue);
      return queue;
    },
    loggerInstance,
    now: () => currentTime
  });

  const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), { code: 'ECONNREFUSED' });
  queues[0].emit('error', error);
  currentTime += 10000;
  queues[0].emit('error', error);

  assert.equal(loggerInstance.logs.filter((log) => log.message === 'queue_connection_error').length, 1);
});

test('different queue errors are logged even inside throttle window', async () => {
  resetQueueRegistryForTests();
  const queues = [];
  const loggerInstance = captureLogger();
  await initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient: createFakeRedisClient(),
    waitForRedis: async () => {},
    queueFactory: () => {
      const queue = createReadyQueue();
      queues.push(queue);
      return queue;
    },
    loggerInstance,
    now: () => 1000
  });

  queues[0].emit('error', Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), {
    code: 'ECONNREFUSED'
  }));
  queues[0].emit('error', Object.assign(new Error('Connection timed out'), {
    code: 'ETIMEDOUT'
  }));

  assert.equal(loggerInstance.logs.filter((log) => log.message === 'queue_connection_error').length, 2);
});

test('queue error throttle resets after redis ready', async () => {
  resetQueueRegistryForTests();
  const redisClient = createFakeRedisClient();
  const queues = [];
  const loggerInstance = captureLogger();
  let currentTime = 1000;
  await initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient,
    waitForRedis: async () => {},
    queueFactory: () => {
      const queue = createReadyQueue();
      queues.push(queue);
      return queue;
    },
    loggerInstance,
    now: () => currentTime
  });

  const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), { code: 'ECONNREFUSED' });
  queues[0].emit('error', error);
  redisClient.emit('ready');
  await new Promise((resolve) => setImmediate(resolve));
  currentTime += 1000;
  queues[0].emit('error', error);

  assert.equal(loggerInstance.logs.filter((log) => log.message === 'queue_connection_error').length, 2);
});

test('closeQueueRegistry removes queue and redis ready listeners', async () => {
  resetQueueRegistryForTests();
  const redisClient = createFakeRedisClient();
  const queues = [];
  await initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient,
    waitForRedis: async () => {},
    queueFactory: () => {
      const queue = createReadyQueue();
      queues.push(queue);
      return queue;
    },
    loggerInstance: silentLogger()
  });

  await closeQueueRegistry();

  assert.equal(queues.every((queue) => (queue.listeners.get('error') ?? []).length === 0), true);
  assert.equal(queues.every((queue) => (queue.listeners.get('ready') ?? []).length === 0), true);
  assert.equal((redisClient.listeners.get('ready') ?? []).length, 0);
});

test('main Redis connection errors are structured, throttled, and reset after ready', () => {
  resetRedisClientForTests();
  const instances = [];
  const loggerInstance = captureLogger();
  createRedisClient({
    queueConfig: queueConfig({ enabled: true }),
    RedisClient: createFakeRedisClass(instances),
    loggerInstance
  });

  const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), { code: 'ECONNREFUSED' });
  instances[0].emit('error', error);
  instances[0].emit('error', error);
  instances[0].emit('ready');
  instances[0].emit('error', error);

  const redisErrors = loggerInstance.logs.filter((log) => log.message === 'redis_error');
  assert.equal(redisErrors.length, 2);
  assert.deepEqual(redisErrors[0].meta.error, {
    name: 'Error',
    message: 'connect ECONNREFUSED 127.0.0.1:6379',
    code: 'ECONNREFUSED'
  });
});

test('initialization error leaves registry readable for health', async () => {
  resetQueueRegistryForTests();
  await assert.rejects(
    () => initializeQueueRegistry({
      queueConfig: queueConfig({ enabled: true }),
      redisClient: createFakeRedisClient(),
      waitForRedis: async () => {
        throw Object.assign(new Error('Redis unavailable'), { code: 'ECONNREFUSED' });
      },
      queueFactory: () => createReadyQueue(),
      loggerInstance: silentLogger()
    }),
    /Redis unavailable/
  );

  const registry = getQueueRegistry({ queueConfig: queueConfig({ enabled: true }) });
  const health = await getQueueHealth({
    queueConfig: queueConfig({ enabled: true }),
    registry,
    redisHealth: { enabled: true, redis_status: 'error' }
  });

  assert.equal(registry.status, 'error');
  assert.equal(health.redis_status, 'error');
  assert.equal(health.command_queue, 'error');
  assert.equal(health.inbound_queue, 'error');
  assert.equal(health.outbound_queue, 'error');
});

test('health reports ready Redis and three ready queues', async () => {
  resetQueueRegistryForTests();
  const registry = await initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient: createFakeRedisClient(),
    waitForRedis: async () => {},
    queueFactory: () => createReadyQueue(),
    loggerInstance: silentLogger()
  });
  const health = await getQueueHealth({
    queueConfig: queueConfig({ enabled: true }),
    registry,
    redisHealth: { enabled: true, redis_status: 'ready' }
  });

  assert.deepEqual(health, {
    enabled: true,
    redis_status: 'ready',
    command_queue: 'ready',
    inbound_queue: 'ready',
    outbound_queue: 'ready'
  });
  assert.equal(isQueueHealthDegraded(health), false);
});

test('closeQueueRegistry closes queues once and is idempotent', async () => {
  resetQueueRegistryForTests();
  const queues = [];
  await initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient: createFakeRedisClient(),
    waitForRedis: async () => {},
    queueFactory: () => {
      const queue = createReadyQueue();
      queues.push(queue);
      return queue;
    },
    loggerInstance: silentLogger()
  });

  await closeQueueRegistry();
  await closeQueueRegistry();

  assert.equal(queues.length, 3);
  assert.equal(queues.every((queue) => queue.closed), true);
});

test('simulated reconnect revalidates queues without duplicating Queue instances', async () => {
  resetQueueRegistryForTests();
  const redisClient = createFakeRedisClient();
  const queues = [];
  let redisReady = false;

  await assert.rejects(() => initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient,
    waitForRedis: async () => {
      if (!redisReady) {
        throw new Error('Redis unavailable');
      }
    },
    queueFactory: () => {
      const queue = createReadyQueue();
      queues.push(queue);
      return queue;
    },
    loggerInstance: silentLogger()
  }));

  const registry = getQueueRegistry({ queueConfig: queueConfig({ enabled: true }) });
  redisReady = true;
  redisClient.emit('ready');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(registry.status, 'ready');
  assert.equal(registry.whatsappCommandQueue.status, 'ready');
  assert.equal(queues.length, 3);
});

test('retry after failed initialization does not duplicate Redis ready listeners or queues', async () => {
  resetQueueRegistryForTests();
  const redisClient = createFakeRedisClient();
  let factoryCalls = 0;

  await assert.rejects(() => initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient,
    waitForRedis: async () => {
      throw new Error('Redis unavailable');
    },
    queueFactory: () => {
      factoryCalls += 1;
      return createReadyQueue();
    },
    loggerInstance: silentLogger()
  }));

  const first = getQueueRegistry({ queueConfig: queueConfig({ enabled: true }) });
  const second = await initializeQueueRegistry({
    queueConfig: queueConfig({ enabled: true }),
    redisClient,
    waitForRedis: async () => {},
    queueFactory: () => {
      factoryCalls += 1;
      return createReadyQueue();
    },
    loggerInstance: silentLogger()
  });

  assert.equal(first, second);
  assert.equal(factoryCalls, 3);
  assert.equal(redisClient.listeners.get('ready').length, 1);
});

test('queue health reports disabled state', async () => {
  const registry = createQueueRegistry({
    queueConfig: queueConfig({ enabled: false }),
    loggerInstance: { info() {}, warn() {}, error() {} }
  });
  const health = await getQueueHealth({
    queueConfig: queueConfig({ enabled: false }),
    registry,
    redisHealth: { enabled: false, redis_status: 'disabled' }
  });

  assert.deepEqual(health, {
    enabled: false,
    redis_status: 'disabled',
    command_queue: 'disabled',
    inbound_queue: 'disabled',
    outbound_queue: 'disabled'
  });
});

test('queue health reports degraded when enabled Redis is not ready', async () => {
  const registry = {
    whatsappCommandQueue: { status: 'enabled' },
    whatsappInboundQueue: { status: 'enabled' },
    whatsappOutboundQueue: { status: 'enabled' }
  };
  const health = await getQueueHealth({
    queueConfig: queueConfig({ enabled: true }),
    registry,
    redisHealth: { enabled: true, redis_status: 'error' }
  });

  assert.equal(health.redis_status, 'error');
  assert.equal(isQueueHealthDegraded(health), true);
});

test('current messaging provider can still be selected independently', () => {
  const provider = {
    providerName: 'whatsapp-web',
    startSession() {},
    getStatus() {},
    getStatusSnapshot() {},
    listStatusSnapshots() {},
    getQr() {},
    disconnectSession() {},
    sendText() {},
    sendMedia() {},
    shutdown() {}
  };
  const service = createMessagingService(provider);

  assert.equal(service.providerName, 'whatsapp-web');
});
