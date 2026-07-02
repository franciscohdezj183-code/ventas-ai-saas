import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runConversationEngine } from './conversation-engine.service.js';

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const services = [
  {
    id: 1,
    nombre: 'Reparacion de refrigeradores',
    descripcion: 'Servicio de refrigeracion y linea blanca para equipos que no enfrian',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Refrigeracion'
  },
  {
    id: 2,
    nombre: 'Plomeria residencial',
    descripcion: 'Reparacion de fugas en lavabo, tuberia y drenaje',
    precio: 450,
    tipo_precio: 'DESDE',
    categoria: 'Plomeria'
  },
  {
    id: 3,
    nombre: 'Consulta dental',
    descripcion: 'Valoracion por dolor de muela, diente o encia',
    precio: 600,
    tipo_precio: 'FIJO',
    categoria: 'Dental'
  },
  {
    id: 4,
    nombre: 'Mantenimiento de computadoras',
    descripcion: 'Soporte tecnico para computadora lenta, virus o laptop que falla',
    precio: 350,
    tipo_precio: 'DESDE',
    categoria: 'Computadoras'
  },
  {
    id: 5,
    nombre: 'Instalacion de camaras de seguridad',
    descripcion: 'CCTV, videovigilancia e instalacion de camaras',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Seguridad'
  },
  {
    id: 6,
    nombre: 'Marketing digital',
    descripcion: 'Paginas web, sitios web, landing pages, ecommerce y anuncios digitales',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Marketing'
  },
  {
    id: 7,
    nombre: 'Impresion de lona',
    descripcion: 'Impresion gran formato en lona para anunciar negocios, eventos y promociones',
    precio: 390,
    tipo_precio: 'POR_M2',
    requiere_medidas: true,
    incluye: 'impresion en lona',
    no_incluye: 'instalacion',
    categoria: 'Impresion'
  },
  {
    id: 8,
    nombre: 'Vinil impreso',
    descripcion: 'Vinil para rotulacion, aparadores, anuncios y decoracion comercial',
    precio: 390,
    tipo_precio: 'POR_M2',
    requiere_medidas: true,
    categoria: 'Viniles'
  },
  {
    id: 9,
    nombre: 'Logotipo e identidad visual',
    descripcion: 'Diseno de logo, paleta de color e identidad para negocios',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Branding'
  },
  {
    id: 11,
    nombre: 'Senaletica comercial',
    descripcion: 'Senaletica para oficinas, locales y puntos de venta',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Senaletica'
  },
  {
    id: 12,
    nombre: 'Playeras DTF',
    descripcion: 'Impresion textil personalizada para uniformes y promociones',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Textil'
  },
  {
    id: 13,
    nombre: 'Promocionales',
    descripcion: 'Articulos promocionales para campanas y eventos',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Promocionales'
  },
  {
    id: 14,
    nombre: 'Banner arana',
    descripcion: 'Banner portatil para eventos, exposiciones y publicidad en punto de venta',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Banners'
  },
  {
    id: 15,
    nombre: 'Tarjetas digitales laminado mate 100 pzs',
    descripcion: 'Tarjetas de presentacion impresas para negocios',
    precio: 297,
    tipo_precio: 'FIJO',
    categoria: 'Impresion'
  }
];

const products = [
  {
    id: 10,
    nombre: 'Silla economica',
    descripcion: 'Silla barata para hogar',
    precio: 399,
    stock: 4,
    categoria: 'Sillas'
  }
];

function buildMcpClient({ company = {}, serviceCatalog = services, productCatalog = products } = {}) {
  const calls = [];

  return {
    calls,
    async loadFullServiceCatalog() {
      return {
        services: serviceCatalog,
        categories: serviceCatalog.map((service, index) => ({ id: index + 1, nombre: service.categoria, tipo: 'SERVICIO' }))
      };
    },
    async callTool(toolName, args) {
      calls.push({ toolName, args });

      if (toolName === 'obtener_configuracion_empresa') {
        return { empresa: { nombre: 'Demo', tipo_negocio: 'MIXTO', ...company } };
      }

      if (toolName === 'obtener_categorias') {
        return { categorias: serviceCatalog.map((service, index) => ({ id: index + 1, nombre: service.categoria })) };
      }

      if (toolName === 'buscar_servicios') {
        const text = normalize(args.texto);
        const tokens = text.split(/\s+/).filter((token) => token.length > 2);
        return {
          servicios: serviceCatalog.filter((service) => {
            const haystack = normalize(`${service.nombre} ${service.descripcion} ${service.categoria}`);
            return tokens.length === 0 || tokens.some((token) => haystack.includes(token));
          })
        };
      }

      if (toolName === 'buscar_productos') {
        const text = normalize(args.texto);
        return {
          productos: productCatalog.filter((product) => normalize(`${product.nombre} ${product.descripcion} ${product.categoria}`).includes(text.split(/\s+/)[0] ?? ''))
        };
      }

      if (toolName === 'guardar_conversacion') {
        return { conversacion_id: 900 };
      }

      if (toolName === 'crear_lead') {
        return { lead_id: 700, interes: args.interes };
      }

      throw new Error(`Unexpected tool: ${toolName}`);
    }
  };
}

function buildContextStore(context = null) {
  const saved = [];
  return {
    saved,
    async find() {
      return context;
    },
    async save(payload) {
      saved.push(payload);
      return payload;
    }
  };
}

function buildPersistentContextStore(context = null) {
  const saved = [];
  let current = context;
  return {
    saved,
    async find() {
      return current;
    },
    async save(payload) {
      saved.push(payload);
      current = {
        ultima_intencion: payload.ultimaIntencion,
        ultimo_producto_id: payload.ultimoProductoId,
        ultimo_servicio_id: payload.ultimoServicioId,
        ultimo_texto_busqueda: payload.ultimoTextoBusqueda,
        datos_json: payload.datos
      };
      return payload;
    }
  };
}

async function runCase(message, context = null, options = {}) {
  const mcpClient = buildMcpClient(options);
  const contextStore = buildContextStore(context);
  const result = await runConversationEngine({
    empresaId: 1,
    phone: '5215550000000',
    message,
    whatsappChatId: '5215550000000@c.us',
    contactName: 'Cliente',
    mcpClient,
    contextStore
  });

  return { result, mcpClient, contextStore };
}

function assertNoFalseNegative(response) {
  assert.doesNotMatch(normalize(response), /no contamos con ese servicio/);
}

describe('Nexus Conversational Intelligence Engine', () => {
  const serviceCases = [
    ['mi refrigerador ya no enfria', 'refrigeracion', 'Reparacion de refrigeradores'],
    ['tengo fuga debajo del lavabo', 'plomeria', 'Plomeria residencial'],
    ['me duele una muela', 'dental', 'Consulta dental'],
    ['mi compu esta lenta', 'computadoras', 'Mantenimiento de computadoras'],
    ['quiero poner camaras', 'camaras', 'Instalacion de camaras de seguridad']
  ];

  for (const [message, problem, expectedService] of serviceCases) {
    it(`understands service problem: ${message}`, async () => {
      const { result, contextStore } = await runCase(message);

      assert.equal(result.tipo, 'service');
      assert.equal(result.intencion, 'BUSCAR_SERVICIO');
      assert.equal(result.parametros.problem, problem);
      assert.equal(result.ncie.decision.selectedType, 'service');
      assert.match(result.respuesta, new RegExp(expectedService, 'i'));
      assertNoFalseNegative(result.respuesta);
      assert.equal(contextStore.saved[0].datos.ncie.problem, problem);
    });
  }

  it('asks one clarifying question for price without subject', async () => {
    const { result } = await runCase('cuanto sale');

    assert.equal(result.intencion, 'CONSULTAR_PRECIO');
    assert.equal(result.tipo, 'unknown');
    assert.deepEqual(result.parametros.product, null);
    assert.equal(result.ncie.decision.action, 'ask_clarifying_question');
    assert.match(result.respuesta, /producto o servicio/i);
    assertNoFalseNegative(result.respuesta);
  });

  it('uses previous service context for "ese"', async () => {
    const { result } = await runCase('ese', {
      ultima_intencion: 'BUSCAR_SERVICIO',
      ultimo_producto_id: null,
      ultimo_servicio_id: 2,
      ultimo_texto_busqueda: 'Plomeria residencial',
      datos_json: {
        servicio: services[1]
      }
    });

    assert.equal(result.intencion, 'INTENCION_COMPRA');
    assert.equal(result.tipo, 'service');
    assert.equal(result.ncie.commercialReasoning.recommended_action, 'use_memory');
    assert.equal(result.ncie.responsePlan.type, 'quote_from_memory');
    assert.match(normalize(result.respuesta), /retomamos plomeria residencial/i);
    assertNoFalseNegative(result.respuesta);
  });

  it('continues commercial flow when interest exists in context', async () => {
    const { result } = await runCase('me interesa', {
      ultima_intencion: 'BUSCAR_SERVICIO',
      ultimo_producto_id: null,
      ultimo_servicio_id: 5,
      ultimo_texto_busqueda: 'Instalacion de camaras de seguridad',
      datos_json: {
        servicio: services[4]
      }
    });

    assert.equal(result.intencion, 'INTENCION_COMPRA');
    assert.equal(result.tipo, 'service');
    assert.equal(result.lead_id, null);
    assert.equal(result.ncie.responsePlan.type, 'quote_from_memory');
    assert.equal(result.ncie.decision.funnelStage, 'cotizacion');
    assertNoFalseNegative(result.respuesta);
  });

  it('does not invent for cheap vague search', async () => {
    const { result } = await runCase('algo barato');

    assert.equal(result.intencion, 'BUSCAR_PRODUCTO');
    assert.equal(result.tipo, 'product');
    assert.equal(result.ncie.decision.action, 'ask_clarifying_question');
    assert.match(normalize(result.respuesta), /producto, servicio o categoria/i);
    assertNoFalseNegative(result.respuesta);
  });

  it('skips retrieval for open commercial diagnosis messages under planner authority', async () => {
    process.env.NCIE_CONVERSATION_PLANNER_ENABLED = 'true';
    process.env.NCIE_CONVERSATION_PLANNER_SHADOW = 'false';
    try {
      const diagnosticMessages = [
        'No se que necesito',
        'Que me recomiendas',
        'Quiero vender mas',
        'Quiero atraer clientes',
        'Necesito publicidad',
        'Quiero promocionar mi negocio',
        'Quiero mejorar mi presencia'
      ];

      for (const message of diagnosticMessages) {
        const { result, mcpClient } = await runCase(message);
        assert.equal(result.ncie.plannerAuthorityDecision.responsePlanType, 'consultative_diagnosis');
        assert.equal(result.ncie.plannerAuthorityDecision.retrievalNeeded, false);
        assert.equal(result.ncie.plannerAuthorityDecision.selectedService, null);
        assert.equal(result.ncie.plannerAuthorityDecision.activeFlow, null);
        assert.equal(result.ncie.responsePlan.type, 'consultative_diagnosis');
        assert.equal(mcpClient.calls.some((call) => call.toolName === 'buscar_servicios'), false);
        assert.doesNotMatch(normalize(result.respuesta), /tarjetas digitales laminado mate 100 pzs|impresion de lona si puede ser una buena opcion|marketing digital si puede ser una buena opcion/);
      }

      const { result: lona, mcpClient: lonaClient } = await runCase('Me interesa una lona');
      assert.equal(lona.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(lona.ncie.plannerAuthorityDecision.responsePlanType, 'ask_measurements');
      assert.equal(lonaClient.calls.some((call) => call.toolName === 'buscar_servicios'), true);
      assert.match(normalize(lona.respuesta), /impresion de lona|medidas/);
    } finally {
      delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
      delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
    }
  });

  it('handles real WhatsApp typo diagnosis without selecting tarjetas', async () => {
    process.env.NCIE_CONVERSATION_PLANNER_ENABLED = 'true';
    process.env.NCIE_CONVERSATION_PLANNER_SHADOW = 'false';
    try {
      const mcpClient = buildMcpClient();
      const contextStore = buildPersistentContextStore();
      const run = (message) => runConversationEngine({
        empresaId: 1,
        phone: '5217298349854',
        message,
        whatsappChatId: '5217298349854@c.us',
        contactName: 'Francisco',
        mcpClient,
        contextStore
      });

      await run('Hola');
      const noSe = await run('Nose que necesito');
      assert.equal(noSe.ncie.plannerAuthorityDecision.responsePlanType, 'consultative_diagnosis');
      assert.equal(noSe.ncie.plannerAuthorityDecision.retrievalNeeded, false);
      assert.equal(noSe.ncie.plannerAuthorityDecision.selectedService, null);
      assert.equal(noSe.ncie.responsePlan.type, 'consultative_diagnosis');
      assert.doesNotMatch(normalize(noSe.respuesta), /tarjetas digitales laminado mate 100 pzs|cuantas piezas/);

      const papeleria = await run('Tengo una papeleria');
      assert.equal(papeleria.ncie.responsePlan.businessContext, 'papeleria');
      const atraer = await run('Quiero atraer mas clientes');
      assert.equal(atraer.ncie.responsePlan.type, 'consultative_diagnosis');
      assert.match(normalize(atraer.respuesta), /papeleria|opciones fisicas|opciones digitales/);
      assert.doesNotMatch(atraer.respuesta, /Â/);
    } finally {
      delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
      delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
    }
  });

  it('does not confuse catalog requests and diagnosis answers with web flow', async () => {
    process.env.NCIE_CONVERSATION_PLANNER_ENABLED = 'true';
    process.env.NCIE_CONVERSATION_PLANNER_SHADOW = 'false';
    try {
      const mcpClient = buildMcpClient();
      const contextStore = buildPersistentContextStore();
      const run = (message) => runConversationEngine({
        empresaId: 1,
        phone: '5217712444430',
        message,
        whatsappChatId: '5217712444430@c.us',
        contactName: 'Omar',
        mcpClient,
        contextStore
      });

      await run('Hola');
      await run('Un puta');
      const catalogo = await run('Cual es tu catalogo?');
      assert.equal(catalogo.ncie.plannerAuthorityDecision.responsePlanType, 'catalog_listing');
      assert.equal(catalogo.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(catalogo.respuesta), /marketing|impresion|servicios/);
      assert.doesNotMatch(normalize(catalogo.respuesta), /lo tomamos como catalogo|pagos|solicitudes/);

      const servicios = await run('Servicios');
      assert.equal(servicios.ncie.plannerAuthorityDecision.responsePlanType, 'catalog_listing');
      assert.equal(servicios.ncie.plannerAuthorityDecision.selectedService, null);
      assert.doesNotMatch(normalize(servicios.respuesta), /lo tomamos como catalogo|pagos|solicitudes/);

      const atraer = await run('Atraer clientes');
      assert.equal(atraer.ncie.plannerAuthorityDecision.responsePlanType, 'consultative_diagnosis');
      assert.equal(atraer.ncie.plannerAuthorityDecision.selectedService, null);
      const internet = await run('Solo por internet');
      assert.equal(internet.ncie.plannerAuthorityDecision.retrievalNeeded, false);
      assert.equal(internet.ncie.plannerAuthorityDecision.selectedService, null);
      assert.doesNotMatch(normalize(internet.respuesta), /identidad e imagen corporativa|logotipo|marketing digital si puede ser/);

      const precios = await run('Necesito precios');
      assert.notEqual(precios.ncie.responsePlan.type, 'service_explanation');
      assert.doesNotMatch(normalize(precios.respuesta), /identidad e imagen corporativa|logotipo|marketing digital si puede ser/);
    } finally {
      delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
      delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
    }
  });

  it('enforces final commercial advisor mode for open, catalog, price and marketing messages', async () => {
    process.env.NCIE_CONVERSATION_PLANNER_ENABLED = 'true';
    process.env.NCIE_CONVERSATION_PLANNER_SHADOW = 'false';
    try {
      const mcpClient = buildMcpClient();
      const contextStore = buildPersistentContextStore();
      const run = (message) => runConversationEngine({
        empresaId: 1,
        phone: '5215557770000',
        message,
        whatsappChatId: '5215557770000@c.us',
        contactName: 'Final QA',
        mcpClient,
        contextStore
      });
      const countServiceSearches = () => mcpClient.calls.filter((call) => call.toolName === 'buscar_servicios').length;

      let before = countServiceSearches();
      const noSe = await run('No se que necesito');
      assert.equal(countServiceSearches(), before);
      assert.equal(noSe.ncie.plannerAuthorityDecision.responsePlanType, 'consultative_diagnosis');
      assert.equal(noSe.ncie.plannerAuthorityDecision.retrievalNeeded, false);
      assert.equal(noSe.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(noSe.respuesta), /tipo de negocio|atraer clientes|vender mas|promocionar algo/);
      assert.doesNotMatch(normalize(noSe.respuesta), /tarjetas digitales|si puede ser una buena opcion/);

      before = countServiceSearches();
      const recomienda = await run('Que me recomiendas');
      assert.equal(countServiceSearches(), before);
      assert.equal(recomienda.ncie.plannerAuthorityDecision.selectedService, null);
      assert.equal(recomienda.ncie.responsePlan.type, 'consultative_diagnosis');

      const catalogo = await run('Cual es tu catalogo?');
      assert.equal(catalogo.ncie.plannerAuthorityDecision.responsePlanType, 'catalog_listing');
      assert.equal(catalogo.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(catalogo.respuesta), /servicios que manejamos|cual te gustaria cotizar/);
      assert.doesNotMatch(normalize(catalogo.respuesta), /lo tomamos como catalogo|pagos|solicitudes/);

      const servicios = await run('Servicios');
      assert.equal(servicios.ncie.plannerAuthorityDecision.responsePlanType, 'catalog_listing');
      assert.equal(servicios.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(servicios.respuesta), /servicios que manejamos|cual te gustaria cotizar/);
      assert.doesNotMatch(normalize(servicios.respuesta), /lo tomamos como catalogo/);

      before = countServiceSearches();
      const precios = await run('Necesito precios');
      assert.equal(countServiceSearches(), before);
      assert.equal(precios.ncie.plannerAuthorityDecision.responsePlanType, 'generic_price_question');
      assert.equal(precios.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(precios.respuesta), /que quieres cotizar|lona|tarjetas|pagina web|marketing digital/);
      assert.doesNotMatch(normalize(precios.respuesta), /identidad e imagen corporativa|se cotiza segun el caso|que detalle/);

      const atraer = await run('Quiero atraer clientes');
      assert.equal(atraer.ncie.plannerAuthorityDecision.responsePlanType, 'consultative_diagnosis');
      assert.equal(atraer.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(atraer.respuesta), /tipo de negocio|local fisico|internet|atraer clientes/);

      await run('Tengo una papeleria');
      const atraerPapeleria = await run('Quiero atraer clientes');
      assert.equal(atraerPapeleria.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(atraerPapeleria.respuesta), /papeleria|opciones fisicas|opciones digitales/);
      assert.doesNotMatch(normalize(atraerPapeleria.respuesta), /si puede ser una buena opcion/);

      const lona = await run('Me interesa una lona');
      assert.equal(lona.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(lona.ncie.plannerAuthorityDecision.responsePlanType, 'ask_measurements');
      assert.match(normalize(lona.respuesta), /medidas/);

      const marketing = await run('Me interesa marketing digital');
      assert.equal(marketing.ncie.plannerAuthorityDecision.selectedService.nombre, 'Marketing digital');
      const presencia = await run('Presencia en redes');
      assert.equal(presencia.ncie.plannerAuthorityDecision.responsePlanType, 'marketing_goal_followup');
      assert.equal(presencia.ncie.plannerAuthorityDecision.detectedMarketingGoal, 'mejorar_presencia_redes');
      assert.equal(presencia.ncie.plannerAuthorityDecision.activeFlow.entities.marketingGoal, 'mejorar_presencia_redes');
      assert.match(normalize(presencia.respuesta), /mejorar tu presencia en redes|whatsapp|pagina web|redes/);
      assert.doesNotMatch(normalize(presencia.respuesta), /que quieres lograr primero: atraer clientes, vender mas o mejorar tu presencia en redes/);

      const volver = await run('Continuemos con la lona');
      assert.equal(volver.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.match(normalize(volver.respuesta), /impresion de lona/);
    } finally {
      delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
      delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
    }
  });

  it('responds with empathy when customer says it was not understood', async () => {
    const { result } = await runCase('no entendiste');

    assert.equal(result.intencion, 'ACLARACION_CLIENTE');
    assert.equal(result.tipo, 'support');
    assert.equal(result.parametros.problem, 'cliente confundido o frustrado');
    assert.equal(result.ncie.responsePlan.type, 'repair');
    assert.match(normalize(result.respuesta), /tienes razon/i);
    assertNoFalseNegative(result.respuesta);
  });

  it('lists services when customer asks what services are available', async () => {
    const { result, mcpClient } = await runCase('Que servicios tienes');

    assert.equal(result.intencion, 'LISTAR_SERVICIOS');
    assert.equal(result.tipo, 'service');
    assert.equal(result.ncie.decision.action, 'answer_with_results');
    assert.equal(result.ncie.responsePlan.type, 'catalog_listing');
    assert.match(normalize(result.respuesta), /claro, estos son los servicios que manejamos/);
    assert.match(normalize(result.respuesta), /impresion de lona|tarjetas digitales laminado mate 100 pzs/i);
    assert.match(normalize(result.respuesta), /cual te gustaria cotizar/);
    assert.doesNotMatch(normalize(result.respuesta), /cual se parece/);
    assertNoFalseNegative(result.respuesta);
    assert.ok(result.ncie.responsePlan.services.length > 5);
  });

  it('lists products when customer asks if products are handled', async () => {
    const { result, mcpClient } = await runCase('Manejas productos');

    assert.equal(result.intencion, 'LISTAR_PRODUCTOS');
    assert.equal(result.tipo, 'product');
    assert.equal(result.ncie.decision.action, 'answer_with_results');
    assert.equal(result.ncie.responsePlan.type, 'catalog_listing');
    assert.match(normalize(result.respuesta), /productos que manejamos|silla economica/i);
    assert.doesNotMatch(normalize(result.respuesta), /servicio exacto/);
    assertNoFalseNegative(result.respuesta);
  });

  it('lists the complete tenant catalog for required catalog phrases', async () => {
    const phrases = [
      'servicios',
      'catalogo',
      'todos los servicios',
      'me das informes de sus servicios'
    ];

    for (const phrase of phrases) {
      const { result } = await runCase(phrase);
      assert.ok(['LISTAR_SERVICIOS', 'LISTAR_CATALOGO'].includes(result.intencion), phrase);
      assert.equal(result.ncie.responsePlan.type, 'catalog_listing', phrase);
      assert.equal(result.ncie.responsePlan.services.length, services.length, phrase);
      assert.match(normalize(result.respuesta), /servicios(?: y productos)? que manejamos/, phrase);
      assert.match(normalize(result.respuesta), /impresion de lona/, phrase);
      assert.match(normalize(result.respuesta), /marketing digital/, phrase);
      assert.match(normalize(result.respuesta), /cual te gustaria cotizar/, phrase);
      assert.doesNotMatch(normalize(result.respuesta), /trabajamos principalmente|si puede ser una buena opcion/, phrase);
    }
  });

  it('starts a quote when customer replies with a catalog number', async () => {
    process.env.NCIE_CONVERSATION_PLANNER_ENABLED = 'true';
    process.env.NCIE_CONVERSATION_PLANNER_SHADOW = 'false';
    try {
      const mcpClient = buildMcpClient();
      const contextStore = buildPersistentContextStore();
      const run = (message) => runConversationEngine({
        empresaId: 1,
        phone: '5215550000000',
        message,
        whatsappChatId: '5215550000000@c.us',
        contactName: 'Cliente',
        mcpClient,
        contextStore
      });

      const catalog = await run('Que servicios tienen');
      assert.equal(catalog.ncie.responsePlan.type, 'catalog_listing');
      assert.equal(contextStore.saved.at(-1).datos.ncie.planner_state.currentStage, 'viendo_catalogo');
      assert.equal(contextStore.saved.at(-1).datos.ncie.planner_state.waitingField, 'catalog_selection');

      const selectedIndex = catalog.ncie.responsePlan.services.findIndex((service) => service.nombre === 'Impresion de lona') + 1;
      assert.ok(selectedIndex > 0);
      const quote = await run(String(selectedIndex));
      assert.equal(quote.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(quote.ncie.responsePlan.type, 'service_explanation');
      assert.match(normalize(quote.respuesta), /impresion de lona|medidas/);
    } finally {
      delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
      delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
    }
  });

  it('does not select anything when customer says yes after catalog', async () => {
    process.env.NCIE_CONVERSATION_PLANNER_ENABLED = 'true';
    process.env.NCIE_CONVERSATION_PLANNER_SHADOW = 'false';
    try {
      const mcpClient = buildMcpClient();
      const contextStore = buildPersistentContextStore();
      const run = (message) => runConversationEngine({
        empresaId: 1,
        phone: '5215550000000',
        message,
        whatsappChatId: '5215550000000@c.us',
        contactName: 'Cliente',
        mcpClient,
        contextStore
      });

      await run('catalogo');
      const yes = await run('si');
      assert.equal(yes.ncie.plannerAuthorityDecision.responsePlanType, 'clarify_pending_options');
      assert.equal(yes.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(yes.respuesta), /dime cual servicio te interesa cotizar|cual opcion prefieres/);
    } finally {
      delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
      delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
    }
  });

  it('groups a large service catalog by category', async () => {
    const { result } = await runCase('todos los servicios');
    assert.equal(result.ncie.responsePlan.type, 'catalog_listing');
    assert.match(result.respuesta, /Impresion\n\d+\. Impresion de lona/);
    assert.match(result.respuesta, /Marketing\n\d+\. Marketing digital/);
  });

  it('handles an empty service catalog without inventing services', async () => {
    const { result } = await runCase('que servicios tienen', null, { serviceCatalog: [], productCatalog: [] });
    assert.equal(result.ncie.responsePlan.type, 'catalog_listing');
    assert.equal(result.ncie.responsePlan.services.length, 0);
    assert.match(normalize(result.respuesta), /no tengo servicios ni productos activos/);
    assert.doesNotMatch(normalize(result.respuesta), /impresion de lona|vinil|dtf|tarjetas/);
  });

  it('understands website quote as a service request', async () => {
    const { result } = await runCase('Quiero una pagina web aqui puedo cotizarla');

    assert.equal(result.intencion, 'CONSULTAR_PRECIO');
    assert.equal(result.tipo, 'service');
    assert.equal(result.parametros.problem, 'pagina_web');
    assert.equal(result.ncie.decision.selectedType, 'service');
    assert.notEqual(result.ncie.decision.action, 'escalate_human');
    assert.match(normalize(result.respuesta), /pagina informativa|catalogo|pedidos|cotizaciones/);
    assertNoFalseNegative(result.respuesta);
  });

  it('answers exact service like a commercial advisor instead of a random list', async () => {
    const { result } = await runCase('Tienen lonas');

    assert.equal(result.ncie.commercialReasoning.conversation_goal, 'find_solution');
    assert.equal(result.ncie.responsePlan.type, 'service_explanation');
    assert.match(normalize(result.respuesta), /impresion de lona/);
    assert.match(normalize(result.respuesta), /390|m2|medidas/);
    assert.doesNotMatch(normalize(result.respuesta), /encontre estas opciones/);
    assert.doesNotMatch(normalize(result.respuesta), /cual se parece/);
  });

  it('turns low-signal general information into a business summary', async () => {
    const { result } = await runCase('quiero informes');

    assert.equal(result.ncie.responsePlan.type, 'business_summary');
    assert.match(normalize(result.respuesta), /manejamos soluciones|impresion|marketing/);
    assert.doesNotMatch(normalize(result.respuesta), /encontre estas opciones/);
    assertNoFalseNegative(result.respuesta);
  });

  it('continues quote flow from commercial memory instead of searching again', async () => {
    const { result, mcpClient } = await runCase('me ayudas a cotizar', {
      ultima_intencion: 'BUSCAR_SERVICIO',
      ultimo_producto_id: null,
      ultimo_servicio_id: 7,
      ultimo_texto_busqueda: 'Impresion de lona',
      datos_json: {
        servicio: services[6],
        ncie: {
          objetivo_cliente: 'find_solution',
          ultimo_dominio: 'Impresion',
          ultimo_servicio: 'Impresion de lona',
          need_summary: 'Impresion de lona'
        }
      }
    });

    assert.equal(result.ncie.commercialReasoning.recommended_action, 'use_memory');
    assert.equal(result.ncie.responsePlan.type, 'quote_from_memory');
    assert.match(normalize(result.respuesta), /retomamos impresion de lona/);
    assert.doesNotMatch(normalize(result.respuesta), /encontre estas opciones/);
    assert.equal(mcpClient.calls.some((call) => call.toolName === 'buscar_servicios'), false);
  });

  it('keeps active commercial memory through a real NCIE flow', async () => {
    const mcpClient = buildMcpClient();
    const contextStore = buildPersistentContextStore();
    const run = (message) => runConversationEngine({
      empresaId: 1,
      phone: '5215550000000',
      message,
      whatsappChatId: '5215550000000@c.us',
      contactName: 'Cliente',
      mcpClient,
      contextStore
    });

    const informes = await run('Quiero informes');
    assert.equal(informes.ncie.responsePlan.type, 'business_summary');
    assert.ok(informes.ncie.responsePlan.families.length > 5);
    assert.doesNotMatch(normalize(informes.respuesta), /encontre estas opciones|cual se parece/);

    const servicios = await run('Que servicios tienen');
    assert.equal(servicios.ncie.responsePlan.type, 'catalog_listing');
    assert.ok(servicios.ncie.responsePlan.services.length > 5);
    assert.doesNotMatch(normalize(servicios.respuesta), /encontre estas opciones|cual se parece/);

    const anuncio = await run('Quiero anunciar mi negocio');
    assert.equal(anuncio.ncie.responsePlan.type, 'clarify_need');
    assert.match(normalize(anuncio.respuesta), /varias formas|local fisico|internet/);
    assert.doesNotMatch(normalize(anuncio.respuesta), /tarjetas digitales laminado mate 100 pzs.*instalacion.*marketing digital/);

    const lona = await run('Me interesa una lona');
    assert.equal(lona.ncie.responsePlan.type, 'service_explanation');
    assert.equal(lona.ncie.responsePlan.selected.nombre, 'Impresion de lona');
    assert.match(normalize(lona.respuesta), /impresion de lona/);
    assert.match(normalize(lona.respuesta), /medidas/);
    assert.doesNotMatch(normalize(lona.respuesta), /vinil microperforado/);
    assert.doesNotMatch(normalize(lona.respuesta), /pagina informativa|landing|tienda en linea/);

    const cotizar = await run('Me ayudas a cotizar');
    assert.equal(cotizar.ncie.responsePlan.type, 'quote_from_memory');
    assert.equal(cotizar.ncie.responsePlan.selected.nombre, 'Impresion de lona');
    assert.match(normalize(cotizar.respuesta), /medidas/);
    assert.doesNotMatch(normalize(cotizar.respuesta), /pagina informativa|landing|tienda en linea/);

    const medidas = await run('Seria de 2x1');
    assert.equal(medidas.ncie.responsePlan.type, 'quote_estimate');
    assert.equal(medidas.ncie.responsePlan.selected.nombre, 'Impresion de lona');
    assert.equal(medidas.ncie.responsePlan.dimensions.area, 2);
    assert.equal(medidas.ncie.responsePlan.total, 780);
    assert.match(normalize(medidas.respuesta), /780|2 m2/);
    assert.doesNotMatch(normalize(medidas.respuesta), /encontre estas opciones|cual se parece|pagina informativa|landing/);

    const confirmaDiseno = await run('Si');
    assert.equal(confirmaDiseno.ncie.responsePlan.type, 'quote_design_followup');
    assert.equal(confirmaDiseno.ncie.responsePlan.selected.nombre, 'Impresion de lona');
    assert.match(normalize(confirmaDiseno.respuesta), /diseno|780|2x1/);
    assert.doesNotMatch(normalize(confirmaDiseno.respuesta), /que medidas necesitas|manejamos soluciones|que te gustaria cotizar/);

    const apoyoDiseno = await run('Me podrian apoyar con el diseno');
    assert.equal(apoyoDiseno.ncie.responsePlan.type, 'quote_design_followup');
    assert.equal(apoyoDiseno.ncie.responsePlan.selected.nombre, 'Impresion de lona');
    assert.match(normalize(apoyoDiseno.respuesta), /apoyarte con el diseno|cotizacion/);
    assert.doesNotMatch(normalize(apoyoDiseno.respuesta), /manejamos soluciones|que te gustaria cotizar/);

    const web = await run('Tambien hacen pagina web?');
    assert.equal(web.ncie.responsePlan.type, 'service_explanation');
    assert.match(normalize(web.respuesta), /pagina informativa|catalogo|pedidos|cotizaciones/);
    assert.doesNotMatch(normalize(web.respuesta), /impresion de lona de 2x1/);

    const mas = await run('Son los unicos servicios?');
    assert.equal(mas.ncie.responsePlan.type, 'catalog_listing');
    assert.ok(mas.ncie.responsePlan.services.length > 5);
    assert.doesNotMatch(normalize(mas.respuesta), /no contamos|servicio exacto|encontre estas opciones|cual se parece/);

    const lastSave = contextStore.saved.at(-1);
    assert.equal(lastSave.datos.ncie.active_service_name, null);
    assert.equal(lastSave.datos.ncie.planner_state?.currentStage, 'viendo_catalogo');
    assert.equal(lastSave.datos.ncie.planner_state?.waitingField, 'catalog_selection');
    assert.equal(lastSave.datos.ncie.last_options_shown.length > 5, true);
    assert.equal(
      contextStore.saved.some((save) => save.datos.ncie.active_service_name === 'Vinil microperforado'),
      false
    );
  });

  it('runs Commercial Conversation Planner in shadow without changing NCIE response', async () => {
    process.env.NCIE_CONVERSATION_PLANNER_ENABLED = 'true';
    process.env.NCIE_CONVERSATION_PLANNER_SHADOW = 'true';
    try {
      const { result } = await runCase('Me gustaria una lona');

      assert.equal(result.ncie.responsePlan.type, 'service_explanation');
      assert.equal(result.ncie.plannerShadowDecision.goal, 'cotizar');
      assert.equal(result.ncie.plannerShadowDecision.selectedService.nombre, 'Impresion de lona');
      assert.deepEqual(result.ncie.plannerShadowDecision.missing, ['medidas']);
      assert.equal(result.ncie.plannerShadowDecision.responsePlanType, 'ask_measurements');
    } finally {
      delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
      delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
    }
  });

  it('handles neutral messages without using the active flow as the answer', async () => {
    process.env.NCIE_CONVERSATION_PLANNER_ENABLED = 'true';
    process.env.NCIE_CONVERSATION_PLANNER_SHADOW = 'false';
    try {
      const activeContext = (plannerState, service = null) => ({
        ultima_intencion: 'BUSCAR_SERVICIO',
        ultimo_producto_id: null,
        ultimo_servicio_id: service?.id ?? null,
        ultimo_texto_busqueda: service?.nombre ?? null,
        datos_json: {
          servicio: service,
          ncie: {
            active_service_id: service?.id ?? null,
            active_service_name: service?.nombre ?? null,
            active_domain: service?.categoria ?? null,
            planner_state: plannerState
          }
        }
      });

      const marketingState = {
        version: 2,
        empresaId: 1,
        conversationId: 'chat-1',
        activeFlowId: 'flow_service_6',
        lastBotQuestion: 'Que objetivo quieres lograr con marketing digital?',
        flows: [{
          id: 'flow_service_6',
          goal: 'cotizar',
          stage: 'recolectando_requisitos',
          selectedServiceId: 6,
          selectedServiceName: 'Marketing digital',
          selectedCategory: 'Marketing',
          entities: {},
          missing: [],
          status: 'active'
        }]
      };
      const saludo = await runCase('Hola', activeContext(marketingState, services[5]));
      assert.equal(saludo.result.ncie.responsePlan.type, 'neutral_greeting');
      assert.match(normalize(saludo.result.respuesta), /hola|puedo ayudarte|cotizaciones|recomendaciones/);
      assert.doesNotMatch(normalize(saludo.result.respuesta), /manejamos marketing digital|costo: se cotiza/);

      const saludoConfigurado = await runCase('Hola', null, {
        company: {
          mensaje_bienvenida: 'Hola, gracias por escribir a DDS Media. Te ayudamos con diseno, impresion y publicidad.'
        }
      });
      assert.equal(saludoConfigurado.result.ncie.responsePlan.type, 'neutral_greeting');
      assert.equal(
        saludoConfigurado.result.respuesta,
        'Hola, gracias por escribir a DDS Media. Te ayudamos con diseno, impresion y publicidad.'
      );
      assert.doesNotMatch(normalize(saludoConfigurado.result.respuesta), /buenas tardes|cotizaciones o recomendaciones/);

      const lonaState = {
        version: 2,
        empresaId: 1,
        conversationId: 'chat-1',
        activeFlowId: 'flow_service_7',
        lastBotQuestion: 'Que medidas necesitas?',
        flows: [{
          id: 'flow_service_7',
          goal: 'cotizar',
          stage: 'esperando_medidas',
          selectedServiceId: 7,
          selectedServiceName: 'Impresion de lona',
          selectedCategory: 'Impresion',
          servicePriceType: 'POR_M2',
          servicePrice: 390,
          requiresMeasurements: true,
          entities: {},
          missing: ['medidas'],
          lastQuestion: 'Que medidas necesitas?',
          status: 'active'
        }]
      };
      const gracias = await runCase('Gracias', activeContext(lonaState, services[6]));
      assert.equal(gracias.result.ncie.responsePlan.type, 'neutral_thanks');
      assert.match(normalize(gracias.result.respuesta), /a la orden/);
      assert.doesNotMatch(normalize(gracias.result.respuesta), /780|que medidas necesitas|manejamos impresion de lona/);

      const medida = await runCase('2x1', activeContext(lonaState, services[6]));
      assert.equal(medida.result.ncie.responsePlan.type, 'quote_estimate');
      assert.equal(medida.result.ncie.plannerAuthorityDecision.detectedDimensions.area, 2);

      const webState = {
        version: 2,
        empresaId: 1,
        conversationId: 'chat-1',
        activeFlowId: 'flow_service_6',
        lastBotQuestion: 'Sera una pagina informativa, catalogo o para pedidos?',
        flows: [{
          id: 'flow_service_6',
          goal: 'cotizar',
          stage: 'esperando_tipo_web',
          selectedServiceId: 6,
          selectedServiceName: 'Diseno web',
          selectedCategory: 'Marketing',
          entities: {},
          missing: ['tipo_web'],
          lastQuestion: 'Sera una pagina informativa, catalogo o para pedidos?',
          status: 'active'
        }]
      };
      const ping = await runCase('?', activeContext(webState, { ...services[5], nombre: 'Diseno web' }));
      assert.equal(ping.result.ncie.responsePlan.type, 'neutral_resume');
      assert.match(normalize(ping.result.respuesta), /sigo por aqui|estabamos revisando diseno web|continuar/);
      assert.doesNotMatch(normalize(ping.result.respuesta), /costo: se cotiza|pagina informativa, catalogo o para recibir pedidos/);

      const catalogo = await runCase('Para catalogo', activeContext(webState, { ...services[5], nombre: 'Diseno web' }));
      assert.equal(catalogo.result.ncie.plannerAuthorityDecision.detectedWebType, 'catalogo');
      assert.match(normalize(catalogo.result.respuesta), /lo tomamos como catalogo/);
    } finally {
      delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
      delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
    }
  });

  it('lets Commercial Conversation Planner control the real NCIE flow with topic changes', async () => {
    process.env.NCIE_CONVERSATION_PLANNER_ENABLED = 'true';
    process.env.NCIE_CONVERSATION_PLANNER_SHADOW = 'false';
    try {
      const mcpClient = buildMcpClient();
      const contextStore = buildPersistentContextStore();
      const run = (message) => runConversationEngine({
        empresaId: 1,
        phone: '5215550000000',
        message,
        whatsappChatId: '5215550000000@c.us',
        contactName: 'Cliente',
        mcpClient,
        contextStore
      });
      const countCalls = (toolName) => mcpClient.calls.filter((call) => call.toolName === toolName).length;

      const informes = await run('Quiero informes');
      assert.equal(informes.ncie.plannerAuthorityDecision.responsePlanType, 'business_summary');
      assert.match(normalize(informes.respuesta), /manejamos soluciones|impresion/);

      const lona = await run('Me gustaria una lona');
      assert.equal(lona.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(lona.ncie.plannerAuthorityDecision.responsePlanType, 'ask_measurements');
      assert.match(normalize(lona.respuesta), /impresion de lona/);
      assert.match(normalize(lona.respuesta), /medidas/);
      assert.doesNotMatch(normalize(lona.respuesta), /diseno web/);

      const cotizar = await run('Me ayudas a cotizar');
      assert.equal(cotizar.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.match(normalize(cotizar.respuesta), /medidas/);
      assert.doesNotMatch(normalize(cotizar.respuesta), /manejamos soluciones|pagina informativa/);

      const medidas = await run('Seria de 2x1');
      assert.equal(medidas.ncie.responsePlan.type, 'quote_estimate');
      assert.equal(medidas.ncie.responsePlan.selected.nombre, 'Impresion de lona');
      assert.match(normalize(medidas.respuesta), /780|2 m2/);
      assert.doesNotMatch(normalize(medidas.respuesta), /manejamos soluciones|pagina informativa/);

      const diseno = await run('Si');
      assert.equal(diseno.ncie.responsePlan.type, 'quote_requirements_followup');
      assert.equal(diseno.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(diseno.ncie.plannerAuthorityDecision.detectedDesignPreference, true);
      assert.equal(diseno.ncie.advisorNotificationRequired, false);
      assert.match(normalize(diseno.respuesta), /diseno|780|2x1|instalacion: no incluida/);
      assert.doesNotMatch(normalize(diseno.respuesta), /avancemos tambien con instalacion/);
      assert.doesNotMatch(normalize(diseno.respuesta), /que medidas necesitas|manejamos soluciones/);

      const nuevaLona = await run('Me interesa una lona');
      assert.equal(nuevaLona.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(nuevaLona.ncie.plannerAuthorityDecision.responsePlanType, 'ask_measurements');
      assert.equal(nuevaLona.ncie.plannerAuthorityDecision.activeFlow.entities?.dimensions, undefined);
      assert.match(normalize(nuevaLona.respuesta), /medidas/);
      assert.doesNotMatch(normalize(nuevaLona.respuesta), /780|2x1/);

      const disenoSinMedidas = await run('Con diseno');
      assert.equal(disenoSinMedidas.ncie.responsePlan.type, 'service_explanation');
      assert.equal(disenoSinMedidas.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(disenoSinMedidas.ncie.plannerAuthorityDecision.detectedDesignPreference, true);
      assert.deepEqual(disenoSinMedidas.ncie.plannerAuthorityDecision.missing, ['medidas']);
      assert.match(normalize(disenoSinMedidas.respuesta), /medidas/);
      assert.doesNotMatch(normalize(disenoSinMedidas.respuesta), /780|2x1|podemos apoyarte con el diseno/);

      const nuevasMedidas = await run('2x1');
      assert.equal(nuevasMedidas.ncie.responsePlan.type, 'quote_estimate');

      const yaTengoDiseno = await run('Ya tengo diseño');
      assert.equal(yaTengoDiseno.ncie.responsePlan.type, 'quote_requirements_followup');
      assert.equal(yaTengoDiseno.ncie.plannerAuthorityDecision.detectedDesignPreference, false);
      assert.match(normalize(yaTengoDiseno.respuesta), /ya lo tienes|instalacion: no incluida/);
      assert.doesNotMatch(normalize(yaTengoDiseno.respuesta), /avancemos tambien con instalacion|podemos apoyarte con el diseno|lo dejamos contemplado junto/);

      const instalacion = await run('Sin instalacion');
      assert.equal(instalacion.ncie.responsePlan.type, 'quote_requirements_followup');
      assert.equal(instalacion.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(instalacion.ncie.responsePlan.installation, false);
      assert.match(normalize(instalacion.respuesta), /sin instalacion|780|2x1/);
      assert.doesNotMatch(normalize(instalacion.respuesta), /manejamos instalacion|costo: se cotiza/);

      const web = await run('Tambien hacen pagina web?');
      assert.match(normalize(web.respuesta), /pagina informativa|catalogo|pedidos|cotizaciones/);
      assert.doesNotMatch(normalize(web.respuesta), /impresion de lona de 2x1/);

      const pedidos = await run('Para recibir pedidos');
      assert.equal(pedidos.ncie.plannerAuthorityDecision.detectedWebType, 'pedidos');
      assert.match(normalize(pedidos.respuesta), /recibir pedidos|pagos|solicitudes/);
      assert.doesNotMatch(normalize(pedidos.respuesta), /sera una pagina informativa, catalogo o para recibir pedidos/);

      const webCatalogo = await run('Tambien hacen pagina web?');
      assert.match(normalize(webCatalogo.respuesta), /pagina informativa|catalogo|pedidos|cotizaciones/);
      const catalogoWeb = await run('Para catalogo');
      assert.equal(catalogoWeb.ncie.plannerAuthorityDecision.detectedWebType, 'catalogo');
      assert.match(normalize(catalogoWeb.respuesta), /lo tomamos como catalogo/);
      assert.doesNotMatch(normalize(catalogoWeb.respuesta), /lo tomamos como pagina para recibir pedidos/);

      const tambienMarketing = await run('Tambien marketing digital');
      assert.equal(tambienMarketing.ncie.plannerAuthorityDecision.selectedService.nombre, 'Marketing digital');
      assert.doesNotMatch(normalize(tambienMarketing.respuesta), /diseno web|pagina informativa|pedidos/);

      const volver = await run('Continuemos con la lona');
      assert.equal(volver.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.match(normalize(volver.respuesta), /impresion de lona/);
      assert.doesNotMatch(normalize(volver.respuesta), /precio por confirmar|total por confirmar/);
      assert.doesNotMatch(normalize(volver.respuesta), /manejamos soluciones/);

      const marketing = await run('Me interesa marketing digital');
      assert.equal(marketing.ncie.plannerAuthorityDecision.selectedService.nombre, 'Marketing digital');
      assert.equal(marketing.ncie.plannerAuthorityDecision.explicitTopicChange, true);
      assert.doesNotMatch(normalize(marketing.respuesta), /impresion de lona de 2x1|780|390/);
      const marketingFlow = marketing.ncie.plannerAuthorityDecision.activeFlow;
      assert.equal(marketingFlow.selectedServiceName, 'Marketing digital');
      assert.equal(marketingFlow.entities?.dimensions, undefined);
      assert.equal(marketingFlow.entities?.design, undefined);
      assert.equal(marketingFlow.entities?.installation, undefined);

      const sinInstalacionMarketing = await run('Sin instalacion');
      assert.equal(sinInstalacionMarketing.ncie.plannerAuthorityDecision.selectedService.nombre, 'Marketing digital');
      assert.equal(sinInstalacionMarketing.ncie.plannerAuthorityDecision.activeFlow.selectedServiceName, 'Marketing digital');
      assert.equal(sinInstalacionMarketing.ncie.plannerAuthorityDecision.detectedInstallationPreference, undefined);
      assert.equal(sinInstalacionMarketing.ncie.plannerAuthorityDecision.activeFlow.entities?.installation, undefined);
      assert.match(normalize(sinInstalacionMarketing.respuesta), /objetivo|marketing digital|atraer clientes|presencia en redes/);
      assert.doesNotMatch(normalize(sinInstalacionMarketing.respuesta), /impresion de lona|seguimos con.*lona|sin instalacion por ahora|dejamos contemplada la instalacion/);

      const saludo = await run('Hola');
      assert.equal(saludo.ncie.plannerAuthorityDecision.selectedService, null);
      assert.equal(saludo.ncie.responsePlan.type, 'neutral_greeting');
      assert.match(normalize(saludo.respuesta), /hola|puedo ayudarte|cotizaciones|recomendaciones/);
      assert.doesNotMatch(normalize(saludo.respuesta), /manejamos marketing digital|costo: se cotiza|objetivo quieres lograr con marketing digital/);

      const catalogo = await run('Que servicios tienen');
      assert.equal(catalogo.ncie.plannerAuthorityDecision.responsePlanType, 'catalog_listing');
      assert.equal(catalogo.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(catalogo.respuesta), /servicios que manejamos|marketing digital|impresion de lona/);
      assert.doesNotMatch(normalize(catalogo.respuesta), /seguimos con marketing digital|impresion de lona de 2x1/);

      const volverDespuesCatalogo = await run('Continuemos con la lona');
      assert.equal(volverDespuesCatalogo.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(volverDespuesCatalogo.ncie.plannerAuthorityDecision.responsePlanType, 'resume_flow');
      assert.match(normalize(volverDespuesCatalogo.respuesta), /impresion de lona/);
      assert.doesNotMatch(normalize(volverDespuesCatalogo.respuesta), /precio por confirmar|total por confirmar/);

      const anunciar = await run('Quiero anunciar mi negocio');
      assert.equal(anunciar.ncie.plannerAuthorityDecision.responsePlanType, 'consultative_diagnosis');
      assert.equal(anunciar.ncie.plannerAuthorityDecision.retrievalNeeded, false);
      assert.equal(anunciar.ncie.plannerAuthorityDecision.selectedService, null);
      assert.equal(anunciar.ncie.plannerAuthorityDecision.activeFlow, null);
      assert.equal(anunciar.ncie.responsePlan.type, 'consultative_diagnosis');
      assert.match(normalize(anunciar.respuesta), /tipo de negocio|atraer clientes|vender mas|promocionar algo especifico/);
      assert.doesNotMatch(normalize(anunciar.respuesta), /impresion de lona de 2x1|780|390/);

      const productos = await run('Manejan productos?');
      assert.equal(productos.ncie.plannerAuthorityDecision.responsePlanType, 'catalog_listing');
      assert.equal(productos.ncie.responsePlan.type, 'catalog_listing');
      assert.match(normalize(productos.respuesta), /productos que manejamos|silla economica/);
      assert.doesNotMatch(normalize(productos.respuesta), /seguimos con impresion de lona|impresion de lona de 2x1/);

      const recomienda = await run('Que me recomiendas');
      assert.equal(recomienda.ncie.plannerAuthorityDecision.responsePlanType, 'consultative_diagnosis');
      assert.equal(recomienda.ncie.plannerAuthorityDecision.retrievalNeeded, false);
      assert.equal(recomienda.ncie.plannerAuthorityDecision.selectedService, null);
      assert.equal(recomienda.ncie.responsePlan.type, 'consultative_diagnosis');
      assert.match(normalize(recomienda.respuesta), /tipo de negocio|atraer clientes|vender mas|promocionar algo especifico/);
      assert.doesNotMatch(normalize(recomienda.respuesta), /tarjetas digitales laminado mate 100 pzs/);

      const economico = await run('Me interesa algo economico');
      assert.equal(economico.ncie.responsePlan.type, 'economic_category_question');
      assert.match(normalize(economico.respuesta), /publicidad fisica, diseno o impresion/);
      assert.doesNotMatch(normalize(economico.respuesta), /tarjetas digitales laminado mate 100 pzs/);

      const beforeNoSeRetrieval = countCalls('buscar_servicios');
      const noSe = await run('No se que necesito');
      assert.equal(countCalls('buscar_servicios'), beforeNoSeRetrieval);
      assert.equal(noSe.ncie.plannerAuthorityDecision.responsePlanType, 'consultative_diagnosis');
      assert.equal(noSe.ncie.plannerAuthorityDecision.retrievalNeeded, false);
      assert.equal(noSe.ncie.plannerAuthorityDecision.selectedService, null);
      assert.equal(noSe.ncie.plannerAuthorityDecision.activeFlow, null);
      assert.equal(noSe.ncie.responsePlan.type, 'consultative_diagnosis');
      assert.match(normalize(noSe.respuesta), /tipo de negocio|atraer clientes|vender mas|promocionar algo especifico/);
      assert.doesNotMatch(normalize(noSe.respuesta), /tarjetas digitales laminado mate 100 pzs/);

      const papeleria = await run('Tengo una papeleria');
      assert.equal(papeleria.ncie.responsePlan.type, 'clarify_need');
      assert.equal(papeleria.ncie.responsePlan.businessContext, 'papeleria');
      assert.match(normalize(papeleria.respuesta), /mejor referencia|atraer mas clientes|mejorar tu imagen|vender mas/);

      const atraer = await run('Quiero atraer clientes');
      assert.equal(atraer.ncie.plannerAuthorityDecision.responsePlanType, 'consultative_diagnosis');
      assert.equal(atraer.ncie.plannerAuthorityDecision.retrievalNeeded, false);
      assert.equal(atraer.ncie.plannerAuthorityDecision.selectedService, null);
      assert.equal(atraer.ncie.responsePlan.type, 'consultative_diagnosis');
      assert.match(normalize(atraer.respuesta), /papeleria|opciones fisicas|lonas|banners|viniles|opciones digitales|economico|estrategia/);
      assert.doesNotMatch(normalize(atraer.respuesta), /tarjetas digitales laminado mate 100 pzs si puede ser una buena opcion/);

      const presupuesto = await run('No tengo mucho presupuesto');
      assert.equal(presupuesto.ncie.responsePlan.type, 'economic_category_question');
      assert.match(normalize(presupuesto.respuesta), /presupuesto limitado|papeleria|publicidad fisica/);

      assert.equal(
        contextStore.saved.some((save) => save.datos.ncie.planner_state?.flows?.length >= 2),
        true
      );
    } finally {
      delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
      delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
    }
  });
});

describe('MOK production conversation hardening flows', () => {
  async function runMokFlow(messages, options = {}) {
    process.env.NCIE_CONVERSATION_PLANNER_ENABLED = 'true';
    process.env.NCIE_CONVERSATION_PLANNER_SHADOW = 'false';
    const mcpClient = buildMcpClient(options);
    const contextStore = buildPersistentContextStore();
    const results = [];
    for (const message of messages) {
      results.push(await runConversationEngine({
        empresaId: 1,
        phone: '5215559990000',
        message,
        whatsappChatId: '5215559990000@c.us',
        contactName: 'Cliente MOK',
        mcpClient,
        contextStore
      }));
    }
    delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
    delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
    return { results, contextStore, mcpClient };
  }

  it('Flow A does not repeat the same commercial objective question', async () => {
    const { results, contextStore } = await runMokFlow([
      'Hola',
      'necesito un banner',
      'Quiero un banner para promocionar mi negocio con presupuesto de $500 a $1000',
      'atraer clientes',
      'vender mas',
      'promocionar'
    ]);

    const laterResponses = results.slice(3).map((result) => normalize(result.respuesta));
    for (const response of laterResponses) {
      assert.doesNotMatch(response, /que tipo de negocio tienes y que buscas lograr: atraer clientes, vender mas, mejorar tu imagen o promocionar algo especifico/);
    }
  });

  it('Flow B keeps lona selected, parses decimal meters and keeps design in the same service', async () => {
    const { results, contextStore } = await runMokFlow([
      'que servicios tienes',
      'quiero una impresion de lona',
      '0.60 x 1.60 m',
      'tambien con el diseno'
    ]);
    const estimate = results[2];
    const design = results[3];

    assert.equal(estimate.ncie.responsePlan.type, 'quote_estimate');
    assert.equal(estimate.ncie.responsePlan.selected.nombre, 'Impresion de lona');
    assert.equal(estimate.ncie.responsePlan.dimensions.area, 0.96);
    assert.equal(estimate.ncie.responsePlan.total, 374.4);
    assert.match(normalize(estimate.respuesta), /0\.96 m2|374\.40|incluye diseno|no incluye instalacion/);
    assert.equal(design.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
    assert.equal(design.ncie.plannerAuthorityDecision.detectedDesignPreference, true);
    assert.equal(design.ncie.advisorNotificationRequired, false);
    assert.equal(design.ncie.notificationReason, null);
    assert.doesNotMatch(normalize(design.respuesta), /logotipo|marketing digital/);
  });

  it('Flow C keeps the 3x2 estimate and closes summary on solo impresion', async () => {
    const { results, contextStore } = await runMokFlow([
      'Que servicios tienen',
      'Me gustaria una impresion en lona',
      'De 3x2',
      'Ya tengo el diseno',
      'Solo impresion',
      'ok'
    ]);
    const estimate = results[2];
    const summary = results[4];
    const repeatedOk = results[5];

    assert.equal(estimate.ncie.responsePlan.selected.nombre, 'Impresion de lona');
    assert.equal(estimate.ncie.responsePlan.dimensions.area, 6);
    assert.equal(estimate.ncie.responsePlan.total, 2340);
    assert.equal(summary.ncie.responsePlan.type, 'quote_requirements_followup');
    assert.equal(summary.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
    assert.equal(summary.ncie.advisorNotificationRequired, false);
    assert.equal(summary.ncie.notificationReason, null);
    assert.equal(contextStore.saved.at(-2).datos.ncie.planner_state.waitingField, 'advisor_confirmation');
    assert.match(normalize(summary.respuesta), /lo dejamos solo como impresion|estimado: \$2,340\.00|instalacion: no incluida/);
    assert.doesNotMatch(normalize(summary.respuesta), /\$0\.00|undefined/);
    assert.equal(repeatedOk.ncie.advisorNotificationRequired, false);
  });

  it('Flow D does not offer installation when the selected service excludes it', async () => {
    const { results } = await runMokFlow([
      'Que servicios tienen',
      'Me gustaria una impresion en lona',
      'De 3x2',
      'Ya tengo el diseno',
      'Solo impresion',
      'Con instalacion'
    ]);
    const installation = results[5];

    assert.notEqual(installation.ncie.notificationReason, 'quote_ready');
    assert.doesNotMatch(normalize(installation.respuesta), /dejamos instalacion para revisar con asesor|instalacion: revisar/);
    assert.doesNotMatch(normalize(installation.respuesta), /\$0\.00|undefined/);
  });

  it('Flow D2 treats advisor confirmation as handoff, not another installation update', async () => {
    const { results } = await runMokFlow([
      'Que servicios tienen',
      'Me gustaria una impresion en lona',
      '2x1',
      'Ya tengo el diseno',
      'Sin instalacion',
      'Si'
    ]);
    const handoff = results[5];

    assert.equal(handoff.intencion, 'HABLAR_ASESOR');
    assert.equal(handoff.ncie.decision.action, 'escalate_human');
    assert.equal(handoff.ncie.notificationReason, 'handoff_explicit');
    assert.match(normalize(handoff.respuesta), /te comunico con un asesor|ya le comparti el resumen/);
    assert.doesNotMatch(normalize(handoff.respuesta), /agrego instalacion|instalacion se confirma aparte/);
  });

  it('Flow E selects impresion de lona, not marketing digital', async () => {
    const { results } = await runMokFlow(['Impresion en lona']);
    const result = results[0];

    assert.equal(result.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
    assert.notEqual(result.ncie.plannerAuthorityDecision.selectedService.nombre, 'Marketing digital');
  });

  it('Flow F activates human handoff for advisor requests', async () => {
    const { results } = await runMokFlow(['Asesor', 'Me comunicas con un asesor']);

    for (const result of results) {
      assert.equal(result.intencion, 'HABLAR_ASESOR');
      assert.equal(result.ncie.decision.action, 'escalate_human');
      assert.equal(result.ncie.advisorNotificationRequired, true);
      assert.equal(result.ncie.notificationReason, 'handoff_explicit');
      assert.match(result.ncie.notificationPayload.message, /Nueva solicitud de cliente/);
      assert.match(normalize(result.respuesta), /te comunico con un asesor|ya le comparti el resumen/);
      assert.doesNotMatch(normalize(result.respuesta), /que necesitas|que punto/);
    }
  });

  it('Flow G parses decimal dimensions with multiplication sign and keeps budget context', async () => {
    const { results } = await runMokFlow([
      'rOTULACION',
      '0.60 × 1.60 m',
      'banner',
      '2000 pesos'
    ]);
    const decimalQuote = results[1];
    const budget = results[3];

    assert.equal(decimalQuote.ncie.responsePlan.type, 'quote_estimate');
    assert.equal(decimalQuote.ncie.responsePlan.dimensions.area, 0.96);
    assert.doesNotMatch(normalize(decimalQuote.respuesta), /60 m de largo|que alto aproximado/);
    assert.match(normalize(budget.respuesta), /presupuesto aproximado de \$2,000\.00|interior, exterior o evento/);
    assert.doesNotMatch(normalize(budget.respuesta), /que necesitas lograr o que producto o servicio tienes en mente/);
  });

  it('Flow H completes partial rotulacion dimensions with height answer', async () => {
    const rotulacionCatalog = [
      {
        id: 80,
        nombre: 'Vinil de rotulacion de color',
        descripcion: 'Vinil para rotulacion de locales, aparadores y anuncios',
        precio: 400,
        tipo_precio: 'POR_M2',
        requiere_medidas: true,
        categoria: 'Rotulacion'
      }
    ];
    const { results } = await runMokFlow([
      'Rotulacion',
      '10 metros',
      '2 metros de alto'
    ], { serviceCatalog: rotulacionCatalog });
    const partial = results[1];
    const quote = results[2];

    assert.match(normalize(partial.respuesta), /tengo 10 m de largo|alto aproximado/);
    assert.equal(quote.ncie.responsePlan.type, 'quote_estimate');
    assert.equal(quote.ncie.responsePlan.dimensions.area, 20);
    assert.equal(quote.ncie.responsePlan.total, 8000);
    assert.doesNotMatch(normalize(quote.respuesta), /tengo 2 m de largo/);
  });

  it('Flow I lets concrete MOK services override consultative marketing drift', async () => {
    const reportedCatalog = [
      {
        id: 40,
        nombre: 'Marketing digital',
        descripcion: 'Redes sociales, campanas digitales y anuncios para atraer clientes',
        precio: 0,
        tipo_precio: 'COTIZACION',
        categoria: 'Marketing'
      },
      {
        id: 41,
        nombre: 'Vinil de rotulacion de color',
        descripcion: 'Vinil para rotulacion de locales, aparadores y anuncios',
        precio: 400,
        tipo_precio: 'POR_M2',
        requiere_medidas: true,
        categoria: 'Rotulacion'
      },
      {
        id: 42,
        nombre: 'Vinil impreso',
        descripcion: 'Vinil impreso para negocios, locales y anuncios fisicos',
        precio: 390,
        tipo_precio: 'POR_M2',
        requiere_medidas: true,
        categoria: 'Rotulacion'
      },
      {
        id: 43,
        nombre: 'Diseno de logotipo',
        descripcion: 'Diseno de logo e identidad para negocios',
        precio: 0,
        tipo_precio: 'COTIZACION',
        categoria: 'Diseno'
      },
      {
        id: 44,
        nombre: 'Impresion de lona',
        descripcion: 'Impresion de lona para anuncios y promocion de negocios',
        precio: 390,
        tipo_precio: 'POR_M2',
        requiere_medidas: true,
        incluye: 'Diseno',
        no_incluye: 'instalacion',
        categoria: 'Impresion'
      }
    ];

    const { results } = await runMokFlow([
      'Hola',
      'una rotulacion',
      'atraer clientes',
      'por redes',
      'un vinil impreso',
      'algo fisico',
      'diseno de logo',
      'quiero un logotipo',
      'una lona',
      'quiero una impresion de lona de cocacola',
      '1.20 x 2.40',
      'ya tengo diseno',
      'solo la impresion'
    ], { serviceCatalog: reportedCatalog });

    assert.equal(results[1].ncie.plannerAuthorityDecision.selectedService.nombre, 'Vinil de rotulacion de color');
    assert.notEqual(results[1].ncie.plannerAuthorityDecision.selectedService.nombre, 'Marketing digital');
    assert.equal(results[4].ncie.plannerAuthorityDecision.selectedService.nombre, 'Vinil impreso');
    assert.doesNotMatch(normalize(results[4].respuesta), /buscas algo fisico para tu local o algo digital/);
    assert.match(results[7].ncie.plannerAuthorityDecision.selectedService.nombre, /Logotipo|Diseno de logotipo/i);
    assert.equal(results[10].ncie.responsePlan.type, 'quote_estimate');
    assert.equal(results[10].ncie.responsePlan.selected.nombre, 'Impresion de lona');
    assert.equal(results[10].ncie.responsePlan.total, 1123.2);
    assert.equal(results[11].ncie.responsePlan.type, 'quote_requirements_followup');
    assert.equal(results[11].ncie.advisorNotificationRequired, false);
    assert.equal(results[12].ncie.responsePlan.type, 'quote_requirements_followup');
    assert.equal(results[12].ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
    assert.equal(results[12].ncie.notificationPayload, null);
    assert.doesNotMatch(normalize(results[12].respuesta), /te ayudo a ubicar la mejor opcion/);
  });

  it('Flow J keeps plain Instalacion inside the active quote instead of switching service', async () => {
    const reportedCatalog = [
      {
        id: 50,
        nombre: 'Vinil de rotulacion de color',
        descripcion: 'Vinil para rotulacion de locales, aparadores y anuncios',
        precio: 400,
        tipo_precio: 'POR_M2',
        requiere_medidas: true,
        categoria: 'Rotulacion',
        incluye: 'Depilado y transfer',
        no_incluye: 'instalacion'
      },
      {
        id: 51,
        nombre: 'Instalacion',
        descripcion: 'Instalacion de graficos, viniles y anuncios',
        precio: 0,
        tipo_precio: 'COTIZACION',
        categoria: 'Instalacion'
      },
      {
        id: 52,
        nombre: 'Diseno web',
        descripcion: 'Pagina web informativa, catalogo o pedidos',
        precio: 0,
        tipo_precio: 'COTIZACION',
        categoria: 'Diseno'
      }
    ];

    const { results } = await runMokFlow([
      'Rotulacion',
      'Una rotulacion',
      '3x2',
      'Ya tengo el diseno',
      'Instalacion'
    ], { serviceCatalog: reportedCatalog });
    const design = results[3];
    const installation = results[4];

    assert.equal(results[0].ncie.plannerAuthorityDecision.selectedService.nombre, 'Vinil de rotulacion de color');
    assert.equal(results[2].ncie.responsePlan.total, 2400);
    assert.equal(design.ncie.responsePlan.type, 'quote_requirements_followup');
    assert.equal(design.ncie.advisorNotificationRequired, false);
    assert.equal(installation.ncie.plannerAuthorityDecision.selectedService.nombre, 'Vinil de rotulacion de color');
    assert.equal(installation.ncie.plannerAuthorityDecision.detectedInstallationPreference, true);
    assert.equal(installation.ncie.notificationPayload, null);
    assert.doesNotMatch(normalize(installation.respuesta), /dejamos instalacion para revisar con asesor|instalacion: revisar/);
  });

  it('Deterministic router Flow 1 lists print options for generic impresion requests', async () => {
    const mokCatalog = [
      { id: 1, nombre: 'Tarjetas digitales laminado mate 100 pzs', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Impresion' },
      { id: 2, nombre: 'Impresion de lona', precio: 390, tipo_precio: 'POR_M2', requiere_medidas: true, categoria: 'Impresion' },
      { id: 3, nombre: 'Vinil impreso', precio: 390, tipo_precio: 'POR_M2', requiere_medidas: true, categoria: 'Impresion' }
    ];
    const { results } = await runMokFlow([
      'Hola',
      'Me interesa una impresión',
      'Quiero una impresión',
      'impresión'
    ], { serviceCatalog: mokCatalog });

    for (const result of results.slice(1)) {
      assert.equal(result.ncie.responsePlan.type, 'catalog_listing');
      assert.equal(result.ncie.responsePlan.deterministicRouter, true);
      assert.match(normalize(result.respuesta), /claro, en impresion manejamos/);
      assert.doesNotMatch(normalize(result.respuesta), /te ayudo a ubicar la mejor opcion|que necesitas lograr/);
    }
  });

  it('Deterministic router Flow 2 keeps catalog item 9 and stores quantity once', async () => {
    const mokCatalog = [
      { id: 1, nombre: 'Tarjetas digitales laminado mate 100 pzs', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Impresion' },
      { id: 2, nombre: 'Impresion de lona', precio: 390, tipo_precio: 'POR_M2', requiere_medidas: true, categoria: 'Impresion' },
      { id: 3, nombre: 'Marketing digital', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Marketing' },
      { id: 4, nombre: 'Banner arana 0.60 x 1.60 m', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Banners' },
      { id: 5, nombre: 'Banner arana 0.80 x 1.80 m', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Banners' },
      { id: 6, nombre: 'Diseno de logotipo', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Diseno' },
      { id: 7, nombre: 'Diseno web', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Diseno' },
      { id: 8, nombre: 'Identidad e imagen corporativa', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Diseno' },
      { id: 9, nombre: 'Promocionales con corte de vinil', precio: 0, tipo_precio: 'COTIZACION', requiere_cantidad: true, categoria: 'Promocionales' },
      { id: 10, nombre: 'Coroplast con vinil impreso', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Senaletica' }
    ];
    const { results, contextStore } = await runMokFlow([
      'qué servicios tienes',
      '9',
      '3',
      'quiero 3 piezas'
    ], { serviceCatalog: mokCatalog });

    assert.equal(results[1].ncie.plannerAuthorityDecision.selectedService.nombre, 'Promocionales con corte de vinil');
    assert.equal(results[2].ncie.plannerAuthorityDecision.selectedService.nombre, 'Promocionales con corte de vinil');
    assert.equal(results[2].ncie.plannerAuthorityDecision.detectedQuantity, 3);
    assert.match(normalize(results[2].respuesta), /perfecto, anoto 3 piezas/);
    assert.equal(results[3].ncie.plannerAuthorityDecision.selectedService.nombre, 'Promocionales con corte de vinil');
    assert.equal(contextStore.saved.at(-1).datos.ncie.planner_state.collectedEntities.quantity, 3);
    assert.doesNotMatch(normalize(results[3].respuesta), /cuantas piezas necesitas/);
  });

  it('Deterministic router Flow 3 keeps fuzzy promocionales service through dimensions budget and usage', async () => {
    const mokCatalog = [
      { id: 9, nombre: 'Promocionales con corte de vinil', precio: 0, tipo_precio: 'COTIZACION', requiere_cantidad: true, categoria: 'Promocionales' },
      { id: 10, nombre: 'Coroplast con vinil impreso', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Senaletica' }
    ];
    const { results, contextStore } = await runMokFlow([
      'quiero tres piezas de promcionalesd e corte de vinil',
      '30x12',
      '10000 pesos',
      'interior'
    ], { serviceCatalog: mokCatalog });

    for (const result of results) {
      assert.equal(result.ncie.plannerAuthorityDecision.selectedService.nombre, 'Promocionales con corte de vinil');
      assert.notEqual(result.ncie.plannerAuthorityDecision.selectedService.nombre, 'Coroplast con vinil impreso');
    }
    const entities = contextStore.saved.at(-1).datos.ncie.planner_state.collectedEntities;
    assert.equal(entities.quantity, 3);
    assert.equal(entities.dimensions.text, '30x12');
    assert.equal(entities.budget, 10000);
    assert.equal(entities.usageContext, 'interior');
    assert.match(normalize(results.at(-1).respuesta), /uso: interior|interior/);
  });

  it('Deterministic router Flow 4 keeps lona quote through design and solo impresion', async () => {
    const mokCatalog = [
      { id: 2, nombre: 'Impresion de lona', precio: 390, tipo_precio: 'POR_M2', requiere_medidas: true, categoria: 'Impresion', no_incluye: 'instalacion' }
    ];
    const { results } = await runMokFlow([
      'Impresión de lona',
      '1.20 x 2.40',
      'ya tengo diseño',
      'solo la impresión'
    ], { serviceCatalog: mokCatalog });

    assert.equal(results[0].ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
    assert.equal(results[1].ncie.plannerAuthorityDecision.detectedDimensions.area, 2.88);
    assert.equal(results[3].ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
    assert.match(normalize(results[3].respuesta), /resumen|instalacion: no incluida/);
    assert.doesNotMatch(normalize(results[3].respuesta), /te ayudo a ubicar la mejor opcion/);
  });

  it('Deterministic router keeps lona flow through ambiguous large dimensions, design, usage and advisor handoff', async () => {
    const mokCatalog = [
      { id: 2, nombre: 'Impresion de lona', precio: 390, tipo_precio: 'POR_M2', requiere_medidas: true, incluye: 'Diseno', categoria: 'Impresion', no_incluye: 'Instalacion' }
    ];
    const { results } = await runMokFlow([
      'me intresa una impresion de lona',
      'las medidas son 10x20',
      'son metros',
      'quiero un diseno',
      'Ya tengo un diseno',
      'atraer mas clientes',
      'exterior',
      'si, por favor'
    ], { serviceCatalog: mokCatalog });

    assert.equal(results[0].ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
    assert.match(normalize(results[1].respuesta), /10 x 20|centimetros o en metros/);
    assert.doesNotMatch(normalize(results[1].respuesta), /lasmedidasson10x20|\$78,000\.00/);
    assert.equal(results[2].ncie.responsePlan.type, 'quote_estimate');
    assert.match(normalize(results[2].respuesta), /10 x 20 m|200 m2|\$78,000\.00/);
    assert.equal(results[3].ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
    assert.doesNotMatch(normalize(results[3].respuesta), /que necesitas lograr|te ayudo a ubicar la mejor opcion/);
    assert.equal(results[4].ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
    assert.match(normalize(results[4].respuesta), /interior, exterior o evento/);
    assert.doesNotMatch(normalize(results[5].respuesta), /que necesitas lograr|te ayudo a ubicar la mejor opcion/);
    assert.match(normalize(results[6].respuesta), /servicio: impresion de lona|uso: exterior|objetivo: atraer mas clientes/);
    assert.equal(results[7].intencion, 'HABLAR_ASESOR');
    assert.equal(results[7].ncie.decision.action, 'escalate_human');
    assert.match(normalize(results[7].respuesta), /te comunico con un asesor/);
    assert.doesNotMatch(normalize(results[7].respuesta), /que necesitas lograr|te ayudo a ubicar la mejor opcion/);
  });

  it('Deterministic router lists full catalog after advisor handoff when customer asks services or informes', async () => {
    const mokCatalog = [
      { id: 1, nombre: 'Tarjetas digitales laminado mate 100 pzs', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Impresion' },
      { id: 2, nombre: 'Impresion de lona', precio: 390, tipo_precio: 'POR_M2', requiere_medidas: true, incluye: 'Diseno', categoria: 'Impresion', no_incluye: 'Instalacion' },
      { id: 3, nombre: 'Marketing digital', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Marketing' },
      { id: 4, nombre: 'Banner arana 0.60 x 1.60 m', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Banners' },
      { id: 5, nombre: 'Banner arana 0.80 x 1.80 m', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Banners' },
      { id: 6, nombre: 'Diseno de logotipo', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Diseno' },
      { id: 7, nombre: 'Vinil de rotulacion de color', precio: 400, tipo_precio: 'POR_M2', requiere_medidas: true, categoria: 'Rotulacion' }
    ];
    const { results } = await runMokFlow([
      'Me gustaria la impresion de una lona',
      'Las medidas serian 2x3',
      'Ya tengo el diseno',
      'Si por favor',
      'Me podrias pasar el catalogo de tus servicios por favor',
      'Quiero informes',
      'Me das informes de tus servicios',
      'Que servicios tienen'
    ], { serviceCatalog: mokCatalog });

    assert.equal(results[3].intencion, 'HABLAR_ASESOR');
    for (const result of results.slice(4)) {
      assert.equal(result.ncie.responsePlan.type, 'catalog_listing');
      assert.equal(result.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(result.respuesta), /claro, estos son los servicios que manejamos/);
      assert.match(normalize(result.respuesta), /impresion de lona|marketing digital|diseno de logotipo/);
      assert.doesNotMatch(normalize(result.respuesta), /diseno de logotipo si puede ser|no encontre ese servicio exacto|estos servicios pueden interesarte/);
    }
  });

  it('Deterministic router Flow 5 treats Instalacion as current-flow answer, not service switch', async () => {
    const mokCatalog = [
      { id: 50, nombre: 'Vinil de rotulacion de color', descripcion: 'Vinil para rotulacion', precio: 400, tipo_precio: 'POR_M2', requiere_medidas: true, categoria: 'Rotulacion' },
      { id: 51, nombre: 'Instalacion', descripcion: 'Instalacion de graficos', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Instalacion' }
    ];
    const { results } = await runMokFlow([
      'Rotulación',
      '3x2',
      'Ya tengo diseño',
      'Instalación'
    ], { serviceCatalog: mokCatalog });

    assert.equal(results[0].ncie.plannerAuthorityDecision.selectedService.nombre, 'Vinil de rotulacion de color');
    assert.equal(results[3].ncie.plannerAuthorityDecision.selectedService.nombre, 'Vinil de rotulacion de color');
    assert.notEqual(results[3].ncie.plannerAuthorityDecision.selectedService.nombre, 'Instalacion');
    assert.equal(results[3].ncie.plannerAuthorityDecision.detectedInstallationPreference, true);
  });
});
