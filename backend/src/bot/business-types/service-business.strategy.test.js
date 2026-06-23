import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { serviceBusinessStrategy } from './service-business.strategy.js';

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
  return serviceBusinessStrategy.prepareIntent(intent(overrides), {
    normalizedMessage: message,
    conversationContext: context
  });
}

describe('serviceBusinessStrategy catalog routing', () => {
  it('routes service questions to active service search instead of hardcoded answers', () => {
    const result = run('cuanto cuesta una lona de 2x1');

    assert.equal(result.intencion, 'BUSCAR_SERVICIO');
    assert.equal(result.herramienta_mcp, 'buscar_servicios');
    assert.equal(result.parametros.respuesta_sugerida, undefined);
  });

  it('uses last service context for standalone measurements', () => {
    const result = run('2 x 1', {
      ultimo_servicio_id: 42,
      datos_json: {
        servicio: { id: 42, nombre: 'Impresion de lona', tipo_precio: 'POR_M2' }
      }
    });

    assert.equal(result.intencion, 'CONSULTAR_PRECIO');
    assert.equal(result.herramienta_mcp, 'obtener_servicio');
    assert.equal(result.parametros.servicio_id, 42);
  });

  it('searches a newly named service instead of reusing the previous service', () => {
    const result = run('cuanto cuesta una lona', {
      ultimo_servicio_id: 11,
      datos_json: {
        servicio: { id: 11, nombre: 'Vinil reflejante', tipo_precio: 'POR_M2' }
      }
    }, {
      intencion: 'CONSULTAR_PRECIO',
      herramienta_mcp: 'obtener_servicio',
      parametros: { servicio_id: 11 }
    });

    assert.equal(result.intencion, 'BUSCAR_SERVICIO');
    assert.equal(result.herramienta_mcp, 'buscar_servicios');
    assert.equal(result.parametros.servicio_id, undefined);
    assert.equal(result.parametros.texto, 'cuanto cuesta una lona');
  });

  it('recognizes a web page request as a service search', () => {
    const result = run('quiero una pagina web para mi negocio');

    assert.equal(result.intencion, 'BUSCAR_SERVICIO');
    assert.equal(result.herramienta_mcp, 'buscar_servicios');
  });

  it('creates lead intent for interest after a service response', () => {
    const result = run('me interesa, pasame con asesor', {
      ultimo_servicio_id: 42,
      ultimo_texto_busqueda: 'Impresion de lona',
      datos_json: {
        servicio: { id: 42, nombre: 'Impresion de lona', tipo_precio: 'POR_M2' }
      }
    });

    assert.equal(result.intencion, 'AGENDAR_CITA');
    assert.equal(result.herramienta_mcp, 'crear_lead');
    assert.equal(result.parametros.servicio_id, 42);
    assert.match(result.parametros.interes, /Impresion de lona/);
  });

  it('searches services when interest wording has no previous service context', () => {
    const result = run('quiero cotizar tarjetas 100 piezas');

    assert.equal(result.intencion, 'BUSCAR_SERVICIO');
    assert.equal(result.herramienta_mcp, 'buscar_servicios');
  });
});
