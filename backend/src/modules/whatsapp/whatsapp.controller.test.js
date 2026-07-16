import assert from 'node:assert/strict';
import test from 'node:test';
import { sendCommandResponse } from './whatsapp.controller.js';

test('queued WhatsApp command responses use HTTP 202 with command_id', () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  sendCommandResponse(res, {
    empresa_id: 5,
    status: 'INITIALIZING',
    command_id: 'wa-start-session-empresa-5-1',
    command_status: 'QUEUED',
    queued: true,
    requested_at: '2026-07-16T10:00:00.000Z'
  });

  assert.equal(res.statusCode, 202);
  assert.equal(res.body.data.command_id, 'wa-start-session-empresa-5-1');
  assert.equal(res.body.data.queued, true);
});
