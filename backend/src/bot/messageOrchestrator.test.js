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

    assert.match(result.respuesta, /2 m2/);
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
    assert.match(result.respuesta, /2 m2/);
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
    assert.match(result.respuesta, /3 m2/);
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
