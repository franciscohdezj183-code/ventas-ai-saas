import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { orchestrateIncomingMessage } from './messageOrchestrator.js';

describe('messageOrchestrator', () => {
  const noopHandoffManager = {
    async hasActive() {
      return false;
    },
    async request() {
      return { handoff_id: 1, estado: 'PENDING_OWNER', duplicate: false };
    }
  };

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
              descripcion: 'Tapizada',
              precio: 1200,
              stock: 3,
              imagen: 'http://localhost:4000/uploads/products/silla.jpg',
              categoria: 'Sillas'
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
    assert.match(result.respuesta, /\*Silla Gris\*/);
    assert.match(result.respuesta, /Precio: \$1,200\.00/);
    assert.match(result.respuesta, /Disponibles: 3/);
    assert.match(result.respuesta, /Categoría: Sillas/);
    assert.match(result.respuesta, /asesor/);
    assert.deepEqual(result.medios, [
      {
        type: 'image',
        url: 'http://localhost:4000/uploads/products/silla.jpg',
        caption: result.respuesta
      }
    ]);
    assert.equal(result.conversacion_id, 99);
    assert.equal(savedContexts[0].ultimoProductoId, 7);
  });

  it('uses the last shown product list when customer selects a numbered option', async () => {
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
              id: 22,
              nombre: 'Silla Plastico',
              descripcion: 'Color blanco',
              precio: 10000,
              stock: 5,
              imagen: 'http://localhost:4000/uploads/products/silla-plastico.jpg',
              categoria: 'Sillas'
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 100 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const contextStore = {
      async find() {
        return {
          ultima_intencion: 'BUSCAR_PRODUCTO',
          ultimo_producto_id: 11,
          ultimo_servicio_id: null,
          ultimo_texto_busqueda: 'sillas',
          datos_json: {
            productos_mostrados: [
              {
                id: 11,
                nombre: 'Silla Madera',
                precio: 800,
                imagen: 'http://localhost:4000/uploads/products/silla-madera.jpg',
                categoria: 'Sillas'
              },
              {
                id: 22,
                nombre: 'Silla Plastico',
                precio: 10000,
                imagen: 'http://localhost:4000/uploads/products/silla-plastico.jpg',
                categoria: 'Sillas'
              }
            ]
          }
        };
      },
      async save() {}
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'la opcion 2',
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

    assert.equal(result.herramienta_mcp, 'obtener_producto');
    assert.equal(productCall.args.producto_id, 22);
    assert.match(result.respuesta, /\*Silla Plastico\*/);
    assert.deepEqual(result.medios, [
      {
        type: 'image',
        url: 'http://localhost:4000/uploads/products/silla-plastico.jpg',
        caption: result.respuesta
      }
    ]);
  });

  it('uses product context for shipping follow-up messages', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return {
            empresa: {
              nombre: 'Demo',
              tipo_negocio: 'Tienda',
              politica_entrega: 'Hacemos envios locales con costo segun zona.'
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 102 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const contextStore = {
      async find() {
        return {
          ultima_intencion: 'CONSULTAR_PRECIO',
          ultimo_producto_id: 22,
          ultimo_servicio_id: null,
          ultimo_texto_busqueda: 'Silla Plastico',
          datos_json: {}
        };
      },
      async save() {}
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'hay envio?',
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
    const configCall = calls.find((call) => call.toolName === 'obtener_configuracion_empresa');

    assert.equal(result.intencion, 'CONSULTAR_ENVIOS');
    assert.equal(configCall.args.empresa_id, 1);
    assert.match(result.respuesta, /envios locales/);
  });

  it('saves the last shown product list in conversation context', async () => {
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName) {
        if (toolName === 'obtener_configuracion_empresa') {
          return { empresa: { nombre: 'Demo', tipo_negocio: 'Tienda' } };
        }

        if (toolName === 'buscar_productos') {
          return {
            productos: [
              {
                id: 11,
                nombre: 'Silla Madera',
                precio: 800,
                stock: 5,
                imagen: 'http://localhost:4000/uploads/products/silla-madera.jpg',
                categoria: 'Sillas'
              },
              {
                id: 22,
                nombre: 'Silla Plastico',
                precio: 10000,
                stock: 5,
                imagen: 'http://localhost:4000/uploads/products/silla-plastico.jpg',
                categoria: 'Sillas'
              }
            ],
            paginacion: {
              offset: 0,
              limit: 5,
              next_offset: 2,
              has_more: true
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 101 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const contextStore = {
      async find() {
        return null;
      },
      async save(context) {
        savedContexts.push(context);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'Tienes sillas?',
      interpreter: async () => ({
        intencion: 'BUSCAR_PRODUCTO',
        herramienta_mcp: 'buscar_productos',
        parametros: { texto: 'sillas', stock_requerido: true },
        confianza: 0.9,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore
    });

    assert.match(result.respuesta, /1\. Silla Madera/);
    assert.match(result.respuesta, /2\. Silla Plastico/);
    assert.deepEqual(savedContexts[0].datos.productos_mostrados, [
      {
        id: 11,
        nombre: 'Silla Madera',
        precio: 800,
        imagen: 'http://localhost:4000/uploads/products/silla-madera.jpg',
        categoria: 'Sillas'
      },
      {
        id: 22,
        nombre: 'Silla Plastico',
        precio: 10000,
        imagen: 'http://localhost:4000/uploads/products/silla-plastico.jpg',
        categoria: 'Sillas'
      }
    ]);
    assert.deepEqual(savedContexts[0].datos.ultima_lista_productos, savedContexts[0].datos.productos_mostrados);
    assert.equal(savedContexts[0].datos.ultima_categoria, 'Sillas');
    assert.deepEqual(savedContexts[0].datos.ultima_busqueda_productos, {
      parametros: {
        texto: 'sillas',
        categoria: null,
        color: null,
        tamano: null,
        presupuesto: null,
        precio_min: null,
        precio_max: null,
        stock_requerido: true
      },
      offset: 0,
      next_offset: 2,
      has_more: true
    });
  });

  it('searches products for a short product name even when the interpreter is generic', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return { empresa: { nombre: 'Demo', tipo_negocio: 'Mixto' } };
        }

        if (toolName === 'buscar_productos') {
          return {
            productos: [
              {
                id: 71,
                nombre: 'Silla de madera',
                precio: 800,
                stock: 5,
                imagen: null,
                categoria: 'Sillas'
              }
            ],
            paginacion: {
              offset: 0,
              limit: 5,
              next_offset: 1,
              has_more: false
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 112 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'Silla',
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.4,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });
    const productSearchCall = calls.find((call) => call.toolName === 'buscar_productos');

    assert.equal(result.intencion, 'BUSCAR_PRODUCTO');
    assert.equal(productSearchCall.args.texto, 'silla');
    assert.match(result.respuesta, /1\. Silla de madera/);
    assert.match(result.respuesta, /Precio: \$800\.00/);
    assert.match(result.respuesta, /mas opciones/);
    assert.match(result.respuesta, /apartalo/);
    assert.match(result.respuesta, /categorias/);
    assert.match(result.respuesta, /asesor/);
  });

  it('applies product business strategy when the real OpenAI path returns a generic intent', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'buscar_productos') {
          return {
            productos: [
              {
                id: 71,
                nombre: 'Silla de madera',
                precio: 800,
                stock: 5,
                imagen: null,
                categoria: 'Sillas'
              }
            ],
            paginacion: {
              offset: 0,
              limit: 5,
              next_offset: 1,
              has_more: false
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 113 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'Silla',
      contexto: { nombre: 'Demo', tipo_negocio: 'PRODUCTOS' },
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      },
      detailedInterpreter: async () => ({
        final_interpretation: {
          intencion: 'MENSAJE_GENERAL',
          herramienta_mcp: '',
          parametros: {},
          confianza: 0.95,
          requiere_respuesta_ia: false
        },
        fallback_reason: null
      })
    });
    const productSearchCall = calls.find((call) => call.toolName === 'buscar_productos');

    assert.equal(result.intencion, 'BUSCAR_PRODUCTO');
    assert.equal(productSearchCall.args.texto, 'silla');
    assert.match(result.respuesta, /1\. Silla de madera/);
  });

  it('uses the last product search for more options follow-up messages', async () => {
    const calls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return { empresa: { nombre: 'Demo', tipo_negocio: 'Tienda' } };
        }

        if (toolName === 'buscar_productos') {
          return {
            productos: [
              {
                id: 33,
                nombre: 'Silla Metal',
                precio: 1500,
                stock: 4,
                imagen: null,
                categoria: 'Sillas'
              }
            ],
            paginacion: {
              offset: args.offset,
              limit: 5,
              next_offset: args.offset + 1,
              has_more: false
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 105 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const contextStore = {
      async find() {
        return {
          ultima_intencion: 'BUSCAR_PRODUCTO',
          ultimo_producto_id: 22,
          ultimo_servicio_id: null,
          ultimo_texto_busqueda: 'sillas',
          datos_json: {
            ultima_categoria: 'Sillas',
            ultima_lista_productos: [
              {
                id: 11,
                nombre: 'Silla Madera',
                precio: 800,
                imagen: null,
                categoria: 'Sillas'
              }
            ],
            ultima_busqueda_productos: {
              parametros: {
                texto: 'sillas',
                categoria: null,
                color: null,
                tamano: null,
                presupuesto: null,
                precio_min: null,
                precio_max: null,
                stock_requerido: true
              },
              offset: 0,
              next_offset: 5,
              has_more: true
            }
          }
        };
      },
      async save(context) {
        savedContexts.push(context);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'mas opciones',
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
    const productSearchCall = calls.find((call) => call.toolName === 'buscar_productos');

    assert.equal(result.intencion, 'BUSCAR_PRODUCTO');
    assert.equal(productSearchCall.args.texto, 'sillas');
    assert.equal(productSearchCall.args.offset, 5);
    assert.match(result.respuesta, /1\. Silla Metal/);
    assert.deepEqual(savedContexts[0].datos.ultima_lista_productos, [
      {
        id: 33,
        nombre: 'Silla Metal',
        precio: 1500,
        imagen: null,
        categoria: 'Sillas'
      }
    ]);
    assert.equal(savedContexts[0].datos.ultima_busqueda_productos.next_offset, 6);
    assert.equal(savedContexts[0].datos.ultima_busqueda_productos.has_more, false);
  });

  it('sends reservation payment instructions from the last product context', async () => {
    const calls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return {
            empresa: {
              nombre: 'Demo',
              tipo_negocio: 'Tienda',
              apartado_activo: 1,
              apartado_porcentaje: 50,
              pago_transferencia_activo: 1,
              pago_efectivo_activo: 1,
              transferencia_banco: 'Banco Demo',
              transferencia_titular: 'Demo SA',
              transferencia_clabe: '123456789012345678',
              apartado_instrucciones: 'El apartado se confirma cuando el pago se refleje.'
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 103 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const contextStore = {
      async find() {
        return {
          ultima_intencion: 'CONSULTAR_PRECIO',
          ultimo_producto_id: 22,
          ultimo_servicio_id: null,
          ultimo_texto_busqueda: 'Silla Plastico',
          datos_json: {
            ultima_categoria: 'Sillas',
            ultima_lista_productos: [
              {
                id: 22,
                nombre: 'Silla Plastico',
                precio: 10000,
                imagen: 'http://localhost:4000/uploads/products/silla-plastico.jpg',
                categoria: 'Sillas'
              }
            ]
          }
        };
      },
      async save(context) {
        savedContexts.push(context);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'me interesa',
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.4,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager: noopHandoffManager,
      contextStore
    });

    assert.equal(result.intencion, 'SOLICITAR_APARTADO');
    assert.equal(result.herramienta_mcp, null);
    assert.equal(calls.some((call) => call.toolName === 'crear_pedido'), false);
    assert.equal(result.notificacion, null);
    assert.match(result.respuesta, /50%/);
    assert.match(result.respuesta, /Anticipo requerido: \$5,000\.00/);
    assert.match(result.respuesta, /Banco Demo/);
    assert.match(result.respuesta, /comprobante/);
    assert.equal(savedContexts[0].datos.apartado_pendiente.producto.id, 22);
    assert.equal(savedContexts[0].datos.apartado_pendiente.anticipo, 5000);
  });

  it('understands similar reservation phrases from the last product context', async () => {
    const calls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 104 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const contextStore = {
      async find() {
        return {
          ultima_intencion: 'CONSULTAR_PRECIO',
          ultimo_producto_id: 22,
          ultimo_servicio_id: null,
          ultimo_texto_busqueda: 'Silla de madera',
          datos_json: {
            ultima_lista_productos: [
              {
                id: 22,
                nombre: 'Silla de madera',
                precio: 800,
                imagen: null,
                categoria: 'Sillas'
              }
            ]
          }
        };
      },
      async save(context) {
        savedContexts.push(context);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'quiero aparatarlo',
      contexto: {
        nombre: 'Demo',
        tipo_negocio: 'Mixto',
        apartado_activo: true,
        apartado_porcentaje: 50,
        pago_transferencia_activo: true,
        transferencia_banco: 'Banco Demo',
        transferencia_clabe: '123456789012345678'
      },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.4,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager: noopHandoffManager,
      contextStore
    });

    assert.equal(result.intencion, 'SOLICITAR_APARTADO');
    assert.equal(result.herramienta_mcp, null);
    assert.equal(calls.some((call) => call.toolName === 'crear_pedido'), false);
    assert.match(result.respuesta, /Para apartar \*Silla de madera\*/);
    assert.match(result.respuesta, /Anticipo requerido: \$400\.00/);
    assert.equal(savedContexts[0].datos.apartado_pendiente.producto.id, 22);
  });

  it('does not start a reservation for service-only businesses even when payment settings exist', async () => {
    const calls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'crear_lead') {
          return {
            lead_id: 301,
            telefono: args.telefono,
            interes: args.interes,
            servicio_id: args.servicio_id
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 301 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'me interesa',
      contexto: {
        nombre: 'Servicios Demo',
        tipo_negocio: 'SERVICIOS',
        apartado_activo: true,
        apartado_porcentaje: 50,
        pago_transferencia_activo: true,
        transferencia_banco: 'Banco Demo'
      },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.4,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager: noopHandoffManager,
      contextStore: {
        async find() {
          return {
            ultima_intencion: 'BUSCAR_SERVICIO',
            ultimo_producto_id: null,
            ultimo_servicio_id: 75,
            ultimo_texto_busqueda: 'Instalacion',
            datos_json: {
              servicio: {
                id: 75,
                nombre: 'Instalacion',
                precio: 500,
                tipo_precio: 'FIJO'
              }
            }
          };
        },
        async save(context) {
          savedContexts.push(context);
        }
      }
    });

    assert.equal(result.intencion, 'AGENDAR_CITA');
    assert.equal(result.herramienta_mcp, 'crear_lead');
    assert.equal(calls.some((call) => call.toolName === 'crear_pedido'), false);
    assert.equal(calls.some((call) => call.toolName === 'obtener_producto'), false);
    assert.equal(savedContexts[0].datos.apartado_pendiente, undefined);
    assert.equal(savedContexts[0].ultimoServicioId, 75);
  });

  it('keeps mixed-business service interest as a lead instead of product reservation', async () => {
    const calls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'registrar_intencion_compra') {
          return {
            lead_id: 302,
            telefono: args.telefono,
            interes: args.interes,
            servicio_id: args.servicio_id
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 302 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'apartalo',
      contexto: {
        nombre: 'Mixto Demo',
        tipo_negocio: 'MIXTO',
        apartado_activo: true,
        apartado_porcentaje: 50,
        pago_transferencia_activo: true,
        transferencia_banco: 'Banco Demo'
      },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.4,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager: noopHandoffManager,
      contextStore: {
        async find() {
          return {
            ultima_intencion: 'BUSCAR_SERVICIO',
            ultimo_producto_id: null,
            ultimo_servicio_id: 80,
            ultimo_texto_busqueda: 'Logo',
            datos_json: {
              servicio: {
                id: 80,
                nombre: 'Logo',
                precio: 1200,
                tipo_precio: 'FIJO'
              }
            }
          };
        },
        async save(context) {
          savedContexts.push(context);
        }
      }
    });

    assert.equal(result.intencion, 'INTENCION_COMPRA');
    assert.equal(result.herramienta_mcp, 'registrar_intencion_compra');
    assert.equal(calls.some((call) => call.toolName === 'crear_pedido'), false);
    assert.equal(calls.some((call) => call.toolName === 'obtener_producto'), false);
    assert.equal(savedContexts[0].datos.apartado_pendiente, undefined);
    assert.equal(savedContexts[0].ultimoServicioId, 80);
  });

  it('creates an order and prepares owner notification when a payment proof image is received', async () => {
    const calls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return {
            empresa: {
              nombre: 'Demo',
              tipo_negocio: 'Tienda',
              telefono_dueno: '+525512345678',
              apartado_activo: 1,
              apartado_porcentaje: 50,
              pago_transferencia_activo: 1
            }
          };
        }

        if (toolName === 'crear_pedido') {
          return {
            pedido_id: 88,
            cliente_nombre: args.cliente_nombre,
            telefono_cliente: args.telefono,
            total: args.total,
            estado: 'NUEVO'
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 108 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: '',
      incomingMedia: {
        hasMedia: true,
        type: 'image',
        mimetype: 'image/jpeg',
        filename: 'comprobante.jpg',
        data: 'base64-image'
      },
      mcpClient,
      paymentProofClassifier: async () => ({
        accepted: true,
        confidence: 0.91,
        reason: 'Se observan monto, fecha y referencia bancaria'
      }),
      contextStore: {
        async find() {
          return {
            ultima_intencion: 'SOLICITAR_APARTADO',
            ultimo_producto_id: 22,
            ultimo_servicio_id: null,
            ultimo_texto_busqueda: 'Silla Plastico',
            datos_json: {
              apartado_pendiente: {
                producto: {
                  id: 22,
                  nombre: 'Silla Plastico',
                  precio: 10000,
                  imagen: null,
                  categoria: 'Sillas'
                },
                porcentaje: 50,
                anticipo: 5000
              }
            }
          };
        },
        async save(context) {
          savedContexts.push(context);
        }
      }
    });
    const orderCall = calls.find((call) => call.toolName === 'crear_pedido');

    assert.equal(result.intencion, 'COMPROBANTE_APARTADO');
    assert.equal(result.herramienta_mcp, 'crear_pedido');
    assert.equal(orderCall.args.total, 10000);
    assert.match(orderCall.args.notas, /Comprobante recibido/);
    assert.match(result.respuesta, /comprobante esta en revision/);
    assert.equal(result.owner_media_notification.telefono_dueno, '+525512345678');
    assert.match(result.owner_media_notification.caption, /Silla Plastico/);
    assert.equal(savedContexts[0].datos.apartado_pendiente, null);
    assert.equal(savedContexts[0].datos.ultimo_apartado.pedido_id, 88);
  });

  it('rejects image files that the proof classifier does not identify as payment proof', async () => {
    const calls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return {
            empresa: {
              nombre: 'Demo',
              tipo_negocio: 'Tienda',
              telefono_dueno: '+525512345678',
              apartado_activo: 1,
              apartado_porcentaje: 50,
              pago_transferencia_activo: 1
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 109 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: '',
      incomingMedia: {
        hasMedia: true,
        type: 'image',
        mimetype: 'image/jpeg',
        filename: 'foto-producto.jpg',
        data: 'base64-image'
      },
      mcpClient,
      paymentProofClassifier: async () => ({
        accepted: false,
        confidence: 0.18,
        reason: 'La imagen parece una foto de producto'
      }),
      contextStore: {
        async find() {
          return {
            ultima_intencion: 'SOLICITAR_APARTADO',
            ultimo_producto_id: 22,
            ultimo_servicio_id: null,
            ultimo_texto_busqueda: 'Silla Plastico',
            datos_json: {
              apartado_pendiente: {
                producto: {
                  id: 22,
                  nombre: 'Silla Plastico',
                  precio: 10000,
                  imagen: null,
                  categoria: 'Sillas'
                },
                porcentaje: 50,
                anticipo: 5000
              }
            }
          };
        },
        async save(context) {
          savedContexts.push(context);
        }
      }
    });

    assert.equal(result.intencion, 'COMPROBANTE_INVALIDO');
    assert.equal(result.herramienta_mcp, null);
    assert.equal(calls.some((call) => call.toolName === 'crear_pedido'), false);
    assert.match(result.respuesta, /No pude validar el comprobante/i);
    assert.equal(result.owner_media_notification, null);
    assert.equal(savedContexts[0].datos.apartado_pendiente.producto.id, 22);
  });

  it('asks for context when an image arrives without a pending reservation', async () => {
    const calls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 110 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: '',
      contexto: {
        nombre: 'Demo',
        tipo_negocio: 'Mixto'
      },
      incomingMedia: {
        hasMedia: true,
        type: 'image',
        mimetype: 'image/jpeg',
        filename: 'foto.jpg',
        data: 'base64-image'
      },
      mcpClient,
      paymentProofClassifier: async () => {
        throw new Error('Proof classifier should not run');
      },
      contextStore: {
        async find() {
          return {
            ultima_intencion: 'SALUDO',
            ultimo_producto_id: null,
            ultimo_servicio_id: null,
            ultimo_texto_busqueda: null,
            datos_json: {}
          };
        },
        async save(context) {
          savedContexts.push(context);
        }
      }
    });

    assert.equal(result.intencion, 'IMAGEN_RECIBIDA');
    assert.equal(result.herramienta_mcp, null);
    assert.match(result.respuesta, /ya recibi la imagen/i);
    assert.match(result.respuesta, /precio, medidas, color o disponibilidad/i);
    assert.equal(calls.some((call) => call.toolName === 'crear_pedido'), false);
    assert.equal(savedContexts[0].ultimaIntencion, 'IMAGEN_RECIBIDA');
  });

  it('does not validate payment proof images for service context without product reservation', async () => {
    const calls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 303 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: '',
      contexto: {
        nombre: 'Servicios Demo',
        tipo_negocio: 'SERVICIOS',
        apartado_activo: true,
        apartado_porcentaje: 50,
        pago_transferencia_activo: true
      },
      incomingMedia: {
        hasMedia: true,
        type: 'image',
        mimetype: 'image/jpeg',
        filename: 'comprobante.jpg',
        data: 'base64-image'
      },
      mcpClient,
      paymentProofClassifier: async () => {
        throw new Error('Proof classifier should not run for services');
      },
      contextStore: {
        async find() {
          return {
            ultima_intencion: 'BUSCAR_SERVICIO',
            ultimo_producto_id: null,
            ultimo_servicio_id: 75,
            ultimo_texto_busqueda: 'Instalacion',
            datos_json: {
              servicio: {
                id: 75,
                nombre: 'Instalacion',
                precio: 500
              }
            }
          };
        },
        async save(context) {
          savedContexts.push(context);
        }
      }
    });

    assert.equal(result.intencion, 'IMAGEN_RECIBIDA');
    assert.equal(result.herramienta_mcp, null);
    assert.equal(calls.some((call) => call.toolName === 'crear_pedido'), false);
    assert.equal(result.owner_media_notification, undefined);
    assert.equal(savedContexts[0].ultimoServicioId, 75);
  });

  it('ignores stale product reservation context for service-only businesses', async () => {
    const calls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 304 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: '',
      contexto: {
        nombre: 'Servicios Demo',
        tipo_negocio: 'SERVICIOS',
        apartado_activo: true,
        apartado_porcentaje: 50,
        pago_transferencia_activo: true
      },
      incomingMedia: {
        hasMedia: true,
        type: 'image',
        mimetype: 'image/jpeg',
        filename: 'comprobante.jpg',
        data: 'base64-image'
      },
      mcpClient,
      paymentProofClassifier: async () => {
        throw new Error('Proof classifier should not run for service-only businesses');
      },
      contextStore: {
        async find() {
          return {
            ultima_intencion: 'SOLICITAR_APARTADO',
            ultimo_producto_id: 22,
            ultimo_servicio_id: null,
            ultimo_texto_busqueda: 'Producto viejo',
            datos_json: {
              apartado_pendiente: {
                producto: {
                  id: 22,
                  nombre: 'Producto viejo',
                  precio: 1000
                },
                porcentaje: 50,
                anticipo: 500
              }
            }
          };
        },
        async save(context) {
          savedContexts.push(context);
        }
      }
    });

    assert.equal(result.intencion, 'IMAGEN_RECIBIDA');
    assert.equal(result.herramienta_mcp, null);
    assert.equal(calls.some((call) => call.toolName === 'crear_pedido'), false);
    assert.equal(result.owner_media_notification, undefined);
    assert.equal(savedContexts[0].ultimaIntencion, 'IMAGEN_RECIBIDA');
  });

  it('creates a lead for purchase phrases even without prior context', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return { empresa: { nombre: 'Demo', tipo_negocio: 'Tienda' } };
        }

        if (toolName === 'registrar_intencion_compra') {
          return {
            lead_id: 56,
            nombre_cliente: 'Cliente WhatsApp',
            telefono: args.telefono,
            interes: args.interes
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 104 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const contextStore = {
      async find() {
        return null;
      },
      async save() {}
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'quiero informacion',
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.4,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager: noopHandoffManager,
      contextStore
    });
    const leadCall = calls.find((call) => call.toolName === 'registrar_intencion_compra');

    assert.equal(result.intencion, 'INTENCION_COMPRA');
    assert.equal(leadCall.args.interes, 'quiero informacion');
    assert.equal(result.notificacion.estado, 'PENDING_OWNER');
  });

  it('keeps advisor requests in bot mode outside business hours', async () => {
    const calls = [];
    const handoffCalls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 113 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const handoffManager = {
      async hasActive() {
        handoffCalls.push({ toolName: 'hasActive' });
        return false;
      },
      async request() {
        handoffCalls.push({ toolName: 'request' });
        return { estado: 'PENDING_OWNER' };
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'asesor',
      contexto: {
        nombre: 'Demo',
        tipo_negocio: 'Mixto',
        horario_atencion: 'Lunes a viernes 9:00 a 18:00'
      },
      currentDate: new Date('2026-06-24T02:00:00.000Z'),
      interpreter: async () => ({
        intencion: 'HABLAR_ASESOR',
        herramienta_mcp: 'crear_lead',
        parametros: { interes: 'asesor' },
        confianza: 0.9,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.equal(result.fuera_horario, true);
    assert.equal(result.herramienta_mcp, null);
    assert.equal(result.notificacion, null);
    assert.equal(calls.some((call) => call.toolName === 'crear_lead'), false);
    assert.equal(calls.some((call) => call.toolName === 'registrar_intencion_compra'), false);
    assert.deepEqual(handoffCalls, []);
    assert.match(result.respuesta, /fuera de horario/);
    assert.match(result.respuesta, /manana a las 09:00/);
    assert.match(result.respuesta, /Lunes a viernes 9:00 a 18:00/);
  });

  it('starts product reservations outside business hours without notifying an advisor', async () => {
    const calls = [];
    const handoffCalls = [];
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 115 };
        }

        if (toolName === 'obtener_producto') {
          return {
            producto: {
              id: args.producto_id,
              nombre: 'Silla',
              precio: 1200,
              stock: 2,
              imagen: null,
              categoria: 'Sillas'
            }
          };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const handoffManager = {
      async hasActive() {
        handoffCalls.push({ toolName: 'hasActive' });
        return false;
      },
      async request() {
        handoffCalls.push({ toolName: 'request' });
        return { estado: 'PENDING_OWNER' };
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'apartalo',
      contexto: {
        nombre: 'Demo',
        tipo_negocio: 'Mixto',
        horario_atencion: 'Lunes a viernes 9:00 a 18:00',
        apartado_activo: true,
        apartado_porcentaje: 50,
        pago_transferencia_activo: true,
        transferencia_banco: 'Banco Demo',
        transferencia_clabe: '123456789012345678'
      },
      currentDate: new Date('2026-06-24T02:00:00.000Z'),
      interpreter: async () => ({
        intencion: 'INTENCION_COMPRA',
        herramienta_mcp: 'registrar_intencion_compra',
        parametros: { interes: 'apartalo', producto_id: 7 },
        confianza: 0.9,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager,
      contextStore: {
        async find() {
          return {
            ultima_intencion: 'CONSULTAR_PRECIO',
            ultimo_producto_id: 7,
            ultimo_servicio_id: null,
            ultimo_texto_busqueda: 'Silla',
            datos_json: {}
          };
        },
        async save(context) {
          savedContexts.push(context);
        }
      }
    });

    assert.equal(result.fuera_horario, undefined);
    assert.equal(result.intencion, 'SOLICITAR_APARTADO');
    assert.equal(result.herramienta_mcp, null);
    assert.equal(calls.some((call) => call.toolName === 'registrar_intencion_compra'), false);
    assert.equal(calls.some((call) => call.toolName === 'crear_pedido'), false);
    assert.deepEqual(handoffCalls, []);
    assert.equal(calls.find((call) => call.toolName === 'guardar_conversacion').args.estado, 'bot_active');
    assert.match(result.respuesta, /50%/);
    assert.match(result.respuesta, /Banco Demo/);
    assert.equal(savedContexts[0].ultimoProductoId, 7);
    assert.equal(savedContexts[0].datos.apartado_pendiente.producto.id, 7);
  });

  it('allows advisor requests during business hours', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'crear_lead') {
          return {
            lead_id: 57,
            telefono: args.telefono,
            interes: args.interes
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 114 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'asesor',
      contexto: {
        nombre: 'Demo',
        tipo_negocio: 'Mixto',
        horario_atencion: 'Lunes a viernes 9:00 a 18:00'
      },
      currentDate: new Date('2026-06-23T18:00:00.000Z'),
      interpreter: async () => ({
        intencion: 'HABLAR_ASESOR',
        herramienta_mcp: 'crear_lead',
        parametros: { interes: 'asesor' },
        confianza: 0.9,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager: noopHandoffManager,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.equal(result.fuera_horario, undefined);
    assert.equal(result.herramienta_mcp, 'crear_lead');
    assert.equal(calls.some((call) => call.toolName === 'crear_lead'), true);
    assert.equal(result.notificacion.estado, 'PENDING_OWNER');
  });

  it('does not create another lead when an active handoff already exists', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return { empresa: { nombre: 'Demo', tipo_negocio: 'Tienda' } };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 107 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const handoffManager = {
      async hasActive() {
        return true;
      },
      async request() {
        return { handoff_id: 9, estado: 'PENDING_OWNER', duplicate: true };
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'me interesa',
      interpreter: async () => ({
        intencion: 'INTENCION_COMPRA',
        herramienta_mcp: 'registrar_intencion_compra',
        parametros: { interes: 'me interesa' },
        confianza: 0.9,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.equal(calls.some((call) => call.toolName === 'registrar_intencion_compra'), false);
    assert.equal(result.notificacion.duplicate, true);
    assert.match(result.respuesta, /Ya avise a un asesor/);
  });

  it('uses configured welcome message for greetings', async () => {
    const mcpClient = {
      async callTool(toolName) {
        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 108 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const welcomeMessage = 'Hola, gracias por contactar a MOK Estudio + Taller.';

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'Hola',
      contexto: {
        nombre: 'MOK Estudio + Taller',
        mensaje_bienvenida: welcomeMessage
      },
      interpreter: async () => ({
        intencion: 'SALUDO',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.9,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.equal(result.respuesta, welcomeMessage);
  });

  it('uses configured welcome message for plain greeting text even with generic intent', async () => {
    const mcpClient = {
      async callTool(toolName) {
        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 109 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const welcomeMessage = 'Hola, gracias por contactar a MOK Estudio + Taller.';

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'Hola',
      contexto: {
        nombre: 'MOK Estudio + Taller',
        tipo_negocio: 'Mixto',
        mensaje_bienvenida: welcomeMessage
      },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.6,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.equal(result.intencion, 'SALUDO');
    assert.equal(result.respuesta, welcomeMessage);
  });

  it('falls back to service search when product search is empty for a service category', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return { empresa: { nombre: 'MOK Estudio + Taller', tipo_negocio: 'Servicios' } };
        }

        if (toolName === 'buscar_productos') {
          return { productos: [], paginacion: { offset: 0, limit: 5, next_offset: 0, has_more: false } };
        }

        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 31,
                nombre: 'Diseño de logotipo',
                precio: 0,
                tipo_precio: 'COTIZACION',
                duracion: 60,
                categoria: 'Diseño'
              }
            ]
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 109 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'Diseño',
      interpreter: async () => ({
        intencion: 'BUSCAR_PRODUCTO',
        herramienta_mcp: 'buscar_productos',
        parametros: { texto: 'diseño' },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.equal(result.herramienta_mcp, 'buscar_servicios');
    assert.equal(calls.some((call) => call.toolName === 'buscar_servicios'), true);
    assert.match(result.respuesta, /Diseño de logotipo/);
  });

  it('uses product strategy to route service questions to an advisor', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'crear_lead') {
          return {
            lead_id: 81,
            telefono: args.telefono,
            interes: args.interes
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 110 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'busco mesa',
      contexto: { nombre: 'Demo', tipo_negocio: 'PRODUCTOS' },
      interpreter: async () => ({
        intencion: 'BUSCAR_SERVICIO',
        herramienta_mcp: 'buscar_servicios',
        parametros: { texto: 'mesa' },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager: noopHandoffManager,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.equal(result.intencion, 'HABLAR_ASESOR');
    assert.equal(result.herramienta_mcp, 'crear_lead');
    assert.equal(calls.some((call) => call.toolName === 'buscar_servicios'), false);
    assert.equal(calls.some((call) => call.toolName === 'buscar_productos'), false);
    assert.equal(calls.some((call) => call.toolName === 'crear_lead'), true);
    assert.match(result.respuesta, /asesor/);
  });

  it('uses real services for service-business quote responses', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 51,
                nombre: 'Instalacion electrica',
                descripcion: 'Instalacion en sitio',
                precio: null,
                tipo_precio: 'COTIZACION',
                unidad_medida: 'asesor',
                requiere_medidas: false,
                requiere_cantidad: false,
                incluye: null,
                no_incluye: null,
                notas_cotizacion: 'Pedir ubicacion y alcance',
                precio_minimo: null,
                categoria: 'Instalaciones'
              }
            ]
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 111 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'instalacion electrica',
      contexto: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'BUSCAR_PRODUCTO',
        herramienta_mcp: 'buscar_productos',
        parametros: { texto: 'instalacion electrica' },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.equal(result.herramienta_mcp, 'buscar_servicios');
    assert.equal(calls.some((call) => call.toolName === 'buscar_productos'), false);
    assert.equal(calls.some((call) => call.toolName === 'buscar_servicios'), true);
    assert.match(result.respuesta, /Instalacion electrica/);
    assert.match(result.respuesta, /asesor/);
    assert.doesNotMatch(result.respuesta, /\$/);
  });

  it('calculates POR_M2 services from meter measurements', async () => {
    const mcpClient = {
      async callTool(toolName) {
        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 61,
                nombre: 'Impresion de lona',
                precio: 390,
                tipo_precio: 'POR_M2',
                unidad_medida: 'm2',
                requiere_medidas: true,
                requiere_cantidad: false,
                incluye: 'diseno',
                no_incluye: 'instalacion',
                notas_cotizacion: null,
                precio_minimo: null,
                categoria: 'Impresion'
              }
            ]
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 112 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'cuanto cuesta una lona de 2x1',
      contexto: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'BUSCAR_SERVICIO',
        herramienta_mcp: 'buscar_servicios',
        parametros: { texto: 'lona' },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.match(result.respuesta, /2 m²/);
    assert.match(result.respuesta, /\$780/);
    assert.match(result.respuesta, /Incluye diseno/);
    assert.match(result.respuesta, /No incluye instalacion/);
  });

  it('calculates POR_M2 services from centimeter measurements', async () => {
    const mcpClient = {
      async callTool(toolName) {
        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 62,
                nombre: 'Vinil impreso',
                precio: 390,
                tipo_precio: 'POR_M2',
                unidad_medida: 'm2',
                requiere_medidas: true,
                requiere_cantidad: false,
                incluye: null,
                no_incluye: null,
                notas_cotizacion: null,
                precio_minimo: null,
                categoria: 'Vinil'
              }
            ]
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 113 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'vinil impreso de 200cm x 100cm',
      contexto: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'BUSCAR_SERVICIO',
        herramienta_mcp: 'buscar_servicios',
        parametros: { texto: 'vinil impreso' },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.match(result.respuesta, /2 x 1 m/);
    assert.match(result.respuesta, /2 m²/);
    assert.match(result.respuesta, /\$780/);
  });

  it('lists active services for generic service catalog questions', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 70,
                nombre: 'Marketing digital',
                precio: null,
                tipo_precio: 'COTIZACION',
                unidad_medida: null,
                requiere_medidas: false,
                requiere_cantidad: false,
                incluye: null,
                no_incluye: null,
                notas_cotizacion: 'Cotizacion segun objetivos.',
                precio_minimo: null,
                categoria: 'Marketing'
              },
              {
                id: 71,
                nombre: 'Impresion de lona',
                precio: 390,
                tipo_precio: 'POR_M2',
                unidad_medida: 'm2',
                requiere_medidas: true,
                requiere_cantidad: false,
                incluye: 'diseno',
                no_incluye: 'instalacion',
                notas_cotizacion: null,
                precio_minimo: null,
                categoria: 'Impresion'
              }
            ]
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 121 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'Hola, que servicios tienen?',
      contexto: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'BUSCAR_SERVICIO',
        herramienta_mcp: 'buscar_servicios',
        parametros: { texto: 'servicios' },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    const serviceCall = calls.find((call) => call.toolName === 'buscar_servicios');

    assert.equal(serviceCall.args.texto, '');
    assert.match(result.respuesta, /Marketing digital/);
    assert.match(result.respuesta, /Impresion de lona/);
    assert.doesNotMatch(result.respuesta, /Quieres que te contacte un asesor/);
  });

  it('selects the matching service and preserves decimal measurements', async () => {
    const savedContexts = [];
    const mcpClient = {
      async callTool(toolName) {
        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 72,
                nombre: 'Impresion de lona',
                precio: 390,
                tipo_precio: 'POR_M2',
                unidad_medida: 'm2',
                requiere_medidas: true,
                requiere_cantidad: false,
                incluye: 'diseno',
                no_incluye: 'instalacion',
                notas_cotizacion: null,
                precio_minimo: null,
                categoria: 'Impresion'
              },
              {
                id: 73,
                nombre: 'Coroplast con vinil impreso',
                precio: null,
                tipo_precio: 'COTIZACION',
                unidad_medida: null,
                requiere_medidas: true,
                requiere_cantidad: false,
                incluye: null,
                no_incluye: null,
                notas_cotizacion: null,
                precio_minimo: null,
                categoria: 'Rigidos'
              },
              {
                id: 74,
                nombre: 'Vinil impreso',
                precio: 420,
                tipo_precio: 'POR_M2',
                unidad_medida: 'm2',
                requiere_medidas: true,
                requiere_cantidad: false,
                incluye: 'impresion',
                no_incluye: 'instalacion',
                notas_cotizacion: null,
                precio_minimo: null,
                categoria: 'Vinil'
              }
            ]
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 122 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'Quiero vinil impreso de 1.5 x 2',
      contexto: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'BUSCAR_SERVICIO',
        herramienta_mcp: 'buscar_servicios',
        parametros: { texto: 'vinil impreso' },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save(context) {
          savedContexts.push(context);
        }
      }
    });

    assert.match(result.respuesta, /1\.5 x 2 m/);
    assert.match(result.respuesta, /3 m²/);
    assert.match(result.respuesta, /\$1,260/);
    assert.equal(savedContexts[0].ultimoServicioId, 74);
    assert.equal(savedContexts[0].datos.servicio.nombre, 'Vinil impreso');
  });

  it('answers installation follow-ups from the last selected service', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_servicio') {
          return {
            servicio: {
              id: 75,
              nombre: 'Vinil de rotulacion de color',
              precio: 400,
              tipo_precio: 'POR_M2',
              unidad_medida: 'm2',
              requiere_medidas: true,
              requiere_cantidad: false,
              incluye: 'depilado y transfer',
              no_incluye: 'instalacion',
              notas_cotizacion: null,
              precio_minimo: null,
              categoria: 'Vinil'
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 123 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'El precio incluye instalacion?',
      contexto: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.5,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return {
            ultima_intencion: 'BUSCAR_SERVICIO',
            ultimo_producto_id: null,
            ultimo_servicio_id: 75,
            ultimo_texto_busqueda: 'vinil de rotulacion de color',
            datos_json: {
              servicio: {
                id: 75,
                nombre: 'Vinil de rotulacion de color',
                no_incluye: 'instalacion'
              }
            }
          };
        },
        async save() {}
      }
    });

    const serviceCall = calls.find((call) => call.toolName === 'obtener_servicio');

    assert.equal(serviceCall.args.servicio_id, 75);
    assert.match(result.respuesta, /no incluye instalacion/i);
    assert.match(result.respuesta, /Vinil de rotulacion de color/);
  });

  it('asks for measurements when POR_M2 service has no measurements', async () => {
    const mcpClient = {
      async callTool(toolName) {
        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 63,
                nombre: 'Impresion de lona',
                precio: 390,
                tipo_precio: 'POR_M2',
                unidad_medida: 'm2',
                requiere_medidas: true,
                requiere_cantidad: false,
                incluye: null,
                no_incluye: null,
                notas_cotizacion: null,
                precio_minimo: null,
                categoria: 'Impresion'
              }
            ]
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 114 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'tienen lona?',
      contexto: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'BUSCAR_SERVICIO',
        herramienta_mcp: 'buscar_servicios',
        parametros: { texto: 'lona' },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.match(result.respuesta, /ancho y alto/);
  });

  it('answers FIJO services with price and quantity from customer text', async () => {
    const mcpClient = {
      async callTool(toolName) {
        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 64,
                nombre: 'Tarjetas digitales laminado mate',
                precio: 297,
                tipo_precio: 'FIJO',
                unidad_medida: 'paquete',
                requiere_medidas: false,
                requiere_cantidad: true,
                incluye: null,
                no_incluye: null,
                notas_cotizacion: null,
                precio_minimo: null,
                categoria: 'Tarjetas'
              }
            ]
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 115 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'quiero tarjetas 100 piezas',
      contexto: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'BUSCAR_SERVICIO',
        herramienta_mcp: 'buscar_servicios',
        parametros: { texto: 'tarjetas' },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.match(result.respuesta, /Tarjetas digitales laminado mate de 100 piezas cuesta \$297/);
  });

  it('creates a service lead with real customer phone after advisor intent', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'crear_lead') {
          return {
            lead_id: 91,
            telefono: args.telefono,
            interes: args.interes,
            servicio_id: args.servicio_id
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 116 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: 'me interesa, pasame con asesor',
      contexto: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager: noopHandoffManager,
      contextStore: {
        async find() {
          return {
            ultima_intencion: 'BUSCAR_SERVICIO',
            ultimo_producto_id: null,
            ultimo_servicio_id: 61,
            ultimo_texto_busqueda: 'Impresion de lona',
            datos_json: {
              servicio: { id: 61, nombre: 'Impresion de lona', tipo_precio: 'POR_M2' }
            }
          };
        },
        async save() {}
      }
    });

    const leadCall = calls.find((call) => call.toolName === 'crear_lead');

    assert.equal(result.lead_id, 91);
    assert.equal(leadCall.args.telefono, '525550000000');
    assert.doesNotMatch(leadCall.args.telefono, /@c\.us$/);
    assert.equal(leadCall.args.servicio_id, 61);
    assert.match(leadCall.args.interes, /Impresion de lona/);
  });

  it('searches services before products for mixed businesses without crossing company scope', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 65,
                nombre: 'Tarjetas de presentacion',
                precio: 297,
                tipo_precio: 'FIJO',
                unidad_medida: 'paquete',
                requiere_medidas: false,
                requiere_cantidad: true,
                incluye: null,
                no_incluye: null,
                notas_cotizacion: null,
                precio_minimo: null,
                categoria: 'Tarjetas'
              }
            ]
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 117 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 77,
      phone: '5215550000000@c.us',
      message: 'quiero 600 tarjetas',
      contexto: { nombre: 'Demo mixto', tipo_negocio: 'MIXTO' },
      interpreter: async () => ({
        intencion: 'BUSCAR_PRODUCTO',
        herramienta_mcp: 'buscar_productos',
        parametros: { texto: 'tarjetas' },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    const serviceCall = calls.find((call) => call.toolName === 'buscar_servicios');

    assert.equal(result.herramienta_mcp, 'buscar_servicios');
    assert.equal(serviceCall.args.empresa_id, 77);
    assert.equal(calls.some((call) => call.toolName === 'buscar_productos'), false);
  });

  it('routes quantities above a configured package threshold to an advisor quote', async () => {
    const mcpClient = {
      async callTool(toolName) {
        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 65,
                nombre: 'Tarjetas digitales laminado mate 100 pzs',
                precio: 297,
                tipo_precio: 'FIJO',
                unidad_medida: 'paquete',
                requiere_medidas: false,
                requiere_cantidad: true,
                incluye: null,
                no_incluye: null,
                notas_cotizacion: '100 piezas laminado mate. Para mas de 500 piezas consultar con asesor.',
                precio_minimo: null,
                categoria: 'Impresion'
              }
            ]
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 118 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };

    const result = await orchestrateIncomingMessage({
      empresaId: 77,
      phone: '5215550000000@c.us',
      message: 'quiero 600 tarjetas',
      contexto: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: 'obtener_servicio',
        parametros: { servicio_id: 99 },
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      contextStore: {
        async find() {
          return {
            ultimo_servicio_id: 99,
            datos_json: {
              servicio: { id: 99, nombre: 'Otro servicio', tipo_precio: 'FIJO' }
            }
          };
        },
        async save() {}
      }
    });

    assert.equal(result.herramienta_mcp, 'buscar_servicios');
    assert.match(result.respuesta, /600 piezas/);
    assert.match(result.respuesta, /cotizacion con asesor/);
    assert.doesNotMatch(result.respuesta, /cuesta \$297/);
  });

  it('validates final MOK demo bot flow with real service data', async () => {
    const services = [
      {
        id: 1,
        nombre: 'Diseño de logotipo',
        descripcion: 'Diseño de marca',
        precio: null,
        tipo_precio: 'COTIZACION',
        unidad_medida: 'asesor',
        duracion: null,
        requiere_medidas: false,
        requiere_cantidad: false,
        incluye: null,
        no_incluye: null,
        notas_cotizacion: 'Cotización según alcance, aplicaciones y entregables.',
        precio_minimo: null,
        categoria: 'Diseño'
      },
      {
        id: 3,
        nombre: 'Diseño web',
        descripcion: 'Página web para negocios',
        precio: null,
        tipo_precio: 'COTIZACION',
        unidad_medida: 'asesor',
        duracion: null,
        requiere_medidas: false,
        requiere_cantidad: false,
        incluye: null,
        no_incluye: null,
        notas_cotizacion: 'Cotización según secciones, funciones y contenido.',
        precio_minimo: null,
        categoria: 'Diseño'
      },
      {
        id: 5,
        nombre: 'Tarjetas digitales laminado mate 100 pzs',
        descripcion: 'Tarjetas impresas en paquete de 100 piezas',
        precio: 297,
        tipo_precio: 'FIJO',
        unidad_medida: 'paquete',
        duracion: null,
        requiere_medidas: false,
        requiere_cantidad: true,
        incluye: null,
        no_incluye: null,
        notas_cotizacion: '100 piezas laminado mate. Para más de 500 piezas consultar con asesor.',
        precio_minimo: null,
        categoria: 'Impresión'
      },
      {
        id: 6,
        nombre: 'Impresión de lona',
        descripcion: 'Lona impresa por metro cuadrado',
        precio: 390,
        tipo_precio: 'POR_M2',
        unidad_medida: 'm2',
        duracion: null,
        requiere_medidas: true,
        requiere_cantidad: false,
        incluye: 'Diseño',
        no_incluye: 'Instalación',
        notas_cotizacion: null,
        precio_minimo: null,
        categoria: 'Impresión'
      },
      {
        id: 7,
        nombre: 'Vinil impreso',
        descripcion: 'Vinil impreso por metro cuadrado',
        precio: 390,
        tipo_precio: 'POR_M2',
        unidad_medida: 'm2',
        duracion: null,
        requiere_medidas: true,
        requiere_cantidad: false,
        incluye: 'Diseño',
        no_incluye: 'Instalación',
        notas_cotizacion: null,
        precio_minimo: null,
        categoria: 'Vinil'
      },
      {
        id: 9,
        nombre: 'Instalación',
        descripcion: 'Instalación de materiales en sitio',
        precio: null,
        tipo_precio: 'COTIZACION',
        unidad_medida: 'asesor',
        duracion: null,
        requiere_medidas: false,
        requiere_cantidad: false,
        incluye: null,
        no_incluye: null,
        notas_cotizacion: 'Cotización según ubicación, superficie, altura y complejidad de instalación.',
        precio_minimo: null,
        categoria: 'Instalación'
      },
      {
        id: 11,
        nombre: 'Vinil reflejante',
        descripcion: 'Vinil reflejante por metro cuadrado',
        precio: 800,
        tipo_precio: 'POR_M2',
        unidad_medida: 'm2',
        duracion: null,
        requiere_medidas: true,
        requiere_cantidad: false,
        incluye: 'Depilado y transfer',
        no_incluye: 'Instalación',
        notas_cotizacion: null,
        precio_minimo: null,
        categoria: 'Vinil'
      }
    ];
    const stopWords = new Set([
      'a',
      'con',
      'cotizame',
      'cuanto',
      'cuesta',
      'de',
      'del',
      'el',
      'en',
      'hacen',
      'la',
      'las',
      'los',
      'manejan',
      'ofrecen',
      'para',
      'por',
      'que',
      'quiero',
      'servicio',
      'servicios',
      'tienen',
      'una',
      'un',
      'x'
    ]);
    const normalize = (value) => String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim();
    const tokenVariants = (token) => {
      const variants = new Set([token]);

      if (token.length > 4 && token.endsWith('es')) {
        variants.add(token.slice(0, -2));
      }

      if (token.length > 3 && token.endsWith('s')) {
        variants.add(token.slice(0, -1));
      }

      return [...variants];
    };
    const searchServices = (text) => {
      const tokens = normalize(text)
        .split(/\s+/)
        .filter((token) => token.length > 1 && !/^\d+$/.test(token) && !stopWords.has(token));

      if (!tokens.length) {
        return services;
      }

      return services.filter((service) => {
        const haystack = normalize(`${service.nombre} ${service.descripcion} ${service.categoria}`);
        return tokens.some((token) => tokenVariants(token).some((variant) => haystack.includes(variant)));
      });
    };
    const calls = [];
    const contexts = new Map();
    const rows = [];
    const leads = [];
    let nextConversationId = 700;
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'buscar_servicios') {
          return { servicios: searchServices(args.texto) };
        }

        if (toolName === 'obtener_servicio') {
          return { servicio: services.find((service) => service.id === args.servicio_id) };
        }

        if (toolName === 'crear_lead' || toolName === 'registrar_intencion_compra') {
          const lead = {
            lead_id: 900 + leads.length,
            nombre_cliente: args.nombre_cliente ?? args.contact_name ?? 'Cliente WhatsApp',
            telefono: args.telefono,
            whatsapp_id: args.whatsapp_id,
            contact_name: args.contact_name,
            interes: args.interes,
            producto_id: args.producto_id ?? null,
            servicio_id: args.servicio_id ?? null
          };
          leads.push({ toolName, args, lead });
          return lead;
        }

        if (toolName === 'guardar_conversacion') {
          rows.push(args);
          return { conversacion_id: nextConversationId++ };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const contextStore = {
      async find({ empresaId, phone }) {
        return contexts.get(`${empresaId}:${phone}`) ?? null;
      },
      async save(context) {
        contexts.set(`${context.empresaId}:${context.phone}`, {
          ultima_intencion: context.ultimaIntencion,
          ultimo_producto_id: context.ultimoProductoId,
          ultimo_servicio_id: context.ultimoServicioId,
          ultimo_texto_busqueda: context.ultimoTextoBusqueda,
          datos_json: context.datos
        });
      }
    };
    const handoffRequests = [];
    const handoffManager = {
      async hasActive() {
        return false;
      },
      async request(args) {
        handoffRequests.push(args);
        return { handoff_id: 1000 + handoffRequests.length, estado: 'PENDING_OWNER', duplicate: false };
      }
    };
    const run = (message) => orchestrateIncomingMessage({
      empresaId: 5,
      phone: '5212205722560@c.us',
      whatsappChatId: '5212205722560@c.us',
      contactName: 'Francisco',
      message,
      contexto: { nombre: 'MOK Estudio + Taller', tipo_negocio: 'MIXTO' },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.8,
        requiere_respuesta_ia: false
      }),
      mcpClient,
      handoffManager,
      contextStore
    });

    const catalog = await run('Hola, ¿qué servicios tienen?');
    assert.match(catalog.respuesta, /Diseño de logotipo/);
    assert.match(catalog.respuesta, /Impresión de lona/);

    const lonaMeters = await run('cuánto cuesta una lona de 2x1');
    assert.match(lonaMeters.respuesta, /2 m²/);
    assert.match(lonaMeters.respuesta, /\$780\.00/);

    const lonaCentimeters = await run('cotízame una lona de 200cm x 100cm');
    assert.match(lonaCentimeters.respuesta, /2 x 1 m/);
    assert.match(lonaCentimeters.respuesta, /2 m²/);
    assert.match(lonaCentimeters.respuesta, /\$780\.00/);

    const vinilImpreso = await run('vinil impreso 1.5x2');
    assert.match(vinilImpreso.respuesta, /3 m²/);
    assert.match(vinilImpreso.respuesta, /\$1,170\.00/);

    const vinilReflejante = await run('vinil reflejante 1x1');
    assert.match(vinilReflejante.respuesta, /1 m²/);
    assert.match(vinilReflejante.respuesta, /\$800\.00/);

    const tarjetas100 = await run('quiero tarjetas 100 piezas');
    assert.match(tarjetas100.respuesta, /\$297\.00/);

    const tarjetas600 = await run('quiero 600 tarjetas');
    assert.match(tarjetas600.respuesta, /600 piezas/);
    assert.match(tarjetas600.respuesta, /cotizacion con asesor/i);
    assert.doesNotMatch(tarjetas600.respuesta, /\$1,782|\$297\.00/);

    const web = await run('hacen diseño web');
    assert.match(web.respuesta, /Diseño web/);
    assert.match(web.respuesta, /asesor/);
    assert.doesNotMatch(web.respuesta, /\$\d/);

    const logo = await run('hacen logotipos');
    assert.match(logo.respuesta, /Diseño de logotipo/);
    assert.match(logo.respuesta, /alcance/);
    assert.doesNotMatch(logo.respuesta, /\$\d/);

    const installation = await run('quiero instalación');
    assert.match(installation.respuesta, /Instalación/);
    assert.match(installation.respuesta, /ubicación|superficie|altura|asesor/i);
    assert.doesNotMatch(installation.respuesta, /\$\d/);

    const interest = await run('me interesa');
    assert.equal(interest.lead_id, 900);
    assert.equal(interest.mcp_result.telefono, '522205722560');
    assert.equal(interest.mcp_result.whatsapp_id, '5212205722560@c.us');
    assert.equal(interest.mcp_result.contact_name, 'Francisco');
    assert.equal(interest.mcp_result.servicio_id, 9);

    const advisor = await run('pásame con un asesor');
    assert.equal(advisor.lead_id, 901);
    assert.equal(advisor.mcp_result.telefono, '522205722560');
    assert.equal(advisor.mcp_result.whatsapp_id, '5212205722560@c.us');
    assert.equal(advisor.mcp_result.contact_name, 'Francisco');
    assert.equal(advisor.mcp_result.servicio_id, 9);

    assert.equal(calls.filter((call) => call.toolName === 'buscar_servicios').every((call) => call.args.empresa_id === 5), true);
    assert.equal(calls.some((call) => call.toolName === 'buscar_productos'), false);
    assert.equal(rows.every((row) => row.empresa_id === 5), true);
    const mojibakePattern = new RegExp('[\\u00c3\\u00c2]|\\u00f0\\u0178|m\\u00c2\\u00b2');
    assert.equal(rows.every((row) => !mojibakePattern.test(`${row.mensaje} ${row.respuesta}`)), true);
    assert.equal(rows.every((row) => !/duraci[oó]n/i.test(row.respuesta)), true);
    assert.equal(leads.every(({ args }) => args.empresa_id === 5), true);
  });

  it('normalizes customer text for intent and MCP search without changing saved message', async () => {
    const calls = [];
    let interpreterInput = null;
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return { empresa: { nombre: 'Demo', tipo_negocio: 'Tienda' } };
        }

        if (toolName === 'buscar_productos') {
          return {
            productos: [
              {
                id: 71,
                nombre: 'Silla de madera',
                precio: 800,
                stock: 5,
                imagen: null,
                categoria: 'Sillas'
              }
            ],
            paginacion: {
              offset: 0,
              limit: 5,
              next_offset: 1,
              has_more: false
            }
          };
        }

        if (toolName === 'guardar_conversacion') {
          return { conversacion_id: 106 };
        }

        throw new Error(`Unexpected tool: ${toolName}`);
      }
    };
    const contextStore = {
      async find() {
        return null;
      },
      async save() {}
    };
    const originalMessage = 'TINES SIYAS DE MADRA??';

    await orchestrateIncomingMessage({
      empresaId: 1,
      phone: '5215550000000@c.us',
      message: originalMessage,
      interpreter: async (input) => {
        interpreterInput = input;

        return {
          intencion: 'BUSCAR_PRODUCTO',
          herramienta_mcp: 'buscar_productos',
          parametros: {},
          confianza: 0.9,
          requiere_respuesta_ia: false
        };
      },
      mcpClient,
      contextStore
    });
    const productSearchCall = calls.find((call) => call.toolName === 'buscar_productos');
    const saveConversationCall = calls.find((call) => call.toolName === 'guardar_conversacion');

    assert.equal(interpreterInput.mensaje_cliente, 'tienes sillas de madera');
    assert.equal(productSearchCall.args.texto, 'tienes sillas de madera');
    assert.equal(saveConversationCall.args.mensaje, originalMessage);
  });

  it('returns a safe non-empty fallback when configured fallback is blank', async () => {
    let savedArgs = null;
    const result = await orchestrateIncomingMessage({
      empresaId: 5,
      phone: '5215550000000',
      message: '???',
      contexto: {
        nombre: 'Empresa Demo',
        tipo_negocio: 'General',
        fallback_message: '   '
      },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.2,
        requiere_respuesta_ia: false
      }),
      mcpClient: {
        async callTool(toolName, args) {
          assert.equal(toolName, 'guardar_conversacion');
          savedArgs = args;
          return { conversacion_id: 9001 };
        }
      },
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.ok(result.respuesta.trim().length > 0);
    assert.equal(savedArgs.respuesta, result.respuesta);
  });

  it('falls back, saves the conversation, and responds when the interpreter throws', async () => {
    let savedArgs = null;
    const result = await orchestrateIncomingMessage({
      empresaId: 5,
      phone: '5215550000000',
      message: 'Hola',
      contexto: {
        nombre: 'Empresa Demo',
        tipo_negocio: 'General'
      },
      interpreter: async () => {
        throw new Error('OpenAI timeout');
      },
      mcpClient: {
        async callTool(toolName, args) {
          assert.equal(toolName, 'guardar_conversacion');
          savedArgs = args;
          return { conversacion_id: 9002 };
        }
      },
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.equal(result.intencion, 'SALUDO');
    assert.ok(result.respuesta.trim().length > 0);
    assert.equal(savedArgs.mensaje, 'Hola');
    assert.equal(savedArgs.respuesta, result.respuesta);
  });

  it('does not reuse the previous service when a price question names a new subject', async () => {
    const calls = [];
    const result = await orchestrateIncomingMessage({
      empresaId: 5,
      phone: '527298349854',
      message: 'Cuanto cuesta un logo?',
      contexto: { tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.2,
        requiere_respuesta_ia: false
      }),
      mcpClient: {
        async callTool(toolName, args) {
          calls.push({ toolName, args });

          if (toolName === 'buscar_servicios') {
            return {
              servicios: [{
                id: 31,
                nombre: 'Diseno de logotipo',
                descripcion: 'Identidad visual y logotipo para negocios',
                tipo_precio: 'COTIZACION',
                notas_cotizacion: 'Precio sujeto al alcance del proyecto'
              }]
            };
          }

          if (toolName === 'guardar_conversacion') {
            return { conversacion_id: 300 };
          }

          throw new Error(`Unexpected tool: ${toolName}`);
        }
      },
      contextStore: {
        async find() {
          return {
            ultimo_servicio_id: 77,
            ultimo_texto_busqueda: 'Marketing digital',
            datos_json: {
              servicio: { id: 77, nombre: 'Marketing digital' }
            }
          };
        },
        async save() {}
      }
    });

    assert.equal(result.herramienta_mcp, 'buscar_servicios');
    assert.equal(calls.some((call) => call.toolName === 'obtener_servicio'), false);
    assert.match(result.respuesta, /logotipo/i);
  });

  it('prefers social media services over a generic design web match', async () => {
    const result = await orchestrateIncomingMessage({
      empresaId: 5,
      phone: '527298349854',
      message: 'Necesito diseno para redes sociales',
      contexto: { tipo_negocio: 'SERVICIOS' },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: '',
        parametros: {},
        confianza: 0.2,
        requiere_respuesta_ia: false
      }),
      mcpClient: {
        async callTool(toolName) {
          if (toolName === 'buscar_servicios') {
            return {
              servicios: [
                {
                  id: 40,
                  nombre: 'Diseno web',
                  descripcion: 'Diseno de paginas y sitios web',
                  tipo_precio: 'COTIZACION'
                },
                {
                  id: 41,
                  nombre: 'Marketing digital',
                  descripcion: 'Contenido y diseno para redes sociales',
                  tipo_precio: 'COTIZACION'
                }
              ]
            };
          }

          if (toolName === 'guardar_conversacion') {
            return { conversacion_id: 301 };
          }

          throw new Error(`Unexpected tool: ${toolName}`);
        }
      },
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    assert.match(result.respuesta, /Marketing digital/);
    assert.doesNotMatch(result.respuesta, /Diseno web/);
  });

  it('turns complex branding quote requests into a rich advisor lead', async () => {
    const calls = [];
    const handoffRequests = [];
    const message = 'Hola, me llamo Francisco. Tengo una cafetería llamada Café Luna y quiero renovar mi imagen. Necesito logo, colores, publicaciones para Instagram y una cotización. ¿Me pueden ayudar?';

    const result = await orchestrateIncomingMessage({
      empresaId: 5,
      phone: '5212205722560',
      whatsappChatId: '5212205722560@c.us',
      contactName: 'Francisco',
      message,
      contexto: {
        nombre: 'MOK Estudio + Taller',
        tipo_negocio: 'SERVICIOS',
        response_profile: {
          mensaje_asesor: 'Perfecto, voy a avisarle a un asesor para revisar tu proyecto.'
        }
      },
      interpreter: async () => ({
        intencion: 'MENSAJE_GENERAL',
        herramienta_mcp: 'buscar_servicios',
        parametros: { texto: 'logo colores publicaciones instagram cotizacion' },
        confianza: 0.7,
        requiere_respuesta_ia: false
      }),
      mcpClient: {
        async callTool(toolName, args) {
          calls.push({ toolName, args });

          if (toolName === 'crear_lead') {
            return {
              lead_id: 123,
              telefono: args.telefono,
              whatsapp_id: args.whatsapp_id,
              contact_name: args.contact_name,
              interes: args.interes
            };
          }

          if (toolName === 'guardar_conversacion') {
            return { conversacion_id: 456 };
          }

          throw new Error(`Unexpected tool: ${toolName}`);
        }
      },
      handoffManager: {
        async hasActive() {
          return false;
        },
        async request(args) {
          handoffRequests.push(args);
          return { handoff_id: 789, estado: 'PENDING_OWNER', duplicate: false };
        }
      },
      contextStore: {
        async find() {
          return null;
        },
        async save() {}
      }
    });

    const leadCall = calls.find((call) => call.toolName === 'crear_lead');
    assert.equal(result.herramienta_mcp, 'crear_lead');
    assert.equal(result.lead_id, 123);
    assert.equal(calls.some((call) => call.toolName === 'buscar_servicios'), false);
    assert.match(result.respuesta, /asesor/i);
    assert.match(leadCall.args.interes, /Café Luna|Cafe Luna/i);
    assert.match(leadCall.args.interes, /logo\/logotipo/i);
    assert.match(leadCall.args.interes, /publicaciones\/redes sociales/i);
    assert.equal(handoffRequests.length, 1);
    assert.match(handoffRequests[0].resumen_solicitud, /Café Luna|Cafe Luna/i);
    assert.match(handoffRequests[0].resumen_solicitud, /cotización|cotizacion|Instagram/i);
    assert.equal(handoffRequests[0].telefono_cliente, '522205722560');
    assert.equal(handoffRequests[0].atendido_por_bot, false);
  });

  it('does not reuse product or service context for a thank-you message', async () => {
    for (const tipoNegocio of ['PRODUCTOS', 'SERVICIOS', 'MIXTO']) {
      const calls = [];
      const result = await orchestrateIncomingMessage({
        empresaId: 5,
        phone: '527298349854',
        message: 'Muchas gracias',
        contexto: {
          nombre: 'Empresa demo',
          tipo_negocio: tipoNegocio
        },
        interpreter: async () => ({
          intencion: 'BUSCAR_PRODUCTO',
          herramienta_mcp: 'buscar_productos',
          parametros: { texto: 'solicitud anterior' },
          confianza: 0.2,
          requiere_respuesta_ia: false
        }),
        mcpClient: {
          async callTool(toolName) {
            calls.push(toolName);

            if (toolName === 'guardar_conversacion') {
              return { conversacion_id: 900 };
            }

            throw new Error(`Unexpected tool: ${toolName}`);
          }
        },
        contextStore: {
          async find() {
            return {
              ultima_intencion: 'BUSCAR_SERVICIO',
              ultimo_producto_id: 15,
              ultimo_servicio_id: 31,
              ultimo_texto_busqueda: 'branding para Cafe Luna',
              datos_json: {}
            };
          },
          async save() {}
        }
      });

      assert.equal(result.intencion, 'AGRADECIMIENTO');
      assert.equal(result.herramienta_mcp, '');
      assert.match(result.respuesta, /Con gusto/i);
      assert.doesNotMatch(result.respuesta, /no encontr/i);
      assert.deepEqual(calls, ['guardar_conversacion']);
    }
  });
});
