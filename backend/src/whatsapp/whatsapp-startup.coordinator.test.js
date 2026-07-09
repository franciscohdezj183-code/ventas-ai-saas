import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  backoffWithJitter,
  isExpectedWhatsappLateRejection,
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

  it('classifies expected late whatsapp-web.js rejections after logout cleanup', () => {
    const contextDestroyed = new Error('Execution context was destroyed');
    contextDestroyed.stack = [
      'Error: Execution context was destroyed',
      '    at CdpPage.evaluate (node_modules\\puppeteer-core\\lib\\cjs\\puppeteer\\api\\Page.js:830:43)',
      '    at Client.inject (node_modules\\whatsapp-web.js\\src\\Client.js:126:38)'
    ].join('\n');
    const duplicateBinding = new Error("Failed to add page binding with name onQRChangedEvent: window['onQRChangedEvent'] already exists!");
    duplicateBinding.stack = [
      "Error: Failed to add page binding with name onQRChangedEvent: window['onQRChangedEvent'] already exists!",
      '    at CdpPage.exposeFunction (node_modules\\puppeteer-core\\lib\\cjs\\puppeteer\\cdp\\Page.js:579:19)',
      '    at Client.inject (node_modules\\whatsapp-web.js\\src\\Client.js:224:17)'
    ].join('\n');
    const detachedFrame = new Error("Attempted to use detached Frame '630021843673B7B9609D0158A079AD4B'.");
    detachedFrame.stack = [
      "Error: Attempted to use detached Frame '630021843673B7B9609D0158A079AD4B'.",
      '    at CdpPage.evaluate (node_modules\\puppeteer-core\\lib\\cjs\\puppeteer\\api\\Page.js:830:43)',
      '    at Client.inject (node_modules\\whatsapp-web.js\\src\\Client.js:126:38)'
    ].join('\n');

    assert.equal(isExpectedWhatsappLateRejection(contextDestroyed), true);
    assert.equal(isExpectedWhatsappLateRejection(duplicateBinding), true);
    assert.equal(isExpectedWhatsappLateRejection(detachedFrame), true);
    assert.equal(isExpectedWhatsappLateRejection(new Error('database down')), false);
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
