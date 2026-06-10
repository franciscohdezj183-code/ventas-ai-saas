import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { orchestrateIncomingMessage } from './messageOrchestrator.js';

describe('messageOrchestrator', () => {
  it('uses conversation context for price follow-up messages', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return { empresa: { nombre: 'Demo', tipo_negocio: 'Tienda' } };
        }

        if (toolName === 'obtener_producto') {
          return {
            producto: {
              id: 7,
              nombre: 'Silla Gris',
              precio: 1200,
              stock: 3
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 99 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const savedContexts = [];
    const contextStore = {
      async find() {
        return {
          ultima_intencion: 'BUSCAR_PRODUCTO',
          ultimo_producto_id: 7,
          ultimo_servicio_id: null,
          ultimo_texto_busqueda: 'silla gris',
          datos_json: {}
        };
      },
      async save(context) {
        savedContexts.push(context);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'cuanto cuesta?',
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.4,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore
    });

    const productCall = calls.find((call) => call.toolName === 'obtener_producto');

    assert.equal(result.intencion, 'CONSULTAR_PRECIO');
    assert.equal(productCall.args.producto_id, 7);
    assert.match(result.respuesta, /Silla Gris cuesta/);
    assert.equal(result.conversacion_id, 99);
    assert.equal(savedContexts[0].ultimoProductoId, 7);
  });
});
