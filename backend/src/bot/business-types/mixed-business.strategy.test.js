import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mixedBusinessStrategy } from './mixed-business.strategy.js';

function intent(overrides = {}) {
  return {
    intencion: 'MENSAJE_GENERAL',
    herramienta_mcp: '',
    parametros: {},
    confianza: 0.8,
    requiere_respuesta_ia: false,
    ...overrides
  };
}

function run(message, context = null, overrides = {}) {
  return mixedBusinessStrategy.prepareIntent(intent(overrides), {
    normalizedMessage: message,
    conversationContext: context
  });
}

function responseOf(result) {
  return result.parametros?.respuesta_sugerida ?? '';
}

describe('mixedBusinessStrategy commercial routing', () => {
  it('routes known service catalog terms to service search instead of asking for clarification', () => {
    const result = run('tienes lonas?');

    assert.equal(result.herramienta_mcp, 'buscar_servicios');
    assert.doesNotMatch(responseOf(result), /producto especifico/);
  });

  it('searches services before products when service wording also has product-like terms', () => {
    const result = run('hacen instalacion de lona?');

    assert.equal(result.intencion, 'BUSCAR_SERVICIO');
    assert.equal(result.herramienta_mcp, 'buscar_servicios');
  });

  it('keeps greeting messages as greetings even when the interpreter is generic', () => {
    const result = run('hola');

    assert.equal(result.intencion, 'SALUDO');
    assert.equal(result.herramienta_mcp, '');
    assert.equal(responseOf(result), '');
  });

  it('keeps asking for clarification when product or service intent is unclear', () => {
    const result = run('info');

    assert.equal(result.intencion, 'MENSAJE_GENERAL');
    assert.match(responseOf(result), /producto especifico/);
  });
});
