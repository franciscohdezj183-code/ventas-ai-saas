import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { runConversationEngine } from './conversation-engine.service.js';
import { runUnifiedPlannerCanary } from './unified-canary.service.js';

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const services = [
  {
    id: 1,
    nombre: 'Impresion de lona',
    descripcion: 'Impresion gran formato en lona',
    precio: 390,
    tipo_precio: 'POR_M2',
    unidad_medida: 'm2',
    requiere_medidas: true,
    categoria: 'Impresion'
  },
  {
    id: 2,
    nombre: 'Playeras DTF',
    descripcion: 'Impresion textil personalizada',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Textil'
  },
  {
    id: 3,
    nombre: 'Diseno web',
    descripcion: 'Paginas web y catalogos',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Diseno'
  },
  {
    id: 4,
    nombre: 'Bordado textil',
    descripcion: 'Bordado para uniformes',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Textil'
  },
  {
    id: 5,
    nombre: 'Serigrafia textil',
    descripcion: 'Serigrafia para playeras',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Textil'
  },
  {
    id: 6,
    nombre: 'Vinil de rotulacion de color',
    descripcion: 'Rotulacion con vinil para negocio o vehiculo',
    precio: 0,
    tipo_precio: 'COTIZACION',
    requiere_medidas: true,
    categoria: 'Rotulacion'
  },
  {
    id: 7,
    nombre: 'Tarjetas de presentacion',
    descripcion: 'Tarjetas impresas',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Impresion'
  },
  {
    id: 8,
    nombre: 'Banner arana',
    descripcion: 'Banner promocional',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Banners'
  },
  {
    id: 9,
    nombre: 'Promocionales con corte de vinil',
    descripcion: 'Articulos promocionales personalizados con corte de vinil',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Promocionales'
  },
  {
    id: 10,
    nombre: 'Vinil impreso',
    descripcion: 'Impresion de vinil para anuncios y rotulos',
    precio: 0,
    tipo_precio: 'COTIZACION',
    requiere_medidas: true,
    categoria: 'Impresion'
  }
];

function buildMcpClient(companyConfig = { nombre: 'Demo', tipo_negocio: 'SERVICIOS' }) {
  const calls = [];
  return {
    calls,
    async loadFullServiceCatalog() {
      return {
        services,
        categories: [
          { id: 1, nombre: 'Impresion', tipo: 'SERVICIO' },
          { id: 2, nombre: 'Textil', tipo: 'SERVICIO' },
          { id: 3, nombre: 'Diseno', tipo: 'SERVICIO' },
          { id: 4, nombre: 'Rotulacion', tipo: 'SERVICIO' },
          { id: 5, nombre: 'Banners', tipo: 'SERVICIO' },
          { id: 6, nombre: 'Promocionales', tipo: 'SERVICIO' },
          { id: 7, nombre: 'Instalacion', tipo: 'SERVICIO' }
        ]
      };
    },
    async callTool(toolName, args) {
      calls.push({ toolName, args });
      if (toolName === 'obtener_configuracion_empresa') {
        return { empresa: companyConfig };
      }
      if (toolName === 'obtener_categorias') {
        return { categorias: [{ nombre: 'Impresion' }, { nombre: 'Textil' }, { nombre: 'Diseno' }] };
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
      if (toolName === 'buscar_productos') return { productos: [] };
      if (toolName === 'guardar_conversacion') return { conversacion_id: 123 };
      if (toolName === 'crear_lead') return { lead_id: 456 };
      throw new Error(`Unexpected tool: ${toolName}`);
    }
  };
}

function buildContextStore(context = null) {
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

async function runCase({
  empresaId = 5,
  message = 'Quiero una impresion de lona',
  mcpClient = buildMcpClient(),
  contextStore = buildContextStore(),
  unifiedCanaryRunner
} = {}) {
  const result = await runConversationEngine({
    empresaId,
    phone: '5215550000000',
    message,
    whatsappChatId: '5215550000000@c.us',
    contactName: 'Cliente',
    mcpClient,
    contextStore,
    unifiedCanaryRunner
  });
  return { result, mcpClient, contextStore };
}

function semanticRunner({ classifier, config = { enabled: true, minConfidence: 0.85, maxTokens: 250, temperature: 0, timeoutMs: 4000, cacheTTL: 3600 } }) {
  return (args) => runUnifiedPlannerCanary({
    ...args,
    semanticClassifier: classifier,
    semanticConfig: config
  });
}

function enableCanary(value = '5') {
  process.env.UNIFIED_PLANNER_ENABLED = 'true';
  process.env.UNIFIED_PLANNER_CANARY_EMPRESAS = value;
  process.env.UNIFIED_PLANNER_ROLLBACK_ON_ERROR = 'true';
}

describe('Unified Planner Canary Mode phase 6B', () => {
  afterEach(() => {
    delete process.env.UNIFIED_PLANNER_ENABLED;
    delete process.env.UNIFIED_PLANNER_CANARY_EMPRESAS;
    delete process.env.UNIFIED_PLANNER_ROLLBACK_ON_ERROR;
    delete process.env.UNIFIED_PLANNER_SHADOW;
  });

  it('uses legacy when UNIFIED_PLANNER_ENABLED is false', async () => {
    process.env.UNIFIED_PLANNER_ENABLED = 'false';
    process.env.UNIFIED_PLANNER_CANARY_EMPRESAS = '5';
    const { result } = await runCase();

    assert.notEqual(result.ncie?.unifiedCanary, true);
    assert.match(normalize(result.respuesta), /impresion de lona|medidas/);
  });

  it('uses legacy when empresa is outside canary list', async () => {
    enableCanary('7,10');
    const { result } = await runCase({ empresaId: 5 });

    assert.notEqual(result.ncie?.unifiedCanary, true);
    assert.match(normalize(result.respuesta), /impresion de lona|medidas/);
  });

  it('uses unified planner when empresa is in canary list', async () => {
    enableCanary('5,7,10');
    const { result, mcpClient, contextStore } = await runCase({ empresaId: 5 });

    assert.equal(result.ncie?.unifiedCanary, true);
    assert.equal(result.intencion, 'START_SERVICE_QUOTE');
    assert.equal(result.ncie.selectedService.nombre, 'Impresion de lona');
    assert.match(normalize(result.respuesta), /me compartes las medidas/);
    assert.equal(mcpClient.calls.filter((call) => call.toolName === 'guardar_conversacion').length, 1);
    assert.equal(contextStore.saved.length, 1);
    assert.equal(contextStore.saved[0].datos.ncie.unified.currentState, 'ESPERANDO_MEDIDAS');
  });

  it('uses configured welcome for greeting presentation without semantic classifier', async () => {
    enableCanary('5');
    const classifier = async () => {
      throw new Error('semantic classifier should not be called for greeting');
    };
    const { result } = await runCase({
      message: 'Hola, buena tarde, mi nombre es Russel',
      mcpClient: buildMcpClient({
        nombre: 'Demo',
        tipo_negocio: 'SERVICIOS',
        greetingMessage: 'Bienvenido a Demo. Te ayudamos a cotizar.'
      }),
      unifiedCanaryRunner: semanticRunner({ classifier })
    });

    assert.equal(result.ncie.executionPlan.intent, 'NEUTRAL');
    assert.equal(result.respuesta, 'Bienvenido a Demo. Te ayudamos a cotizar.');
    assert.equal(result.ncie.semanticHints, null);
    assert.doesNotMatch(normalize(result.respuesta), /me ayudas con un poco mas de detalle/);
  });

  it('falls back to legacy when unified planner fails', async () => {
    enableCanary('5');
    const { result, mcpClient, contextStore } = await runCase({
      unifiedCanaryRunner: async () => {
        throw new Error('canary boom');
      }
    });

    assert.notEqual(result.ncie?.unifiedCanary, true);
    assert.match(normalize(result.respuesta), /impresion de lona|medidas/);
    assert.equal(mcpClient.calls.filter((call) => call.toolName === 'guardar_conversacion').length, 1);
    assert.equal(contextStore.saved.length, 1);
  });

  it('does not send or persist double side effects in canary success', async () => {
    enableCanary('5');
    const { mcpClient, contextStore } = await runCase({ empresaId: 5 });

    assert.equal(mcpClient.calls.filter((call) => call.toolName === 'guardar_conversacion').length, 1);
    assert.equal(contextStore.saved.length, 1);
  });

  it('does not emit legacy state authority logs before canary success', async () => {
    enableCanary('5');
    const originalStdoutWrite = process.stdout.write;
    const stdoutChunks = [];
    const contextStore = buildContextStore({
      datos_json: {
        servicio: { id: 16, nombre: 'Aluminio cepillado' },
        ncie: {
          active_service_name: 'Aluminio cepillado',
          planner_state: { activeFlowId: 'flow_service_16', waitingField: 'budget' }
        }
      }
    });

    process.stdout.write = function write(chunk, encoding, callback) {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
      if (typeof callback === 'function') callback();
      return true;
    };

    try {
      await runCase({
        contextStore,
        unifiedCanaryRunner: async () => ({
          respuesta: 'ok',
          ncie: { unifiedCanary: true },
          intencion: 'TEST'
        })
      });
    } finally {
      process.stdout.write = originalStdoutWrite;
    }

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    assert.match(stdout, /"message":"unified_canary_selected"/);
    assert.doesNotMatch(stdout, /"message":"legacy_decision_detected"/);
    assert.doesNotMatch(stdout, /"message":"ncie_conversation_state_loaded"/);
    assert.doesNotMatch(stdout, /"message":"ncie_state_before"/);
    assert.doesNotMatch(stdout, /Aluminio cepillado/);
  });

  it('emits legacy decision warnings only when the legacy branch runs', async () => {
    process.env.UNIFIED_PLANNER_ENABLED = 'false';
    process.env.UNIFIED_PLANNER_CANARY_EMPRESAS = '5';
    const originalStdoutWrite = process.stdout.write;
    const stdoutChunks = [];

    process.stdout.write = function write(chunk, encoding, callback) {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
      if (typeof callback === 'function') callback();
      return true;
    };

    try {
      await runCase();
    } finally {
      process.stdout.write = originalStdoutWrite;
    }

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    assert.match(stdout, /"message":"legacy_decision_detected"/);
    assert.match(stdout, /"module":"conversation-engine.service"/);
    assert.match(stdout, /"module":"conversation-router"/);
  });

  it('does not duplicate notifications in canary handoff', async () => {
    enableCanary('5');
    const { result, mcpClient, contextStore } = await runCase({
      empresaId: 5,
      message: 'Me comunicas con un asesor por favor'
    });

    assert.equal(result.ncie?.unifiedCanary, true);
    assert.equal(result.ncie.advisorNotificationRequired, true);
    assert.equal(result.ncie.executorResult.notifications.length, 1);
    assert.equal(mcpClient.calls.filter((call) => call.toolName === 'guardar_conversacion').length, 1);
    assert.equal(contextStore.saved.length, 1);
    assert.equal(mcpClient.calls.filter((call) => call.toolName === 'crear_lead').length, 0);
  });

  it('creates a short owner message for advisor handoff', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Impresion de lona' });
    await runCase({ contextStore, message: '2x3' });
    await runCase({ contextStore, message: '1000 pesos' });
    await runCase({ contextStore, message: 'ya tengo el diseno y con instalacion' });
    const handoff = await runCase({ contextStore, message: 'humano por favor' });

    const payload = handoff.result.ncie.notificationPayload;
    assert.match(payload.message, /Nueva solicitud - Demo/);
    assert.match(payload.message, /Cliente:/);
    assert.match(payload.message, /Servicio: Impresion de lona/);
    assert.match(payload.message, /Datos:/);
    assert.match(payload.message, /Estimado:/);
    assert.match(payload.message, /Responder: si .* \/ no .*/);
  });

  it('logs unified intelligence metrics for recommendation, summary, memory, synonyms, emoji and quality', async () => {
    enableCanary('5');
    const originalStdoutWrite = process.stdout.write;
    const stdoutChunks = [];
    const contextStore = buildContextStore();

    process.stdout.write = function write(chunk, encoding, callback) {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
      if (typeof callback === 'function') callback();
      return true;
    };

    try {
      await runCase({ contextStore, message: 'Quiero atraer clientes con $1000' });
      await runCase({ contextStore, message: 'manta' });
      await runCase({ contextStore, message: '2x3' });
      await runCase({ contextStore, message: '1000 pesos' });
      await runCase({ contextStore, message: 'ya tengo el diseno y con instalacion' });
    } finally {
      process.stdout.write = originalStdoutWrite;
    }

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    assert.match(stdout, /"message":"unified_recommendation_generated"/);
    assert.match(stdout, /"message":"unified_quote_summary_generated"/);
    assert.match(stdout, /"message":"unified_memory_enriched"/);
    assert.match(stdout, /"message":"unified_synonym_matched"/);
    assert.match(stdout, /"message":"unified_emoji_mode_applied"/);
    assert.match(stdout, /"message":"unified_conversation_quality_score"/);
  });

  it('starts canary without inheriting contaminated legacy activeFlow', async () => {
    enableCanary('5');
    const pollutedContext = {
      ultimo_servicio_id: 16,
      datos_json: {
        servicio: { id: 16, nombre: 'Aluminio cepillado', categoria: 'Senaletica' },
        ncie: {
          active_service_id: 16,
          active_service_name: 'Aluminio cepillado',
          planner_state: {
            activeFlowId: 'flow_service_16',
            waitingField: 'budget',
            selectedService: { id: 16, nombre: 'Aluminio cepillado' },
            flows: [{
              id: 'flow_service_16',
              status: 'active',
              selectedServiceId: 16,
              selectedServiceName: 'Aluminio cepillado',
              waitingField: 'budget'
            }]
          }
        }
      }
    };
    const contextStore = buildContextStore(pollutedContext);
    const { result } = await runCase({ contextStore, message: 'Gracias' });

    assert.equal(result.ncie?.unifiedCanary, true);
    assert.match(normalize(result.respuesta), /cuando quieras te ayudo a cotizar|ayudo a cotizar/);
    assert.doesNotMatch(normalize(result.respuesta), /aluminio cepillado|presupuesto/);
    assert.equal(contextStore.saved[0].datos.ncie.unified.selectedService, null);
  });

  it('selects catalog option 9 as Promocionales con corte de vinil', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    const catalog = await runCase({ contextStore, message: 'Catalogo completo' });
    assert.equal(catalog.result.ncie?.unifiedCanary, true);
    assert.equal(catalog.contextStore.saved.at(-1).datos.ncie.unified.lastOptionsShown.length, 10);

    const selected = await runCase({ contextStore, message: 'El numero 9' });
    assert.equal(selected.result.ncie.selectedService.nombre, 'Promocionales con corte de vinil');
    assert.match(normalize(selected.result.respuesta), /promocionales con corte de vinil/);
    assert.doesNotMatch(normalize(selected.result.respuesta), /cantidad, presupuesto o una medida/);
  });

  it('recognizes Cstalogo as SHOW_CATALOG', async () => {
    enableCanary('5');
    const { result } = await runCase({ message: 'Cstalogo' });

    assert.equal(result.ncie?.unifiedCanary, true);
    assert.equal(result.ncie.executionPlan.intent, 'SHOW_CATALOG');
    assert.match(normalize(result.respuesta), /servicios disponibles|cual te gustaria cotizar/);
  });

  it('keeps catalog option 9 service after quantity and asks for details instead of budget', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Catalogo' });
    await runCase({ contextStore, message: '9' });
    const quantity = await runCase({ contextStore, message: '3 piezas' });

    const unified = quantity.contextStore.saved.at(-1).datos.ncie.unified;
    assert.equal(quantity.result.ncie.selectedService.nombre, 'Promocionales con corte de vinil');
    assert.equal(unified.selectedService.nombre, 'Promocionales con corte de vinil');
    assert.equal(unified.entities.quantity, 3);
    assert.match(normalize(quantity.result.respuesta), /3 piezas.*medidas.*diseno.*detalle/);
    assert.doesNotMatch(normalize(quantity.result.respuesta), /presupuesto aproximado quieres empezar|rango de presupuesto/);
  });

  it('shows three textil options without auto-selecting DTF', async () => {
    enableCanary('5');
    const { result } = await runCase({ message: 'Textil' });

    assert.equal(result.ncie?.unifiedCanary, true);
    assert.equal(result.ncie.executionPlan.intent, 'SHOW_CATEGORY');
    assert.equal(result.ncie.selectedService, null);
    assert.match(result.respuesta, /Playeras DTF/);
    assert.match(result.respuesta, /Bordado textil/);
    assert.match(result.respuesta, /Serigrafia textil/);
    assert.equal(result.ncie.executionPlan.responsePlan.services.length, 3);
  });

  it('clarifies out-of-range category option without treating it as quantity or budget', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Textil' });
    const selected = await runCase({ contextStore, message: '9' });

    assert.equal(selected.result.ncie.executionPlan.intent, 'CLARIFY');
    assert.equal(selected.result.ncie.executionPlan.reason, 'catalog_selection_out_of_range');
    assert.equal(selected.result.ncie.selectedService, null);
    assert.match(selected.result.respuesta, /No tengo una opcion 9 en Textil/);
    assert.match(selected.result.respuesta, /Responde 1, 2 o 3/);
    assert.doesNotMatch(normalize(selected.result.respuesta), /cantidad, presupuesto o una medida/);
  });

  it('keeps lona flow and stores budget after measurements', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Impresion de lona' });
    await runCase({ contextStore, message: '4x1' });
    const budget = await runCase({ contextStore, message: '1000 pesos' });

    const unified = budget.contextStore.saved.at(-1).datos.ncie.unified;
    assert.equal(budget.result.ncie.selectedService.nombre, 'Impresion de lona');
    assert.equal(unified.selectedService.nombre, 'Impresion de lona');
    assert.equal(unified.entities.budget, 1000);
    assert.equal(budget.result.parametros.budget.value, 1000);
  });

  it('stores out-of-order budget while waiting for design and asks design with context', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Impresion de lona' });
    const measurements = await runCase({ contextStore, message: '4x1' });
    const budget = await runCase({ contextStore, message: '1000 pesos' });

    const unified = budget.contextStore.saved.at(-1).datos.ncie.unified;
    assert.equal(unified.selectedService.nombre, 'Impresion de lona');
    assert.equal(unified.entities.budget, 1000);
    assert.equal(unified.currentState, 'ESPERANDO_DISENO');
    assert.match(normalize(budget.result.respuesta), /presupuesto aproximado.*\$1,000|presupuesto aproximado.*1000/);
    assert.match(normalize(budget.result.respuesta), /diseno.*apoyo/);
    assert.notEqual(normalize(budget.result.respuesta), normalize(measurements.result.respuesta));
  });

  it('keeps rotulacion service when customer answers instalacion', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Rotulacion' });
    await runCase({ contextStore, message: '3x2' });
    const installation = await runCase({ contextStore, message: 'Instalacion' });

    const unified = installation.contextStore.saved.at(-1).datos.ncie.unified;
    assert.match(normalize(installation.result.ncie.selectedService.nombre), /rotulacion/);
    assert.match(normalize(unified.selectedService.nombre), /rotulacion/);
    assert.equal(unified.entities.installation, true);
    assert.notEqual(installation.result.ncie.selectedCategory, 'Instalacion');
  });

  it('stores out-of-order installation while waiting for design', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Rotulacion' });
    await runCase({ contextStore, message: '3x2' });
    const installation = await runCase({ contextStore, message: 'Instalacion' });

    const unified = installation.contextStore.saved.at(-1).datos.ncie.unified;
    assert.match(normalize(unified.selectedService.nombre), /rotulacion/);
    assert.equal(unified.entities.installation, true);
    assert.equal(unified.currentState, 'ESPERANDO_DISENO');
    assert.match(normalize(installation.result.respuesta), /agrego instalacion|dejo instalacion|instalacion considerada/);
    assert.match(normalize(installation.result.respuesta), /diseno.*apoyo|diseno.*preparemos/);
  });

  it('thanks with active flow does not restart conversation', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Impresion de lona' });
    const thanks = await runCase({ contextStore, message: 'Gracias' });

    assert.match(normalize(thanks.result.respuesta), /seguimos con impresion de lona|lo dejamos pendiente/);
    assert.equal(thanks.contextStore.saved.at(-1).datos.ncie.unified.selectedService.nombre, 'Impresion de lona');
  });

  it('continues active flow with dimensions after thanks confirmation', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Rotulacion' });
    await runCase({ contextStore, message: 'Gracias' });
    const dimensions = await runCase({ contextStore, message: '0.50x1.60' });

    const unified = dimensions.contextStore.saved.at(-1).datos.ncie.unified;
    assert.match(normalize(unified.selectedService.nombre), /rotulacion/);
    assert.equal(unified.entities.dimensions.width, 0.5);
    assert.equal(unified.entities.dimensions.height, 1.6);
    assert.equal(unified.currentState, 'ESPERANDO_DISENO');
    assert.match(normalize(dimensions.result.respuesta), /diseno|cotizacion/);
  });

  it('does not repeat the exact same design question twice', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Impresion de lona' });
    await runCase({ contextStore, message: '4x1' });
    const firstBudget = await runCase({ contextStore, message: '1000 pesos' });
    const secondBudget = await runCase({ contextStore, message: '2000 pesos' });

    assert.notEqual(normalize(firstBudget.result.respuesta), normalize(secondBudget.result.respuesta));
    assert.match(normalize(secondBudget.result.respuesta), /diseno|cotizacion/);
  });

  it('asks for service when dimensions arrive without active service', async () => {
    enableCanary('5');
    const { result } = await runCase({ message: '0.60x1.60' });

    assert.equal(result.ncie?.unifiedCanary, true);
    assert.match(normalize(result.respuesta), /tengo las medidas.*servicio.*cotizar/);
    assert.equal(result.ncie.selectedService, null);
    assert.ok(result.parametros.dimensions.value.area > 0);
  });

  it('canary treats bare number as budget while waiting for budget', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Diseno web' });
    const budget = await runCase({ contextStore, message: '10000' });

    const unified = budget.contextStore.saved.at(-1).datos.ncie.unified;
    assert.equal(budget.result.ncie.executionPlan.intent, 'ANSWER_PREVIOUS_QUESTION');
    assert.notEqual(budget.result.ncie.executionPlan.intent, 'CLARIFY');
    assert.equal(unified.entities.budget, 10000);
    assert.notEqual(unified.currentState, 'INIT');
  });

  it('canary keeps pesos budget while waiting for budget', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Diseno web' });
    const budget = await runCase({ contextStore, message: '10000 pesos' });

    assert.equal(budget.result.ncie.executionPlan.intent, 'ANSWER_PREVIOUS_QUESTION');
    assert.equal(budget.contextStore.saved.at(-1).datos.ncie.unified.entities.budget, 10000);
  });

  it('canary keeps flow and currency when customer clarifies euros', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Diseno web' });
    await runCase({ contextStore, message: '10000' });
    const currency = await runCase({ contextStore, message: 'Es mi presupuesto en euros' });

    const unified = currency.contextStore.saved.at(-1).datos.ncie.unified;
    assert.equal(currency.result.ncie.executionPlan.reason, 'budget_currency_requires_confirmation');
    assert.equal(unified.entities.budget, 10000);
    assert.equal(unified.entities.budgetCurrency, 'EUR');
    assert.notEqual(unified.currentState, 'INIT');
    assert.match(currency.result.respuesta, /presupuesto aproximado en euros/);
  });

  it('canary handles composed vinil quote without dimensions clarification', async () => {
    enableCanary('5');
    const { result, contextStore } = await runCase({
      message: 'Quiero una impresion de vinil, de 10x2.3, quiero 4 piezas, presupuesto de 100000 pesos'
    });

    const unified = contextStore.saved.at(-1).datos.ncie.unified;
    assert.equal(result.ncie.executionPlan.intent, 'START_SERVICE_QUOTE');
    assert.equal(result.ncie.selectedService.nombre, 'Vinil impreso');
    assert.equal(unified.entities.dimensions.width, 10);
    assert.equal(unified.entities.dimensions.height, 2.3);
    assert.equal(unified.entities.quantity, 4);
    assert.equal(unified.entities.budget, 100000);
    assert.notEqual(result.ncie.executionPlan.reason, 'dimensions_without_service');
    assert.notEqual(result.ncie.executionPlan.intent, 'CLARIFY');
  });

  it('canary turns summary yes into handoff', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Impresion de lona' });
    await runCase({ contextStore, message: '2x3' });
    await runCase({ contextStore, message: '1000 pesos' });
    await runCase({ contextStore, message: 'ya tengo el diseno' });
    const yes = await runCase({ contextStore, message: 'Si' });

    assert.equal(yes.result.ncie.executionPlan.intent, 'HANDOFF');
    assert.equal(yes.result.ncie.advisorNotificationRequired, true);
    assert.notEqual(yes.result.ncie.executionPlan.intent, 'CLARIFY');
  });

  it('canary preserves active service when customer says ya te lo dije', async () => {
    enableCanary('5');
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Impresion de lona' });
    await runCase({ contextStore, message: '2x3' });
    await runCase({ contextStore, message: '1000 pesos' });
    await runCase({ contextStore, message: 'ya tengo el diseno' });
    const repeated = await runCase({ contextStore, message: 'Ya te lo dije' });

    assert.equal(repeated.result.ncie.selectedService.nombre, 'Impresion de lona');
    assert.equal(repeated.result.ncie.executionPlan.reason, 'repeated_info_reference_with_active_service');
    assert.match(repeated.result.respuesta, /Si, tengo registrado: Impresion de lona/);
    assert.doesNotMatch(normalize(repeated.result.respuesta), /que producto, servicio o categoria tienes en mente/);
  });

  it('calls semantic classifier only for low-confidence no-rule clarify and replans with hints', async () => {
    enableCanary('5');
    const calls = [];
    const classifier = async ({ message }) => {
      calls.push(message.normalized);
      return {
        intent: 'SHOW_CATALOG',
        confidence: 0.96,
        entities: {
          businessType: null,
          businessGoal: null,
          budget: null,
          currency: null,
          catalogRequest: true,
          advisorRequest: false
        },
        explanation: 'Pide opciones disponibles.'
      };
    };

    const { result } = await runCase({
      message: 'Que manejan?',
      unifiedCanaryRunner: semanticRunner({ classifier })
    });

    assert.equal(calls.length, 1);
    assert.equal(result.ncie.executionPlan.intent, 'SHOW_CATALOG');
    assert.equal(result.ncie.semanticHints.intent, 'SHOW_CATALOG');
    assert.equal(result.ncie.executionPlan.entities.catalogRequest.source, 'semantic-intent-classifier');
  });

  it('calls semantic classifier for short contextual answers that would otherwise lose the active service', async () => {
    enableCanary('5');
    const calls = [];
    const classifier = async ({ message }) => {
      calls.push(message.normalized);
      return {
        intent: 'CONFIRM_DIMENSIONS_UNIT',
        confidence: 0.96,
        entities: {
          businessType: null,
          businessGoal: null,
          budget: null,
          quantity: null,
          dimensionsUnit: 'metros',
          currency: null,
          catalogRequest: false,
          advisorRequest: false
        },
        explanation: 'Confirma unidad de medidas.'
      };
    };
    const contextStore = buildContextStore();
    const runner = semanticRunner({ classifier });

    await runCase({ contextStore, message: 'Impresion de lona', unifiedCanaryRunner: runner });
    await runCase({ contextStore, message: '12345 x 123 metros', unifiedCanaryRunner: runner });
    const unit = await runCase({ contextStore, message: 'Metros', unifiedCanaryRunner: runner });

    assert.equal(calls.length, 1);
    assert.equal(unit.result.ncie.semanticHints.intent, 'CONFIRM_DIMENSIONS_UNIT');
    assert.equal(unit.result.ncie.selectedService.nombre, 'Impresion de lona');
    assert.notEqual(unit.result.ncie.executionPlan.nextState, 'INIT');
    assert.doesNotMatch(normalize(unit.result.respuesta), /que producto, servicio o categoria tienes en mente/);
  });

  it('uses semantic classifier for budget and quantity clarifications with active flow context', async () => {
    enableCanary('5');
    const calls = [];
    const classifier = async ({ message }) => {
      calls.push(message.normalized);
      if (normalize(message.normalized).includes('cantidad')) {
        return { intent: 'CONFIRM_QUANTITY', confidence: 0.96, entities: {}, explanation: 'Aclara cantidad.' };
      }
      return { intent: 'CONFIRM_BUDGET', confidence: 0.96, entities: {}, explanation: 'Aclara presupuesto.' };
    };
    const runner = semanticRunner({ classifier });
    const quantityContext = buildContextStore({
      datos_json: {
        ncie: {
          unified: {
            currentState: 'ESPERANDO_CANTIDAD',
            selectedService: services[6],
            selectedCategory: services[6].categoria,
            entities: { ambiguousNumber: 345 },
            lastQuestionId: 'clarify.number',
            lastQuestionText: 'Ese numero es cantidad, presupuesto o una medida?',
            flowId: 'unified_service_7',
            flowStatus: 'active'
          }
        }
      }
    });
    const budgetContext = buildContextStore({
      datos_json: {
        ncie: {
          unified: {
            currentState: 'ESPERANDO_PRESUPUESTO',
            selectedService: services[2],
            selectedCategory: services[2].categoria,
            entities: { ambiguousNumber: 10000 },
            lastQuestionId: 'clarify.number',
            lastQuestionText: 'Ese numero es cantidad, presupuesto o una medida?',
            flowId: 'unified_service_3',
            flowStatus: 'active'
          }
        }
      }
    });

    const quantity = await runCase({ contextStore: quantityContext, message: 'es la cantidad de piezas', unifiedCanaryRunner: runner });
    const budget = await runCase({ contextStore: budgetContext, message: 'es mi presupuesto', unifiedCanaryRunner: runner });

    assert.equal(calls.length, 1);
    assert.match(calls[0], /presupuesto/);
    assert.equal(quantity.contextStore.saved.at(-1).datos.ncie.unified.entities.quantity, 345);
    assert.equal(quantity.result.ncie.selectedService.nombre, 'Tarjetas de presentacion');
    assert.equal(budget.contextStore.saved.at(-1).datos.ncie.unified.entities.budget, 10000);
    assert.equal(budget.result.ncie.selectedService.nombre, 'Diseno web');
    assert.doesNotMatch(normalize(quantity.result.respuesta), /que producto, servicio o categoria tienes en mente/);
    assert.doesNotMatch(normalize(budget.result.respuesta), /que producto, servicio o categoria tienes en mente/);
  });

  it('does not call semantic classifier when planner understands catalog, measurements or budget directly', async () => {
    enableCanary('5');
    const classifier = async () => {
      throw new Error('semantic classifier should not be called');
    };
    const runner = semanticRunner({ classifier });
    const contextStore = buildContextStore();

    await runCase({ contextStore, message: 'Catalogo', unifiedCanaryRunner: runner });
    await runCase({ contextStore, message: 'Impresion de lona', unifiedCanaryRunner: runner });
    await runCase({ contextStore, message: '4x1', unifiedCanaryRunner: runner });
    await runCase({ contextStore, message: '1000 pesos', unifiedCanaryRunner: runner });
  });

  it('does not fall to a generic clarify for mixed quantity and marketing service text', async () => {
    enableCanary('5');
    const classifier = async () => {
      throw new Error('semantic classifier should not be called');
    };
    const { result } = await runCase({
      message: 'quiero 10 marketing digitales',
      unifiedCanaryRunner: semanticRunner({ classifier })
    });

    assert.notEqual(result.ncie.executionPlan.reason, 'no_planner_rule_matched');
    assert.doesNotMatch(normalize(result.respuesta), /que producto, servicio o categoria tienes en mente/);
  });

  it('does not call semantic classifier for obvious deterministic messages', async () => {
    enableCanary('5');
    const classifier = async () => {
      throw new Error('semantic classifier should not be called');
    };
    const runner = semanticRunner({ classifier });

    for (const message of ['Catalogo', '8', '4x1', '1000 pesos', 'si', 'no', 'asesor']) {
      const { result } = await runCase({ message, unifiedCanaryRunner: runner });
      assert.ok(result.ncie?.executionPlan);
    }
  });
});
