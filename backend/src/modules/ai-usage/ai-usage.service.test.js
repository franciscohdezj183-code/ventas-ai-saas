import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertUsageReferencesBelongToTenant } from './ai-usage.service.js';

describe('ai usage multi-tenant guards', () => {
  it('accepts usage without optional user or conversation references', async () => {
    let called = false;

    await assertUsageReferencesBelongToTenant({ tenantId: 1, userId: null, conversationId: null }, async () => {
      called = true;
      return [[]];
    });

    assert.equal(called, false);
  });

  it('rejects user ids from another company', async () => {
    await assert.rejects(
      () => assertUsageReferencesBelongToTenant({ tenantId: 1, userId: 22, conversationId: null }, async () => [[]]),
      /usuario de consumo IA no pertenece/
    );
  });

  it('rejects conversation ids from another company', async () => {
    const fakeQuery = async (sql) => {
      if (sql.includes('FROM usuarios')) {
        return [[{ id: 22 }]];
      }

      return [[]];
    };

    await assert.rejects(
      () => assertUsageReferencesBelongToTenant({ tenantId: 1, userId: 22, conversationId: 33 }, fakeQuery),
      /conversacion de consumo IA no pertenece/
    );
  });

  it('accepts references that belong to the same tenant', async () => {
    await assert.doesNotReject(
      () => assertUsageReferencesBelongToTenant(
        { tenantId: 1, userId: 22, conversationId: 33 },
        async () => [[{ id: 1 }]]
      )
    );
  });
});
