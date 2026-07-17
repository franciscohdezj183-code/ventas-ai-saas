import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWhatsappCommandJobId,
  createWhatsappCommandService
} from './whatsapp-command.service.js';

function config(overrides = {}) {
  return {
    whatsapp: {
      commandsViaQueue: false,
      commandWorker: {
        staleMs: 300000
      },
      ...overrides.whatsapp
    },
    ...overrides
  };
}

function createQueueWrapper({ existingJob = null } = {}) {
  const calls = [];
  return {
    calls,
    status: 'ready',
    queue: {
      async getJob(jobId) {
        calls.push({ type: 'getJob', jobId });
        return existingJob;
      }
    },
    async enqueue(payload) {
      calls.push({ type: 'enqueue', payload });
      return { id: `whatsapp-command-${payload.jobId}` };
    }
  };
}

function logger() {
  return { logs: [], info(message, meta) { this.logs.push({ message, meta }); }, warn() {}, error() {} };
}

test('queue mode false delegates start directly', async () => {
  const calls = [];
  const service = createWhatsappCommandService({
    config: config(),
    provider: {
      async startSession(empresaId) {
        calls.push(['startSession', empresaId]);
        return { empresa_id: empresaId, status: 'INITIALIZING' };
      }
    }
  });

  const result = await service.requestStartSession(5);

  assert.deepEqual(calls, [['startSession', 5]]);
  assert.equal(result.queued, undefined);
});

test('queue mode true enqueues START and does not call provider directly', async () => {
  const queueWrapper = createQueueWrapper();
  let providerCalls = 0;
  const service = createWhatsappCommandService({
    config: config({ whatsapp: { commandsViaQueue: true, commandWorker: { staleMs: 300000 } } }),
    provider: {
      async startSession() {
        providerCalls += 1;
      }
    },
    getRegistry: () => ({ whatsappCommandQueue: queueWrapper }),
    now: () => new Date('2026-07-16T10:00:00.000Z').getTime(),
    uuid: () => 'request-1',
    loggerInstance: logger()
  });

  const result = await service.requestStartSession(5, { requestedBy: 'user:9' });

  assert.equal(providerCalls, 0);
  assert.equal(result.queued, true);
  assert.equal(result.command_status, 'QUEUED');
  assert.equal(result.status, 'INITIALIZING');
  assert.match(result.command_id, /^wa-start-session-empresa-5-/);
  assert.equal(queueWrapper.calls.find((call) => call.type === 'enqueue').payload.command, 'START_SESSION');
});

test('duplicate START is deduplicated by command window', async () => {
  const queueWrapper = createQueueWrapper({
    existingJob: {
      async getState() {
        return 'waiting';
      }
    }
  });
  const loggerInstance = logger();
  const service = createWhatsappCommandService({
    config: config({ whatsapp: { commandsViaQueue: true, commandWorker: { staleMs: 300000 } } }),
    getRegistry: () => ({ whatsappCommandQueue: queueWrapper }),
    now: () => 1000,
    loggerInstance
  });

  const result = await service.requestStartSession(5);

  assert.equal(result.duplicate, true);
  assert.equal(queueWrapper.calls.some((call) => call.type === 'enqueue'), false);
  assert.equal(loggerInstance.logs.some((log) => log.message === 'whatsapp_command_duplicate'), true);
});

test('DISCONNECT is deduplicated separately from START', () => {
  const startId = createWhatsappCommandJobId('START_SESSION', 5, { now: 1000, staleMs: 300000 });
  const disconnectId = createWhatsappCommandJobId('DISCONNECT_SESSION', 5, { now: 1000, staleMs: 300000 });

  assert.notEqual(startId, disconnectId);
  assert.match(disconnectId, /^wa-disconnect-session-empresa-5-/);
});

test('queue mode true enqueues exactly one RESTART and not DISCONNECT plus START', async () => {
  const queueWrapper = createQueueWrapper();
  const providerCalls = [];
  const service = createWhatsappCommandService({
    config: config({ whatsapp: { commandsViaQueue: true, commandWorker: { staleMs: 300000 } } }),
    provider: {
      async disconnectSession(empresaId) {
        providerCalls.push(['disconnectSession', empresaId]);
      },
      async startSession(empresaId) {
        providerCalls.push(['startSession', empresaId]);
      }
    },
    getRegistry: () => ({ whatsappCommandQueue: queueWrapper }),
    now: () => new Date('2026-07-16T10:00:00.000Z').getTime(),
    uuid: () => 'request-1',
    loggerInstance: logger()
  });

  const result = await service.requestRestartSession(5, { requestedBy: 'user:9' });
  const enqueueCalls = queueWrapper.calls.filter((call) => call.type === 'enqueue');

  assert.equal(result.queued, true);
  assert.match(result.command_id, /^wa-restart-session-empresa-5-/);
  assert.deepEqual(providerCalls, []);
  assert.equal(enqueueCalls.length, 1);
  assert.equal(enqueueCalls[0].payload.command, 'RESTART_SESSION');
  assert.equal(queueWrapper.calls.some((call) => call.payload?.command === 'DISCONNECT_SESSION'), false);
  assert.equal(queueWrapper.calls.some((call) => call.payload?.command === 'START_SESSION'), false);
});

test('queue mode false keeps compatible restart by disconnecting then starting directly', async () => {
  const calls = [];
  const service = createWhatsappCommandService({
    config: config(),
    provider: {
      async disconnectSession(empresaId) {
        calls.push(['disconnectSession', empresaId]);
        return { empresa_id: empresaId, status: 'DISCONNECTED' };
      },
      async startSession(empresaId) {
        calls.push(['startSession', empresaId]);
        return { empresa_id: empresaId, status: 'INITIALIZING' };
      }
    }
  });

  const result = await service.requestRestartSession(5);

  assert.deepEqual(calls, [
    ['disconnectSession', 5],
    ['startSession', 5]
  ]);
  assert.equal(result.queued, undefined);
  assert.equal(result.status, 'INITIALIZING');
});
