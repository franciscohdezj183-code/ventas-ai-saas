import assert from 'node:assert/strict';
import test from 'node:test';
import { FALLBACK_INTENT, interpretIntent, validateIntentJson } from './intentInterpreter.js';

function mockOpenAIResponse(payload) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            {
              message: {
                content: typeof payload === 'string' ? payload : JSON.stringify(payload)
              }
            }
          ]
        })
      }
    }
  };
}

test('interpreta busqueda real de producto sin inventar catalogo', async () => {
  const result = await interpretIntent({
    empresa_id: 1,
    mensaje_cliente: 'Busco un comedor para 6 personas barato',
    contexto: { nombre: 'Muebles Demo', tipo_negocio: 'Muebleria' },
    client: mockOpenAIResponse({
      intencion: 'BUSCAR_PRODUCTO',
      herramienta_mcp: 'buscar_productos',
      parametros: {
        texto: 'comedor 6 personas barato',
        categoria: 'comedor',
        presupuesto: 8000,
        color: 'gris',
        tamano: '6 personas',
        precio_max: null,
        stock_requerido: true
      },
      confianza: 0.9,
      requiere_respuesta_ia: false
    })
  });

  assert.equal(result.intencion, 'BUSCAR_PRODUCTO');
  assert.equal(result.herramienta_mcp, 'buscar_productos');
  assert.equal(result.parametros.texto, 'comedor 6 personas barato');
  assert.equal(result.parametros.categoria, 'comedor');
  assert.equal(result.parametros.presupuesto, 8000);
  assert.equal(result.parametros.color, 'gris');
  assert.equal(result.parametros.tamano, '6 personas');
  assert.equal(result.parametros.stock_requerido, true);
  assert.equal(result.confianza, 0.9);
});

test('interpreta solicitud de asesor como herramienta crear_lead', async () => {
  const result = validateIntentJson({
    intencion: 'HABLAR_ASESOR',
    herramienta_mcp: 'crear_lead',
    parametros: {
      texto: 'quiero que me atienda una persona',
      nombre_cliente: ''
    },
    confianza: 0.86,
    requiere_respuesta_ia: false
  });

  assert.equal(result.intencion, 'HABLAR_ASESOR');
  assert.equal(result.herramienta_mcp, 'crear_lead');
  assert.equal(result.parametros.texto, 'quiero que me atienda una persona');
});

test('usa fallback cuando OpenAI devuelve JSON invalido', async () => {
  const result = await interpretIntent({
    empresa_id: 1,
    mensaje_cliente: 'tienen sala gris menor a 8000?',
    client: mockOpenAIResponse('Esto no es JSON')
  });

  assert.deepEqual(result, FALLBACK_INTENT);
});

test('usa fallback cuando la herramienta no corresponde a la intencion', () => {
  const result = validateIntentJson({
    intencion: 'BUSCAR_PRODUCTO',
    herramienta_mcp: 'crear_lead',
    parametros: { texto: 'sala gris' },
    confianza: 0.8,
    requiere_respuesta_ia: false
  });

  assert.deepEqual(result, FALLBACK_INTENT);
});

test('interpreta horario con configuracion de empresa', () => {
  const result = validateIntentJson({
    intencion: 'CONSULTAR_HORARIO',
    herramienta_mcp: 'obtener_configuracion_empresa',
    parametros: {},
    confianza: 0.78,
    requiere_respuesta_ia: false
  });

  assert.equal(result.intencion, 'CONSULTAR_HORARIO');
  assert.equal(result.herramienta_mcp, 'obtener_configuracion_empresa');
});

test('interpreta intencion de compra con herramienta registrada', () => {
  const result = validateIntentJson({
    intencion: 'INTENCION_COMPRA',
    herramienta_mcp: 'registrar_intencion_compra',
    parametros: {
      texto: 'quiero comprar la sala gris',
      telefono: '5551234567'
    },
    confianza: 0.91,
    requiere_respuesta_ia: false
  });

  assert.equal(result.intencion, 'INTENCION_COMPRA');
  assert.equal(result.herramienta_mcp, 'registrar_intencion_compra');
  assert.equal(result.parametros.telefono, '5551234567');
});

test('usa fallback con herramienta no registrada', () => {
  const result = validateIntentJson({
    intencion: 'BUSCAR_PRODUCTO',
    herramienta_mcp: 'ejecutar_sql',
    parametros: { texto: 'sala' },
    confianza: 0.8,
    requiere_respuesta_ia: false
  });

  assert.deepEqual(result, FALLBACK_INTENT);
});

test('usa fallback con parametros peligrosos o desconocidos', () => {
  const result = validateIntentJson({
    intencion: 'BUSCAR_PRODUCTO',
    herramienta_mcp: 'buscar_productos',
    parametros: {
      texto: 'sala',
      sql: 'SELECT * FROM usuarios'
    },
    confianza: 0.8,
    requiere_respuesta_ia: false
  });

  assert.deepEqual(result, FALLBACK_INTENT);
});

test('interpreta pagos y envios con configuracion de empresa', () => {
  const pagos = validateIntentJson({
    intencion: 'CONSULTAR_METODOS_PAGO',
    herramienta_mcp: 'obtener_configuracion_empresa',
    parametros: {},
    confianza: 0.82,
    requiere_respuesta_ia: false
  });
  const envios = validateIntentJson({
    intencion: 'CONSULTAR_ENVIOS',
    herramienta_mcp: 'obtener_configuracion_empresa',
    parametros: {},
    confianza: 0.82,
    requiere_respuesta_ia: false
  });

  assert.equal(pagos.herramienta_mcp, 'obtener_configuracion_empresa');
  assert.equal(envios.herramienta_mcp, 'obtener_configuracion_empresa');
});

