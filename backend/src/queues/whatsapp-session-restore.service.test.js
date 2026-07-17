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
    loggerInstance: { info() {}, warn() {}, error() {} },
    delayFn: async () => {}
  });

  const result = await service.restoreDesiredSessions();

  assert.deepEqual(leases.sort(), [5, 6]);
  assert.deepEqual(started.sort(), [5, 6]);
  assert.equal(result.restored, 1);
  assert.equal(result.failed, 1);
});
