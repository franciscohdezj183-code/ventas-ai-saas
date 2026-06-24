import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FALLBACK_INTENT,
  interpretIntent,
  interpretIntentDetailed,
  validateIntentJson
} from './intentInterpreter.js';
import { validateIntentDetailed } from './intent-validation.service.js';
import { buildSafeConversationContext } from './conversation-context.builder.js';
import { env } from '../config/env.js';

function mockOpenAIResponse(payload, calls = []) {
  return {
    chat: {
      completions: {
        create: async (request) => {
          calls.push(request);
          return {
            model: 'test-model',
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15
            },
            choices: [
              {
                message: {
                  content: typeof payload === 'string' ? payload : JSON.stringify(payload)
                }
              }
            ]
          };
        }
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

test('envia OpenAI con temperatura cero, max tokens y formato JSON', async () => {
  const calls = [];
  const originalTemperature = env.openai.temperature;
  const originalMaxTokens = env.openai.maxTokens;
  env.openai.temperature = 0;
  env.openai.maxTokens = 240;

  try {
    await interpretIntent({
      empresa_id: 1,
      mensaje_cliente: 'Busco lonas',
      contexto: { nombre: 'Demo', tipo_negocio: 'Servicios' },
      client: mockOpenAIResponse({
        intencion: 'BUSCAR_SERVICIO',
        herramienta_mcp: 'buscar_servicios',
        parametros: { texto: 'lonas' },
        confianza: 0.9,
        requiere_respuesta_ia: false
      }, calls)
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].temperature, 0);
    assert.equal(calls[0].max_tokens, 240);
    assert.deepEqual(calls[0].response_format, { type: 'json_object' });
  } finally {
    env.openai.temperature = originalTemperature;
    env.openai.maxTokens = originalMaxTokens;
  }
});

test('no falla la intencion si el callback de tokens falla', async () => {
  const result = await interpretIntent({
    empresa_id: 1,
    mensaje_cliente: 'Quiero hablar con asesor',
    client: mockOpenAIResponse({
      intencion: 'HABLAR_ASESOR',
      herramienta_mcp: 'crear_lead',
      parametros: { interes: 'asesor' },
      confianza: 0.9,
      requiere_respuesta_ia: false
    }),
    onUsage: async () => {
      throw new Error('usage storage down');
    }
  });

  assert.equal(result.intencion, 'HABLAR_ASESOR');
  assert.equal(result.herramienta_mcp, 'crear_lead');
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

test('usa fallback con parametros peligrosos', () => {
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

test('conserva la intencion e ignora parametros adicionales no permitidos', () => {
  const result = validateIntentJson({
    intencion: 'BUSCAR_SERVICIO',
    herramienta_mcp: 'buscar_servicios',
    parametros: {
      texto: 'logo, colores y publicaciones para Instagram',
      servicios_solicitados: ['logo', 'colores', 'publicaciones para Instagram']
    },
    confianza: 0.95,
    requiere_respuesta_ia: true
  });

  assert.deepEqual(result, {
    intencion: 'BUSCAR_SERVICIO',
    herramienta_mcp: 'buscar_servicios',
    parametros: {
      texto: 'logo, colores y publicaciones para Instagram'
    },
    confianza: 0.95,
    requiere_respuesta_ia: true
  });
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

test('devuelve diagnostico completo y conserva metadatos comerciales seguros', async () => {
  const result = await interpretIntentDetailed({
    empresa_id: 5,
    mensaje_cliente: 'Soy Francisco de Cafe Luna y necesito logo y publicaciones',
    contexto: {
      tipo_negocio: 'SERVICIOS',
      ultimos_mensajes_relevantes: [{ rol: 'cliente', texto: 'Hola' }],
      ultimos_resultados_mostrados: []
    },
    client: mockOpenAIResponse({
      intencion: 'BUSCAR_SERVICIO',
      herramienta_mcp: 'buscar_servicios',
      parametros: { texto: 'logo y publicaciones para Instagram' },
      resumen_cliente: 'Francisco solicita renovar la imagen de Cafe Luna',
      necesidades: ['logo', 'publicaciones para Instagram'],
      entidades: {
        nombre_cliente: 'Francisco',
        nombre_negocio: 'Cafe Luna'
      },
      sentimiento: 'positivo',
      prioridad: 'media',
      requiere_asesor: true,
      respuesta_sugerida: null,
      confianza: 0.96,
      requiere_respuesta_ia: false,
      campo_no_soportado: 'ignorar'
    })
  });

  assert.equal(result.raw_interpretation.intencion, 'BUSCAR_SERVICIO');
  assert.equal(result.validated_interpretation.entidades.nombre_cliente, 'Francisco');
  assert.equal(result.final_interpretation.resumen_cliente, 'Francisco solicita renovar la imagen de Cafe Luna');
  assert.deepEqual(result.final_interpretation.necesidades, ['logo', 'publicaciones para Instagram']);
  assert.deepEqual(result.ignored_fields, ['campo_no_soportado']);
  assert.equal(result.fallback_reason, null);
  assert.equal(result.model, 'test-model');
  assert.equal(result.usage.total_tokens, 15);
  assert.equal(result.context_used.business_type, 'SERVICIOS');
  assert.equal(result.context_used.has_recent_messages, true);
});

test('rechaza campos peligrosos aunque esten anidados y los redacta del diagnostico', async () => {
  const result = await interpretIntentDetailed({
    empresa_id: 5,
    mensaje_cliente: 'Busca un logo',
    client: mockOpenAIResponse({
      intencion: 'BUSCAR_SERVICIO',
      herramienta_mcp: 'buscar_servicios',
      parametros: {
        texto: 'logo',
        filtro: {
          empresa_id: 99
        }
      },
      confianza: 0.95
    })
  });

  assert.match(result.fallback_reason, /^dangerous_field:/);
  assert.equal(result.final_interpretation.intencion, 'MENSAJE_GENERAL');
  assert.equal(result.raw_interpretation.parametros.filtro.empresa_id, '[REDACTED]');
});

test('usa fallback seguro cuando OpenAI falla sin propagar la excepcion', async () => {
  const result = await interpretIntentDetailed({
    empresa_id: 5,
    mensaje_cliente: 'Hola',
    client: {
      chat: {
        completions: {
          create: async () => {
            const error = new Error('timeout');
            error.code = 'ETIMEDOUT';
            throw error;
          }
        }
      }
    }
  });

  assert.equal(result.final_interpretation.intencion, 'SALUDO');
  assert.equal(result.fallback_reason, 'openai_error:ETIMEDOUT');
});

test('aplica fallback cuando la confianza de OpenAI es insuficiente', () => {
  const result = validateIntentDetailed({
    intencion: 'BUSCAR_PRODUCTO',
    herramienta_mcp: 'buscar_productos',
    parametros: { texto: 'algo' },
    confianza: 0.2
  });

  assert.deepEqual(result.interpretation, FALLBACK_INTENT);
  assert.equal(result.fallbackReason, 'low_confidence');
});

test('construye contexto conversacional acotado para referencias posteriores', () => {
  const context = buildSafeConversationContext({
    message: 'Cuanto cuesta el segundo?',
    companyContext: {
      nombre: 'Demo',
      tipo_negocio: 'MIXTO',
      openai_api_key: 'no debe salir'
    },
    conversationContext: {
      ultima_intencion: 'BUSCAR_SERVICIO',
      datos_json: {
        ultima_lista_servicios: [
          { id: 10, nombre: 'Logo', precio: 1500, categoria: 'Diseno', secreto: 'oculto' },
          { id: 11, nombre: 'Redes sociales', precio: 2500, categoria: 'Marketing' }
        ]
      }
    },
    recentMessages: [
      { rol: 'cliente', texto: 'Quiero renovar mi marca' },
      { rol: 'bot', texto: 'Te mostre dos servicios' }
    ],
    handoff: { estado: 'DECLINED' }
  });

  assert.equal(context.tipo_negocio, 'MIXTO');
  assert.equal(context.ultimos_resultados_mostrados[1].id, 11);
  assert.equal(context.ultimos_resultados_mostrados[0].secreto, undefined);
  assert.equal(context.si_el_handoff_fue_rechazado, true);
  assert.equal(context.empresa.openai_api_key, undefined);
});

