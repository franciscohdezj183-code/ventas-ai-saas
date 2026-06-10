import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendCompanyScope,
  companyScopeCondition,
  isSuperAdmin,
  resolveScopedEmpresaId
} from './company-scope.middleware.js';

const ownerAuth = {
  user: {
    rol: 'OWNER',
    empresaId: 10
  }
};

const superAdminAuth = {
  user: {
    rol: 'SUPER_ADMIN',
    empresaId: 1
  }
};

describe('company scope middleware helpers', () => {
  it('forces OWNER requests to the authenticated company', () => {
    assert.equal(resolveScopedEmpresaId(ownerAuth, 999), 10);
  });

  it('builds scoped SQL conditions for OWNER queries', () => {
    assert.deepEqual(companyScopeCondition(ownerAuth, 'p'), {
      clause: 'p.empresa_id = ?',
      params: [10]
    });

    assert.deepEqual(appendCompanyScope(ownerAuth, [55], 'productos'), {
      clause: 'AND productos.empresa_id = ?',
      params: [55, 10]
    });
  });

  it('allows SUPER_ADMIN to target any company explicitly', () => {
    assert.equal(isSuperAdmin(superAdminAuth), true);
    assert.equal(resolveScopedEmpresaId(superAdminAuth, 999), 999);
    assert.deepEqual(companyScopeCondition(superAdminAuth, 'p'), {
      clause: '',
      params: []
    });
  });

  it('requires SUPER_ADMIN to send empresa_id when a scoped operation needs one', () => {
    assert.throws(() => resolveScopedEmpresaId(superAdminAuth, undefined), /La empresa es requerida/);
  });
});
