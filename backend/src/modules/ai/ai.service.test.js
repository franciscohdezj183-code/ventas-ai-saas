import assert from 'node:assert/strict';
import { afterEach, it, mock } from 'node:test';
import { env } from '../../config/env.js';
import { resetOpenAIHealthForTests, validateOpenAIKey } from '../../ai/openai-health.service.js';
import { mcpClient } from '../../mcp/mcpClient.js';
import { getAIStatus, processIncomingCustomerMessage } from './ai.service.js';

const originalApiKey = env.openai.apiKey;
const originalAutoReply = env.openai.autoReply;

afterEach(() => {
  env.openai.apiKey = originalApiKey;
  env.openai.autoReply = originalAutoReply;
  mock.restoreAll();
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

it('saves media-only messages with a safe fallback text when auto reply is disabled', async () => {
  env.openai.autoReply = false;
  const calls = [];

  mock.method(mcpClient, 'callTool', async (toolName, args) => {
    calls.push({ toolName, args });
    assert.equal(toolName, 'guardar_conversacion');
    return { conversacion_id: 501 };
  });

  const result = await processIncomingCustomerMessage({
    empresaId: 5,
    phone: '+527712444430',
    message: '',
    whatsappChatId: '196808420634826@lid',
    whatsappMessageId: 'message-id',
    incomingMedia: {
      hasMedia: true,
      type: 'image'
    }
  });

  assert.equal(result.conversacion_id, 501);
  assert.equal(calls[0].args.mensaje, '[image recibido]');
});
