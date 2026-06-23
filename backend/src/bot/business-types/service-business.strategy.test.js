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

function responseOf(result) {
  return result.parametros?.respuesta_sugerida ?? '';
}

describe('serviceBusinessStrategy commercial service responses', () => {
  it('answers lona availability and asks for measurements', () => {
    const result = run('hola, hacen lonas?');

    assert.equal(result.herramienta_mcp, '');
    assert.match(responseOf(result), /impresion de lona/);
    assert.match(responseOf(result), /\$390/);
    assert.match(responseOf(result), /Que medida necesitas/);
  });

  it('answers lona price without measurements', () => {
    const result = run('cuanto cuesta una lona?');

    assert.match(responseOf(result), /\$390/);
    assert.match(responseOf(result), /por m2/);
  });

  it('calculates lona by m2 when measurement is present', () => {
    const result = run('quiero una lona de 2x3');

    assert.match(responseOf(result), /6 m2/);
    assert.match(responseOf(result), /\$2,340/);
  });

  it('uses last lona context for standalone measurements', () => {
    const result = run('2 x 3', {
      datos_json: {
        parametros: {
          service_context: { key: 'lona', label: 'impresion de lona' }
        }
      }
    });

    assert.match(responseOf(result), /6 m2/);
    assert.match(responseOf(result), /\$2,340/);
  });

  it('routes installation follow-up to advisor quote', () => {
    const result = run('y con instalacion?');

    assert.match(responseOf(result), /instalacion/);
    assert.match(responseOf(result), /asesor/);
  });

  it('answers logo design with advisor quote', () => {
    const result = run('hacen logotipos?');

    assert.match(responseOf(result), /diseno de logotipo/);
    assert.match(responseOf(result), /asesor/);
  });

  it('answers web design with advisor quote', () => {
    const result = run('cuanto cuesta el diseno web?');

    assert.match(responseOf(result), /diseno web/);
    assert.match(responseOf(result), /secciones y funciones/);
  });

  it('answers tarjetas and asks for quantity', () => {
    const result = run('tarjetas de presentacion');

    assert.match(responseOf(result), /100 piezas/);
    assert.match(responseOf(result), /\$297/);
  });

  it('answers exact 100 tarjetas price', () => {
    const result = run('quiero 100 tarjetas');

    assert.match(responseOf(result), /100 tarjetas/);
    assert.match(responseOf(result), /\$297/);
  });

  it('routes 600 tarjetas to advisor', () => {
    const result = run('quiero 600 tarjetas');

    assert.match(responseOf(result), /600 tarjetas/);
    assert.match(responseOf(result), /asesor/);
  });

  it('answers vinil reflejante price per m2', () => {
    const result = run('vinil reflejante');

    assert.match(responseOf(result), /vinil reflejante/);
    assert.match(responseOf(result), /\$800/);
  });

  it('uses last vinil reflejante context for standalone measurement', () => {
    const result = run('1.5 x 2', {
      datos_json: {
        parametros: {
          service_context: { key: 'vinil_reflejante', label: 'vinil reflejante' }
        }
      }
    });

    assert.match(responseOf(result), /3 m2/);
    assert.match(responseOf(result), /\$2,400/);
  });

  it('creates lead intent for interest using last service context', () => {
    const result = run('me interesa', {
      datos_json: {
        parametros: {
          service_context: { key: 'lona', label: 'impresion de lona' }
        }
      }
    });

    assert.equal(result.intencion, 'AGENDAR_CITA');
    assert.equal(result.herramienta_mcp, 'crear_lead');
    assert.match(result.parametros.interes, /impresion de lona/);
  });

  it('creates lead intent when customer asks for an advisor', () => {
    const result = run('quiero hablar con un asesor');

    assert.equal(result.herramienta_mcp, 'crear_lead');
    assert.equal(result.intencion, 'AGENDAR_CITA');
  });

  it('answers textile printing with advisor quote', () => {
    const result = run('hacen impresion textil?');

    assert.match(responseOf(result), /impresion textil/);
    assert.match(responseOf(result), /serigrafia/);
  });

  it('answers banner arana with advisor quote', () => {
    const result = run('banner arana');

    assert.match(responseOf(result), /banner arana/);
    assert.match(responseOf(result), /80x1.80m/);
  });

  it('answers senaletica with advisor quote', () => {
    const result = run('senaletica con trovicel');

    assert.match(responseOf(result), /senaletica/);
    assert.match(responseOf(result), /materiales/);
  });

  it('answers promotional serigraphy with advisor quote', () => {
    const result = run('promocionales con serigrafia');

    assert.match(responseOf(result), /promocionales/);
    assert.match(responseOf(result), /serigrafia/);
  });
});
