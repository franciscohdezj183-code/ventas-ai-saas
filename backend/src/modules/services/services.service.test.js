import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertServiceCategoryBelongsToCompany } from './services.service.js';

describe('service company scope', () => {
  it('accepts a service category owned by the same company', async () => {
    const calls = [];

    await assertServiceCategoryBelongsToCompany(7, 10, async (sql, params) => {
      calls.push({ sql, params });
      return [[{ id: 7 }]];
    });

    assert.deepEqual(calls[0].params, [7, 10]);
    assert.match(calls[0].sql, /empresa_id = \?/);
    assert.match(calls[0].sql, /tipo = 'SERVICIO'/);
  });

  it('rejects a category from another company', async () => {
    await assert.rejects(
      () => assertServiceCategoryBelongsToCompany(7, 10, async () => [[]]),
      (error) => error.statusCode === 400 && /no pertenece/.test(error.message)
    );
  });

  it('allows services without a category', async () => {
    let queried = false;

    await assertServiceCategoryBelongsToCompany(null, 10, async () => {
      queried = true;
      return [[]];
    });

    assert.equal(queried, false);
  });
});
