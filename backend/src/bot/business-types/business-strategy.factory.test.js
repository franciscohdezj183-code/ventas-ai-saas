import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getBusinessStrategy } from './business-strategy.factory.js';

describe('business strategy factory', () => {
  it('uses product strategy for product businesses', () => {
    assert.equal(getBusinessStrategy({ tipo_negocio: 'PRODUCTOS' }).type, 'PRODUCTOS');
    assert.equal(getBusinessStrategy({ tipo_negocio: 'Tienda' }).type, 'PRODUCTOS');
  });

  it('uses service strategy for service businesses', () => {
    assert.equal(getBusinessStrategy({ tipo_negocio: 'SERVICIOS' }).type, 'SERVICIOS');
    assert.equal(getBusinessStrategy({ tipo_negocio: 'Servicio' }).type, 'SERVICIOS');
  });

  it('uses mixed strategy for mixed or undefined businesses', () => {
    assert.equal(getBusinessStrategy({ tipo_negocio: 'MIXTO' }).type, 'MIXTO');
    assert.equal(getBusinessStrategy({ tipo_negocio: 'PRODUCTOS_SERVICIOS' }).type, 'MIXTO');
    assert.equal(getBusinessStrategy({}).type, 'MIXTO');
  });
});
