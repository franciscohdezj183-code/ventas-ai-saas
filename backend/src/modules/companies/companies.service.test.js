import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompany } from './companies.service.js';

test('company onboarding creates default Baileys WhatsApp config without starting a session', async () => {
  const calls = [];
  const sessions = [];
  const company = await createCompany({ nombre: 'Nueva Empresa' }, {
    async queryFn(sql, params) {
      calls.push({ sql, params });
      return [{ insertId: 42 }];
    },
    providerService: {
      async ensureDefaultSessionConfig(empresaId) {
        sessions.push(empresaId);
        return {
          empresaId,
          provider: 'baileys',
          desiredState: 'DISCONNECTED',
          autoRestore: true
        };
      },
      async startSession() {
        throw new Error('should not start session during onboarding');
      }
    },
    async findCompany(companyId) {
      return { id: companyId, nombre: 'Nueva Empresa' };
    }
  });

  assert.equal(company.id, 42);
  assert.deepEqual(sessions, [42]);
  assert.equal(calls.length, 1);
});
