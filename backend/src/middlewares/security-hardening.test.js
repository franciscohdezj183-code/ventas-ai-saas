import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import express from 'express';
import { app as apiApp } from '../app.js';
import { closeDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { errorHandler } from './error.middleware.js';
import { uploadProductImage } from './upload.middleware.js';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function request(server, pathName, options = {}) {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return fetch(`${baseUrl}${pathName}`, options);
}

describe('production security hardening', () => {
  after(async () => {
    await closeDatabase();
  });

  it('does not expose private import uploads through the public static uploads route', async () => {
    const importDir = path.resolve('uploads/imports');
    const importFile = path.join(importDir, 'security-hardening-private.xlsx');
    await fs.mkdir(importDir, { recursive: true });
    await fs.writeFile(importFile, 'private import data');

    const server = await listen(apiApp);

    try {
      const response = await request(server, '/uploads/imports/security-hardening-private.xlsx');
      assert.equal(response.status, 404);
    } finally {
      await fs.unlink(importFile).catch(() => {});
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('preserves explicit HTTP status values in the error handler', async () => {
    const testApp = express();
    testApp.get('/bad-request', (req, res, next) => {
      const error = new Error('Invalid payload');
      error.status = 400;
      next(error);
    });
    testApp.use(errorHandler);
    const server = await listen(testApp);

    try {
      const response = await request(server, '/bad-request');
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.equal(payload.statusCode, 400);
      assert.equal(payload.message, 'Invalid payload');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('redacts sensitive values before writing structured logs', () => {
    const originalConsoleLog = console.log;
    const lines = [];
    console.log = (line) => {
      lines.push(line);
    };

    try {
      logger.info('security_log_redaction_test', {
        authorization: 'Bearer super-secret-token',
      nested: {
        password: 'PlainPassword123!',
        openai_api_key: 'sk-test-secret',
        url: '/callback?token=abc123&code=oauth-code'
      },
      statusCode: 200
    });
    } finally {
      console.log = originalConsoleLog;
    }

    assert.equal(lines.length, 1);
    const line = lines[0];

    assert.equal(line.includes('super-secret-token'), false);
    assert.equal(line.includes('PlainPassword123!'), false);
    assert.equal(line.includes('sk-test-secret'), false);
    assert.equal(line.includes('abc123'), false);
    assert.equal(line.includes('oauth-code'), false);
    assert.equal(line.includes('"statusCode":200'), true);
    assert.equal(line.includes('[REDACTED]'), true);
  });

  it('rejects disallowed CORS origins with 403 instead of exposing internals', async () => {
    const server = await listen(apiApp);

    try {
      const response = await request(server, '/api/health', {
        headers: {
          Origin: 'https://evil.example'
        }
      });
      const payload = await response.json();

      assert.equal(response.status, 403);
      assert.equal(payload.statusCode, 403);
      assert.equal(payload.message, 'CORS origin not allowed');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns 400 for files that exceed upload limits', async () => {
    const testApp = express();
    testApp.post('/upload', uploadProductImage, (req, res) => {
      res.status(201).json({ ok: true });
    });
    testApp.use(errorHandler);
    const server = await listen(testApp);
    const form = new FormData();
    const oversizedImage = new Blob([Buffer.alloc(3 * 1024 * 1024 + 1)], { type: 'image/png' });
    form.append('imagen', oversizedImage, 'large.png');

    try {
      const response = await request(server, '/upload', {
        method: 'POST',
        body: form
      });
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.equal(payload.statusCode, 400);
      assert.equal(payload.message, 'El archivo excede el tamano maximo permitido');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
