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

  it('routes a short product name to product search when the interpreter is generic', () => {
    const result = run('silla');

    assert.equal(result.intencion, 'BUSCAR_PRODUCTO');
    assert.equal(result.herramienta_mcp, 'buscar_productos');
    assert.equal(result.parametros.texto, 'silla');
  });

  it('routes product purchase phrases with a product name to product search first', () => {
    const result = run('quiero comprar silla');

    assert.equal(result.intencion, 'BUSCAR_PRODUCTO');
    assert.equal(result.herramienta_mcp, 'buscar_productos');
    assert.equal(result.parametros.texto, 'silla');
  });

  it('routes reservation wording variants to the last product', () => {
    const context = {
      ultima_intencion: 'CONSULTAR_PRECIO',
      ultimo_producto_id: 22,
      ultimo_servicio_id: null,
      ultimo_texto_busqueda: 'silla de madera',
      datos_json: {}
    };

    for (const phrase of ['aparatalo', 'quiero aparatarlo', 'apartemoslo', 'apartamelo']) {
      const result = run(phrase, context);

      assert.equal(result.intencion, 'INTENCION_COMPRA', phrase);
      assert.equal(result.herramienta_mcp, 'crear_pedido', phrase);
      assert.equal(result.parametros.producto_id, 22, phrase);
    }
  });

  it('keeps purchase follow-up on service context as a lead flow', () => {
    const result = run('me interesa', {
      ultima_intencion: 'BUSCAR_SERVICIO',
      ultimo_producto_id: null,
      ultimo_servicio_id: 9,
      ultimo_texto_busqueda: 'instalacion',
      datos_json: {}
    });

    assert.equal(result.intencion, 'INTENCION_COMPRA');
    assert.equal(result.herramienta_mcp, 'registrar_intencion_compra');
    assert.equal(result.parametros.servicio_id, 9);
  });

  it('routes category requests to the categories tool', () => {
    const result = run('categorias');

    assert.equal(result.intencion, 'VER_CATEGORIAS');
    assert.equal(result.herramienta_mcp, 'obtener_categorias');
  });

  it('creates an advisor lead for direct advisor requests', () => {
    const result = run('asesor');

    assert.equal(result.intencion, 'HABLAR_ASESOR');
    assert.equal(result.herramienta_mcp, 'crear_lead');
    assert.equal(result.parametros.interes, 'asesor');
  });
});
