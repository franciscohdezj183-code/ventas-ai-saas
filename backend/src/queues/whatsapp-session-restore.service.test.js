import assert from 'node:assert/strict';
import test from 'node:test';
import { createWhatsappSessionRestoreService } from './whatsapp-session-restore.service.js';

test('restore starts only restorable sessions and continues after failures', async () => {
  const started = [];
  const leases = [];
  const service = createWhatsappSessionRestoreService({
    config: { whatsapp: { restore: { concurrency: 2, delayMs: 0 } } },
    companyProvider: {
      async listRestorableSessions() {
        return [
          { empresaId: 5, effectiveProvider: 'baileys' },
          { empresaId: 6, effectiveProvider: 'whatsapp-web' }
        ];
      }
    },
    sessionLease: {
      async acquire(empresaId) {
        leases.push(empresaId);
      }
    },
    service: {
      async startSession(empresaId) {
        started.push(empresaId);
        if (empresaId === 6) {
          throw new Error('temporary failure');
        }
        return { status: 'INITIALIZING' };
      }
    },
    recoveryStore: {
      async schedule() {},
      async started() {},
      async connected() {},
      async retryableFailure() {}
    },
    getRegistry: () => ({ status: 'ready' }),
    loggerInstance: { info() {}, warn() {}, error() {} },
    delayFn: async () => {}
  });

  const result = await service.restoreDesiredSessions();

  assert.deepEqual(leases.sort(), [5, 6]);
  assert.deepEqual(started.sort(), [5, 6]);
  assert.equal(result.restored, 1);
  assert.equal(result.failed, 1);
});

test('standby does not restore sessions', async () => {
  let listed = false;
  const service = createWhatsappSessionRestoreService({
    config: { whatsapp: { restore: { concurrency: 2, delayMs: 0, spreadMs: 0 }, reconnect: { maxConcurrency: 2 } } },
    companyProvider: {
      async listRestorableSessions() {
        listed = true;
        return [];
      }
    },
    isLeader: () => false
  });

  const result = await service.restoreDesiredSessions();

  assert.equal(listed, false);
  assert.equal(result.total, 0);
});

test('50 simulated companies never exceed configured restore concurrency', async () => {
  let active = 0;
  let observed = 0;
  const started = [];
  const release = [];
  const blockers = [];
  const service = createWhatsappSessionRestoreService({
    config: { whatsapp: { restore: { concurrency: 10, delayMs: 0, spreadMs: 0 }, reconnect: { maxConcurrency: 3 } }, queue: { enabled: true } },
    companyProvider: {
      async listRestorableSessions() {
        return Array.from({ length: 50 }, (_, index) => ({ empresaId: index + 1, effectiveProvider: 'baileys' }));
      }
    },
    sessionLease: {
      async acquire() {}
    },
    service: {
      async startSession(empresaId) {
        active += 1;
        observed = Math.max(observed, active);
        started.push(empresaId);
        await new Promise((resolve) => {
          blockers.push(resolve);
        });
        active -= 1;
        return { status: 'INITIALIZING' };
      }
    },
    recoveryStore: {
      async schedule() {},
      async started() {},
      async connected() {},
      async retryableFailure() {}
    },
    getRegistry: () => ({ status: 'ready' }),
    loggerInstance: { info() {}, warn() {}, error() {} },
    delayFn: async () => {},
    random: () => 0
  });

  const promise = service.restoreDesiredSessions();

  while (blockers.length < 3) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(observed, 3);

  while (blockers.length) {
    release.push(blockers.shift());
    release.at(-1)();
    await new Promise((resolve) => setImmediate(resolve));
  }

  const result = await promise;

  assert.equal(result.total, 50);
  assert.equal(result.restored, 50);
  assert.equal(result.maxObservedConcurrency, 3);
  assert.equal(started.length, 50);
});

test('Redis unavailable prevents restore sockets', async () => {
  let started = false;
  const service = createWhatsappSessionRestoreService({
    config: { whatsapp: { restore: { concurrency: 1, delayMs: 0, spreadMs: 0 }, reconnect: { maxConcurrency: 1 } }, queue: { enabled: true } },
    companyProvider: {
      async listRestorableSessions() {
        return [{ empresaId: 5, effectiveProvider: 'baileys' }];
      }
    },
    sessionLease: {
      async acquire() {}
    },
    service: {
      async startSession() {
        started = true;
      }
    },
    recoveryStore: {
      async schedule() {},
      async started() {},
      async connected() {},
      async retryableFailure() {}
    },
    getRegistry: () => ({ status: 'error' }),
    loggerInstance: { info() {}, warn() {}, error() {} },
    delayFn: async () => {}
  });

  const result = await service.restoreDesiredSessions();

  assert.equal(started, false);
  assert.equal(result.failed, 1);
});
