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

function buildMcpClient({ company = {} } = {}) {
  const calls = [];

  return {
    calls,
    async loadFullServiceCatalog() {
      return {
        services,
        categories: services.map((service, index) => ({ id: index + 1, nombre: service.categoria, tipo: 'SERVICIO' }))
      };
    },
    async callTool(toolName, args) {
      calls.push({ toolName, args });

      if (toolName === 'obtener_configuracion_empresa') {
        return { empresa: { nombre: 'Demo', tipo_negocio: 'MIXTO', ...company } };
      }

      if (toolName === 'obtener_categorias') {
        return { categorias: services.map((service, index) => ({ id: index + 1, nombre: service.categoria })) };
      }

      if (toolName === 'buscar_servicios') {
        const text = normalize(args.texto);
        const tokens = text.split(/\s+/).filter((token) => token.length > 2);
        return {
          servicios: services.filter((service) => {
            const haystack = normalize(`${service.nombre} ${service.descripcion} ${service.categoria}`);
            return tokens.length === 0 || tokens.some((token) => haystack.includes(token));
          })
        };
      }

      if (toolName === 'buscar_productos') {
        const text = normalize(args.texto);
        return {
          productos: products.filter((product) => normalize(`${product.nombre} ${product.descripcion} ${product.categoria}`).includes(text.split(/\s+/)[0] ?? ''))
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
      assert.equal(catalogo.ncie.plannerAuthorityDecision.responsePlanType, 'business_summary');
      assert.equal(catalogo.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(catalogo.respuesta), /marketing|impresion|servicios/);
      assert.doesNotMatch(normalize(catalogo.respuesta), /lo tomamos como catalogo|pagos|solicitudes/);

      const servicios = await run('Servicios');
      assert.equal(servicios.ncie.plannerAuthorityDecision.responsePlanType, 'business_summary');
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
      assert.equal(catalogo.ncie.plannerAuthorityDecision.responsePlanType, 'business_summary');
      assert.equal(catalogo.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(catalogo.respuesta), /trabajamos principalmente|publicidad fisica|presencia digital|diseno\/imagen/);
      assert.doesNotMatch(normalize(catalogo.respuesta), /lo tomamos como catalogo|pagos|solicitudes/);

      const servicios = await run('Servicios');
      assert.equal(servicios.ncie.plannerAuthorityDecision.responsePlanType, 'business_summary');
      assert.equal(servicios.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(servicios.respuesta), /trabajamos principalmente/);
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
    assert.match(normalize(result.respuesta), /manejamos soluciones|manejamos servicios|impresion/i);
    assert.doesNotMatch(normalize(result.respuesta), /cual se parece/);
    assertNoFalseNegative(result.respuesta);
    assert.ok(result.ncie.responsePlan.families.length > 5);
  });

  it('lists products when customer asks if products are handled', async () => {
    const { result, mcpClient } = await runCase('Manejas productos');

    assert.equal(result.intencion, 'LISTAR_PRODUCTOS');
    assert.equal(result.tipo, 'product');
    assert.equal(result.ncie.decision.action, 'answer_with_results');
    assert.equal(result.ncie.responsePlan.type, 'personalized_products_summary');
    assert.match(normalize(result.respuesta), /servicios e impresiones\/productos personalizados|tarjetas|lonas|viniles|promocionales/i);
    assert.doesNotMatch(normalize(result.respuesta), /servicio exacto/);
    assertNoFalseNegative(result.respuesta);
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
    assert.equal(servicios.ncie.responsePlan.type, 'business_summary');
    assert.ok(servicios.ncie.responsePlan.families.length > 5);
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
    assert.equal(mas.ncie.responsePlan.type, 'business_summary');
    assert.ok(mas.ncie.responsePlan.families.length > 5);
    assert.doesNotMatch(normalize(mas.respuesta), /no contamos|servicio exacto|encontre estas opciones|cual se parece/);

    const lastSave = contextStore.saved.at(-1);
    assert.equal(lastSave.datos.ncie.active_service_name, 'Marketing digital');
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
      assert.equal(diseno.ncie.responsePlan.type, 'quote_design_followup');
      assert.equal(diseno.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(diseno.ncie.plannerAuthorityDecision.detectedDesignPreference, true);
      assert.match(normalize(diseno.respuesta), /diseno|780|2x1/);
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
      assert.equal(yaTengoDiseno.ncie.responsePlan.type, 'quote_design_followup');
      assert.equal(yaTengoDiseno.ncie.plannerAuthorityDecision.detectedDesignPreference, false);
      assert.match(normalize(yaTengoDiseno.respuesta), /ya tienes el diseno/);
      assert.doesNotMatch(normalize(yaTengoDiseno.respuesta), /podemos apoyarte con el diseno|lo dejamos contemplado junto/);

      const instalacion = await run('Sin instalacion');
      assert.equal(instalacion.ncie.responsePlan.type, 'quote_requirements_followup');
      assert.equal(instalacion.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(instalacion.ncie.plannerAuthorityDecision.detectedInstallationPreference, false);
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
      assert.match(normalize(volver.respuesta), /2x1/);
      assert.match(normalize(volver.respuesta), /390/);
      assert.match(normalize(volver.respuesta), /780/);
      assert.match(normalize(volver.respuesta), /incluye: impresion en lona/);
      assert.match(normalize(volver.respuesta), /no incluye: instalacion/);
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
      assert.equal(catalogo.ncie.plannerAuthorityDecision.responsePlanType, 'business_summary');
      assert.equal(catalogo.ncie.plannerAuthorityDecision.selectedService, null);
      assert.match(normalize(catalogo.respuesta), /manejamos soluciones|marketing|impresion/);
      assert.doesNotMatch(normalize(catalogo.respuesta), /seguimos con marketing digital|impresion de lona de 2x1/);

      const volverDespuesCatalogo = await run('Continuemos con la lona');
      assert.equal(volverDespuesCatalogo.ncie.plannerAuthorityDecision.selectedService.nombre, 'Impresion de lona');
      assert.equal(volverDespuesCatalogo.ncie.plannerAuthorityDecision.responsePlanType, 'resume_flow');
      assert.match(normalize(volverDespuesCatalogo.respuesta), /2x1/);
      assert.match(normalize(volverDespuesCatalogo.respuesta), /390/);
      assert.match(normalize(volverDespuesCatalogo.respuesta), /780/);
      assert.match(normalize(volverDespuesCatalogo.respuesta), /incluye: impresion en lona/);

      const anunciar = await run('Quiero anunciar mi negocio');
      assert.equal(anunciar.ncie.plannerAuthorityDecision.responsePlanType, 'consultative_diagnosis');
      assert.equal(anunciar.ncie.plannerAuthorityDecision.retrievalNeeded, false);
      assert.equal(anunciar.ncie.plannerAuthorityDecision.selectedService, null);
      assert.equal(anunciar.ncie.plannerAuthorityDecision.activeFlow, null);
      assert.equal(anunciar.ncie.responsePlan.type, 'consultative_diagnosis');
      assert.match(normalize(anunciar.respuesta), /tipo de negocio|atraer clientes|vender mas|promocionar algo especifico/);
      assert.doesNotMatch(normalize(anunciar.respuesta), /impresion de lona de 2x1|780|390/);

      const productos = await run('Manejan productos?');
      assert.equal(productos.ncie.plannerAuthorityDecision.responsePlanType, 'business_summary');
      assert.equal(productos.ncie.responsePlan.type, 'personalized_products_summary');
      assert.match(normalize(productos.respuesta), /servicios e impresiones\/productos personalizados|tarjetas|lonas|viniles|promocionales/);
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
