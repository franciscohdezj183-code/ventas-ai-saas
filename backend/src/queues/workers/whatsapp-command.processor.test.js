import assert from 'node:assert/strict';
import test from 'node:test';
import { UnrecoverableError } from 'bullmq';
import { createWhatsappCommandProcessor } from './whatsapp-command.processor.js';

function config(timeoutMs = 120000) {
  return {
    whatsapp: {
      commandWorker: {
        timeoutMs
      }
    }
  };
}

function job(data, overrides = {}) {
  return {
    id: 'job-1',
    attemptsMade: 0,
    data: {
      jobId: 'wa-start-session-empresa-5-1',
      command: 'START_SESSION',
      empresaId: 5,
      requestedAt: '2026-07-16T10:00:00.000Z',
      payload: {},
      ...data
    },
    ...overrides
  };
}

function logger() {
  return { info() {}, warn() {}, error() {} };
}

test('processor revalidates payload and does not retry invalid commands', async () => {
  const processor = createWhatsappCommandProcessor({
    service: {},
    config: config(),
    loggerInstance: logger()
  });

  await assert.rejects(
    () => processor(job({ command: 'BAD_COMMAND' })),
    UnrecoverableError
  );
});

test('RESTART executes disconnect then start in order', async () => {
  const calls = [];
  const processor = createWhatsappCommandProcessor({
    service: {
      async disconnectSession(empresaId) {
        calls.push(['disconnect', empresaId]);
        return { status: 'DISCONNECTED' };
      },
      async startSession(empresaId) {
        calls.push(['start', empresaId]);
        return { status: 'INITIALIZING' };
      }
    },
    config: config(),
    loggerInstance: logger()
  });

  await processor(job({ command: 'RESTART_SESSION' }));

  assert.deepEqual(calls, [['disconnect', 5], ['start', 5]]);
});

test('RESTART uses provider restartSession when available', async () => {
  const calls = [];
  const processor = createWhatsappCommandProcessor({
    service: {
      async restartSession(empresaId) {
        calls.push(['restart', empresaId]);
        return { status: 'INITIALIZING' };
      },
      async disconnectSession(empresaId) {
        calls.push(['disconnect', empresaId]);
      },
      async startSession(empresaId) {
        calls.push(['start', empresaId]);
      }
    },
    config: config(),
    loggerInstance: logger()
  });

  await processor(job({ command: 'RESTART_SESSION' }));

  assert.deepEqual(calls, [['restart', 5]]);
});


test('GET_STATUS reads snapshot and does not create a session', async () => {
  let startCalls = 0;
  const processor = createWhatsappCommandProcessor({
    service: {
      async getStatusSnapshot(empresaId) {
        return { empresa_id: empresaId, status: 'CONNECTED' };
      },
      async startSession() {
        startCalls += 1;
      }
    },
    config: config(),
    loggerInstance: logger()
  });

  const result = await processor(job({ command: 'GET_STATUS' }));

  assert.equal(result.status, 'CONNECTED');
  assert.equal(startCalls, 0);
});

test('commands update desired state except GET_STATUS', async () => {
  const desired = [];
  const released = [];
  const acquired = [];
  const processor = createWhatsappCommandProcessor({
    service: {
      async startSession(empresaId) {
        return { empresa_id: empresaId, status: 'INITIALIZING' };
      },
      async restartSession(empresaId) {
        return { empresa_id: empresaId, status: 'INITIALIZING' };
      },
      async disconnectSession(empresaId) {
        return { empresa_id: empresaId, status: 'DISCONNECTED' };
      },
      async getStatusSnapshot(empresaId) {
        return { empresa_id: empresaId, status: 'CONNECTED' };
      }
    },
    companyProvider: {
      async setDesiredState(empresaId, state) {
        desired.push([empresaId, state]);
      }
    },
    sessionLease: {
      async acquire(empresaId) {
        acquired.push(empresaId);
      },
      async release(empresaId) {
        released.push(empresaId);
      }
    },
    config: config(),
    loggerInstance: logger()
  });

  await processor(job({ command: 'START_SESSION' }));
  await processor(job({ command: 'RESTART_SESSION' }));
  await processor(job({ command: 'GET_STATUS' }));
  await processor(job({ command: 'DISCONNECT_SESSION' }));

  assert.deepEqual(desired, [
    [5, 'CONNECTED'],
    [5, 'CONNECTED'],
    [5, 'DISCONNECTED']
  ]);
  assert.deepEqual(acquired, [5, 5]);
  assert.deepEqual(released, [5]);
});

test('temporary errors are retried by rethrowing original error', async () => {
  const error = Object.assign(new Error('temporary redis-like failure'), { code: 'ETEMP' });
  const processor = createWhatsappCommandProcessor({
    service: {
      async startSession() {
        throw error;
      }
    },
    config: config(),
    loggerInstance: logger()
  });

  await assert.rejects(
    () => processor(job()),
    (thrown) => thrown === error
  );
});

test('permanent plan/configuration errors are not retried', async () => {
  const error = Object.assign(new Error('plan limit exceeded'), { statusCode: 403 });
  const processor = createWhatsappCommandProcessor({
    service: {
      async startSession() {
        throw error;
      }
    },
    config: config(),
    loggerInstance: logger()
  });

  await assert.rejects(
    () => processor(job()),
    UnrecoverableError
  );
});

test('same company operations are serialized but different companies can run independently', async () => {
  const order = [];
  let releaseFirst;
  const firstStarted = new Promise((resolve) => {
    releaseFirst = () => {
      order.push('release-first');
      resolve();
    };
  });
  const processor = createWhatsappCommandProcessor({
    service: {
      async startSession(empresaId) {
        order.push(`start-${empresaId}`);
        if (empresaId === 5 && !order.includes('release-first')) {
          await firstStarted;
        }
        order.push(`done-${empresaId}`);
        return { empresa_id: empresaId, status: 'INITIALIZING' };
      }
    },
    config: config(),
    loggerInstance: logger()
  });

  const first = processor(job({ empresaId: 5 }));
  await new Promise((resolve) => setImmediate(resolve));
  const second = processor(job({ empresaId: 5 }, { id: 'job-2' }));
  const third = processor(job({ empresaId: 6 }, { id: 'job-3' }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(order.slice(0, 2), ['start-5', 'start-6']);
  releaseFirst();
  await Promise.all([first, second, third]);
  assert.equal(order.indexOf('start-5'), 0);
  assert.equal(order.lastIndexOf('start-5') > order.indexOf('done-5'), true);
});
