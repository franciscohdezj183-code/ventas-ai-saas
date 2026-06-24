import assert from 'node:assert/strict';
import { afterEach, it } from 'node:test';
import { env } from '../../config/env.js';
import { resetOpenAIHealthForTests, validateOpenAIKey } from '../../ai/openai-health.service.js';
import { getAIStatus } from './ai.service.js';

const originalApiKey = env.openai.apiKey;

afterEach(() => {
  env.openai.apiKey = originalApiKey;
  resetOpenAIHealthForTests();
});

it('getAIStatus exposes health metadata but never the OpenAI key', async () => {
  env.openai.apiKey = 'private-test-key';
  resetOpenAIHealthForTests();
  await validateOpenAIKey({
    client: {
      models: {
        list: async () => {
          const error = new Error('Incorrect API key provided');
          error.status = 401;
          error.code = 'invalid_api_key';
          throw error;
        }
      }
    }
  });

  const status = getAIStatus();
  const serialized = JSON.stringify(status);

  assert.equal(status.configured, true);
  assert.equal(status.validated, false);
  assert.equal(status.status, 'invalid_api_key');
  assert.equal(serialized.includes('private-test-key'), false);
  assert.equal(Object.hasOwn(status, 'apiKey'), false);
});
