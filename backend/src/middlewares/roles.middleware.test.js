import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeRoles } from './roles.middleware.js';

function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error ?? null));
  });
}

describe('authorizeRoles', () => {
  it('allows users with an allowed role', async () => {
    const error = await runMiddleware(authorizeRoles('OWNER'), {
      auth: {
        user: {
          rol: 'OWNER'
        }
      }
    });

    assert.equal(error, null);
  });

  it('rejects users without an allowed role', async () => {
    const error = await runMiddleware(authorizeRoles('SUPER_ADMIN'), {
      auth: {
        user: {
          rol: 'OWNER'
        }
      }
    });

    assert.equal(error.statusCode, 403);
  });

  it('requires an authenticated user', async () => {
    const error = await runMiddleware(authorizeRoles('OWNER'), {});

    assert.equal(error.statusCode, 401);
  });
});
