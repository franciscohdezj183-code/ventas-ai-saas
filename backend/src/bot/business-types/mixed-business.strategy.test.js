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
  it('answers known service catalog terms instead of asking for clarification', () => {
    const result = run('tienes lonas?');

    assert.equal(result.herramienta_mcp, '');
    assert.match(responseOf(result), /impresion de lona/);
    assert.doesNotMatch(responseOf(result), /producto especifico/);
  });

  it('routes lona installation questions to the service advisor flow', () => {
    const result = run('hacen instalacion de lona?');

    assert.equal(result.herramienta_mcp, '');
    assert.match(responseOf(result), /instalacion/);
    assert.match(responseOf(result), /asesor/);
  });

  it('keeps asking for clarification when product or service intent is unclear', () => {
    const result = run('hola');

    assert.equal(result.intencion, 'MENSAJE_GENERAL');
    assert.match(responseOf(result), /producto especifico/);
  });
});
