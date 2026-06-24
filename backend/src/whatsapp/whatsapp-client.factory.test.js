import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createWhatsappClient } from './whatsapp-client.factory.js';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  WHATSAPP_HEADLESS: process.env.WHATSAPP_HEADLESS,
  WHATSAPP_PUPPETEER_ARGS: process.env.WHATSAPP_PUPPETEER_ARGS,
  WHATSAPP_PUPPETEER_EXECUTABLE_PATH: process.env.WHATSAPP_PUPPETEER_EXECUTABLE_PATH
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('whatsapp client factory', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('uses production Chromium flags and configured Puppeteer options', () => {
    process.env.NODE_ENV = 'production';
    process.env.WHATSAPP_HEADLESS = 'false';
    process.env.WHATSAPP_PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium';
    process.env.WHATSAPP_PUPPETEER_ARGS = '--single-process,--disable-dev-shm-usage';

    const client = createWhatsappClient(5);

    assert.equal(client.options.puppeteer.headless, false);
    assert.equal(client.options.puppeteer.executablePath, '/usr/bin/chromium');
    assert.ok(client.options.puppeteer.args.includes('--no-sandbox'));
    assert.ok(client.options.puppeteer.args.includes('--disable-setuid-sandbox'));
    assert.ok(client.options.puppeteer.args.includes('--single-process'));
    assert.equal(
      client.options.puppeteer.args.filter((arg) => arg === '--disable-dev-shm-usage').length,
      1
    );
  });
});
