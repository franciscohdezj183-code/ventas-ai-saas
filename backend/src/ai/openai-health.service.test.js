import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { env } from '../config/env.js';
import {
  classifyOpenAIError,
  getOpenAIHealthSnapshot,
  resetOpenAIHealthForTests,
  validateOpenAIKey
} from './openai-health.service.js';

const originalApiKey = env.openai.apiKey;

afterEach(() => {
  env.openai.apiKey = originalApiKey;
  resetOpenAIHealthForTests();
});

describe('OpenAI health service', () => {
  it('reports a missing key without exposing secrets', async () => {
    env.openai.apiKey = '';
    resetOpenAIHealthForTests();

    const health = await validateOpenAIKey();

    assert.equal(health.configured, false);
    assert.equal(health.validated, false);
    assert.equal(health.status, 'missing_key');
    assert.equal(JSON.stringify(health).includes('apiKey'), false);
  });

  it('classifies invalid, forbidden, rate limit, timeout and server errors', () => {
    assert.deepEqual(
      classifyOpenAIError({ status: 401, code: 'invalid_api_key' }).status,
      'invalid_api_key'
    );
    assert.equal(classifyOpenAIError({ status: 403 }).status, 'forbidden');
    assert.equal(classifyOpenAIError({ status: 429 }).status, 'rate_limited');
    assert.equal(classifyOpenAIError({ name: 'TimeoutError' }).status, 'timeout');
    assert.equal(classifyOpenAIError({ status: 503 }).status, 'server_error');
    assert.equal(classifyOpenAIError({ code: 'model_not_found' }).status, 'model_error');
    assert.equal(classifyOpenAIError({ code: 'ENOTFOUND' }).status, 'network_error');
    assert.equal(classifyOpenAIError({ code: 'insufficient_quota' }).status, 'rate_limited');
    assert.equal(classifyOpenAIError({ status: 429 }).retryable, true);
    assert.equal(classifyOpenAIError({ status: 401 }).retryable, false);
    assert.equal(classifyOpenAIError({ code: 'ENOTFOUND' }).retryable, true);
  });

  it('stores a sanitized invalid-key result', async () => {
    env.openai.apiKey = 'test-secret-value';
    resetOpenAIHealthForTests();
    const client = {
      models: {
        list: async () => {
          const error = new Error('Incorrect API key provided: test-secret-value');
          error.status = 401;
          error.code = 'invalid_api_key';
          throw error;
        }
      }
    };

    const health = await validateOpenAIKey({ client });

    assert.equal(health.configured, true);
    assert.equal(health.validated, false);
    assert.equal(health.status, 'invalid_api_key');
    assert.equal(health.lastErrorCode, 'invalid_api_key');
    assert.equal(JSON.stringify(health).includes('test-secret-value'), false);
  });

  it('marks a successful validation as ok', async () => {
    env.openai.apiKey = 'test-secret-value';
    resetOpenAIHealthForTests();

    const health = await validateOpenAIKey({
      client: { models: { list: async () => ({ data: [] }) } }
    });

    assert.equal(health.validated, true);
    assert.equal(health.status, 'ok');
    assert.deepEqual(health, getOpenAIHealthSnapshot());
  });
});
