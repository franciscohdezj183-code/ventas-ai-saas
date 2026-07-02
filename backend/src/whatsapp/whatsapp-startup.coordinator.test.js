import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  backoffWithJitter,
  isLockedLocalAuthError,
  isTargetClosedError,
  resetWhatsappStartupCoordinatorForTests,
  withGlobalWhatsappInitLock
} from './whatsapp-startup.coordinator.js';

describe('WhatsApp startup coordinator', () => {
  it('serializes browser initialization globally', async () => {
    resetWhatsappStartupCoordinatorForTests();
    const order = [];
    const first = withGlobalWhatsappInitLock(async () => {
      order.push('first-start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('first-end');
    });
    const second = withGlobalWhatsappInitLock(async () => {
      order.push('second-start');
      order.push('second-end');
    });

    await Promise.all([first, second]);
    assert.deepEqual(order, ['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('classifies browser and LocalAuth lock errors', () => {
    assert.equal(isTargetClosedError(new Error('Protocol error: Target closed')), true);
    assert.equal(isTargetClosedError(new Error('Execution context was destroyed')), true);
    assert.equal(isLockedLocalAuthError({ code: 'EBUSY' }), true);
    assert.equal(isLockedLocalAuthError(new Error('EPERM removing folder')), true);
    assert.equal(isLockedLocalAuthError(new Error('The browser is already running for C:\\session-company_5. Use a different `userDataDir` or stop the running browser first.')), true);
  });

  it('calculates bounded exponential backoff with jitter', () => {
    const delay = backoffWithJitter(3, {
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      jitterRatio: 0.2,
      random: () => 0.5
    });

    assert.equal(delay, 4000);
  });
});
