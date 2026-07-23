import assert from 'node:assert/strict';
import { it } from 'node:test';
import { classifyAppError } from './error-classifier.js';

it('classifies MySQL bad field errors separately from OpenAI', () => {
  const error = new Error("Unknown column 'ce.conversation_engine_version' in 'field list'");
  error.code = 'ER_BAD_FIELD_ERROR';
  error.errno = 1054;
  error.sqlState = '42S22';
  error.sqlMessage = "Unknown column 'ce.conversation_engine_version' in 'field list'";
  error.sql = 'SELECT ce.conversation_engine_version FROM configuracion_empresas ce';

  const result = classifyAppError(error);

  assert.equal(result.category, 'mysql');
  assert.equal(result.status, 'mysql_error');
  assert.equal(result.mysql.errorCode, 'ER_BAD_FIELD_ERROR');
  assert.equal(result.mysql.errno, 1054);
  assert.equal(result.mysql.sqlState, '42S22');
  assert.match(result.mysql.sqlMessage, /conversation_engine_version/);
  assert.match(result.mysql.sql, /configuracion_empresas/);
});

it('keeps OpenAI rate limit errors classified as OpenAI', () => {
  const error = new Error('rate limit exceeded');
  error.status = 429;
  error.code = 'rate_limit_exceeded';

  const result = classifyAppError(error);

  assert.equal(result.category, 'openai');
  assert.equal(result.status, 'rate_limited');
  assert.equal(result.openai.errorCode, 'rate_limit_exceeded');
});
