import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { app } from '../../app.js';

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

describe('whatsapp routes', () => {
  it('rejects requests without token', async () => {
    const server = await listen();

    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/whatsapp/session/status`);
      assert.equal(response.status, 401);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
