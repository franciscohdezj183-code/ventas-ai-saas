import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSingleFlight,
  createWhatsappCommandPoller,
  isQueuedCommandResponse,
  isTerminalWhatsappStatus,
  WHATSAPP_COMMAND_POLL_INTERVAL_MS
} from './whatsappCommandFlow.js';

test('queued command responses are not session statuses', () => {
  assert.equal(isQueuedCommandResponse({ http_status: 202, queued: true, command_id: 'wa-start-session-empresa-5-1' }), true);
  assert.equal(isQueuedCommandResponse({ status: 'CONNECTED', empresa_id: 5 }), false);
});

test('single-flight collapses two quick command clicks into one logical request', async () => {
  const run = createSingleFlight();
  let calls = 0;
  const task = () => {
    calls += 1;
    return Promise.resolve({ queued: true });
  };

  const [first, second] = await Promise.all([run(task), run(task)]);

  assert.deepEqual(first, { queued: true });
  assert.deepEqual(second, { queued: true });
  assert.equal(calls, 1);
});

test('polling only calls status loader and never command functions', async () => {
  const timers = [];
  let commandCalls = 0;
  let statusCalls = 0;
  const poller = createWhatsappCommandPoller({
    loadStatus: async () => {
      statusCalls += 1;
      return { status: 'INITIALIZING' };
    },
    setTimeoutFn(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeoutFn() {}
  });

  poller.start();
  await timers.shift().callback();
  const command = () => {
    commandCalls += 1;
  };

  assert.equal(commandCalls, 0);
  assert.equal(statusCalls, 1);
  assert.equal(timers[0].delay, WHATSAPP_COMMAND_POLL_INTERVAL_MS);
  command();
  assert.equal(commandCalls, 1);
});

test('polling stops in terminal status', async () => {
  const timers = [];
  let done = null;
  const poller = createWhatsappCommandPoller({
    loadStatus: async () => ({ status: 'QR_READY' }),
    onDone: (result) => {
      done = result;
    },
    setTimeoutFn(callback) {
      timers.push(callback);
      return timers.length;
    },
    clearTimeoutFn() {}
  });

  poller.start();
  await timers.shift()();

  assert.equal(done.status.status, 'QR_READY');
  assert.equal(poller.isRunning(), false);
  assert.equal(isTerminalWhatsappStatus({ status: 'QR_READY' }), true);
});

test('polling cleanup removes pending timer on unmount', () => {
  const cleared = [];
  const poller = createWhatsappCommandPoller({
    loadStatus: async () => ({ status: 'INITIALIZING' }),
    setTimeoutFn() {
      return 42;
    },
    clearTimeoutFn(timer) {
      cleared.push(timer);
    }
  });

  poller.start();
  poller.stop();

  assert.deepEqual(cleared, [42]);
  assert.equal(poller.isRunning(), false);
});

test('polling stops by timeout when no terminal status arrives', async () => {
  const timers = [];
  let currentTime = 0;
  let done = null;
  const poller = createWhatsappCommandPoller({
    loadStatus: async () => ({ status: 'INITIALIZING' }),
    onDone: (result) => {
      done = result;
    },
    now: () => currentTime,
    timeoutMs: 2000,
    intervalMs: 2000,
    setTimeoutFn(callback) {
      timers.push(callback);
      return timers.length;
    },
    clearTimeoutFn() {}
  });

  poller.start();
  currentTime = 2000;
  await timers.shift()();

  assert.equal(done.timedOut, true);
  assert.equal(poller.isRunning(), false);
});
