import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requireTenantScope } from './access-control.middleware.js';
import { authorizePermissions, authorizeRoles } from './roles.middleware.js';

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

  it('normalizes legacy and lowercase role names', async () => {
    const error = await runMiddleware(authorizeRoles('SUPER_ADMIN'), {
      auth: {
        user: {
          rol: 'super_admin'
        }
      }
    });

    assert.equal(error, null);
  });
});

describe('authorizePermissions', () => {
  it('allows roles with the required permission', async () => {
    const error = await runMiddleware(authorizePermissions('conversations.manage'), {
      auth: {
        user: {
          rol: 'support'
        }
      }
    });

    assert.equal(error, null);
  });

  it('allows super-admin through permission-based company configuration controls', async () => {
    const error = await runMiddleware(authorizePermissions('ai_config.manage'), {
      auth: {
        user: {
          rol: 'super_admin'
        }
      }
    });

    assert.equal(error, null);
  });

  it('rejects roles without the required permission', async () => {
    const error = await runMiddleware(authorizePermissions('users.manage'), {
      auth: {
        user: {
          rol: 'viewer'
        }
      }
    });

    assert.equal(error.statusCode, 403);
  });
});

describe('requireTenantScope', () => {
  it('binds non super-admin users to their authenticated tenant', async () => {
    const req = {
      auth: {
        user: {
          empresaId: 10,
          rol: 'seller'
        }
      },
      body: {},
      params: {},
      query: {}
    };
    const error = await runMiddleware(requireTenantScope, req);

    assert.equal(error, null);
    assert.equal(req.tenant.id, 10);
    assert.equal(req.tenant.isSuperAdmin, false);
  });

  it('rejects cross-tenant access for non super-admin users', async () => {
    const error = await runMiddleware(requireTenantScope, {
      auth: {
        user: {
          empresaId: 10,
          rol: 'support'
        }
      },
      body: {
        tenant_id: 99
      },
      params: {},
      query: {}
    });

    assert.equal(error.statusCode, 403);
  });

  it('rejects cross-tenant access sent through companyId aliases', async () => {
    const error = await runMiddleware(requireTenantScope, {
      auth: {
        user: {
          empresaId: 10,
          rol: 'owner'
        }
      },
      body: {
        companyId: 99
      },
      params: {},
      query: {}
    });

    assert.equal(error.statusCode, 403);
  });

  it('rejects contradictory tenant identifiers before reaching controllers', async () => {
    const error = await runMiddleware(requireTenantScope, {
      auth: {
        user: {
          empresaId: 10,
          rol: 'super_admin'
        }
      },
      body: {
        empresa_id: 10
      },
      params: {
        empresaId: 99
      },
      query: {}
    });

    assert.equal(error.statusCode, 400);
    assert.match(error.message, /contradictorios/);
  });

  it('allows super-admin users to target any tenant', async () => {
    const req = {
      auth: {
        user: {
          empresaId: 1,
          rol: 'super_admin'
        }
      },
      body: {},
      params: {
        tenant_id: 99
      },
      query: {}
    };
    const error = await runMiddleware(requireTenantScope, req);

    assert.equal(error, null);
    assert.equal(req.tenant.id, 99);
    assert.equal(req.tenant.isSuperAdmin, true);
  });
});
