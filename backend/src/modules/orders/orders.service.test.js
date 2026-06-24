import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertConversationBelongsToCompany } from './orders.service.js';

describe('orders multi-tenant guards', () => {
  it('allows orders without a conversation reference', async () => {
    let called = false;

    await assertConversationBelongsToCompany(null, 1, async () => {
      called = true;
      return [[]];
    });

    assert.equal(called, false);
  });

  it('rejects conversation ids from another company', async () => {
    await assert.rejects(
      () => assertConversationBelongsToCompany(55, 1, async () => [[]]),
      /no pertenece a la empresa del pedido/
    );
  });

  it('accepts conversation ids that belong to the same company', async () => {
    await assert.doesNotReject(
      () => assertConversationBelongsToCompany(55, 1, async () => [[{ id: 55 }]])
    );
  });
});
