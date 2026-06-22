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

  it('uses the last product context for short purchase follow-up messages', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'obtener_configuracion_empresa') {
          return { empresa: { nombre: 'Demo', tipo_negocio: 'Tienda' } };
        }

        if (toolName === 'registrar_intencion_compra') {
          return {
            lead_id: 55,
            nombre_cliente: 'Cliente WhatsApp',
            telefono: args.telefono,
            interes: args.interes,
            producto_id: args.producto_id
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
      async save() {}
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
    const leadCall = calls.find((call) => call.toolName === 'registrar_intencion_compra');

    assert.equal(result.intencion, 'INTENCION_COMPRA');
    assert.equal(leadCall.args.producto_id, 22);
    assert.equal(leadCall.args.interes, 'Silla Plastico');
    assert.equal(result.notificacion.estado, 'PENDING_OWNER');
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

  it('uses service strategy for service businesses', async () => {
    const calls = [];
    const mcpClient = {
      async callTool(toolName, args) {
        calls.push({ toolName, args });

        if (toolName === 'buscar_servicios') {
          return {
            servicios: [
              {
                id: 91,
                nombre: 'Instalacion electrica',
                precio: 1200,
                tipo_precio: 'DESDE',
                duracion: 90
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
});
