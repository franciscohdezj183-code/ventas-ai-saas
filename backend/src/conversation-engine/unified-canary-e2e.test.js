import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { runConversationEngine } from './conversation-engine.service.js';

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const services = [
  { id: 1, nombre: 'Impresion de lona', descripcion: 'Impresion gran formato en lona', precio: 390, tipo_precio: 'POR_M2', unidad_medida: 'm2', requiere_medidas: true, categoria: 'Impresion' },
  { id: 2, nombre: 'Playeras DTF', descripcion: 'Impresion textil personalizada', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Textil' },
  { id: 3, nombre: 'Diseno web', descripcion: 'Paginas web y catalogos', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Diseno' },
  { id: 4, nombre: 'Bordado textil', descripcion: 'Bordado para uniformes', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Textil' },
  { id: 5, nombre: 'Serigrafia textil', descripcion: 'Serigrafia para playeras', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Textil' },
  { id: 6, nombre: 'Vinil de rotulacion de color', descripcion: 'Rotulacion con vinil para negocio o vehiculo', precio: 0, tipo_precio: 'COTIZACION', requiere_medidas: true, categoria: 'Rotulacion' },
  { id: 7, nombre: 'Tarjetas de presentacion', descripcion: 'Tarjetas impresas', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Impresion' },
  { id: 8, nombre: 'Banner arana', descripcion: 'Banner promocional', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Banners' },
  { id: 9, nombre: 'Promocionales con corte de vinil', descripcion: 'Articulos promocionales personalizados con corte de vinil', precio: 0, tipo_precio: 'COTIZACION', categoria: 'Promocionales' }
];

const categories = [
  { id: 1, nombre: 'Impresion', tipo: 'SERVICIO' },
  { id: 2, nombre: 'Textil', tipo: 'SERVICIO' },
  { id: 3, nombre: 'Diseno', tipo: 'SERVICIO' },
  { id: 4, nombre: 'Rotulacion', tipo: 'SERVICIO' },
  { id: 5, nombre: 'Banners', tipo: 'SERVICIO' },
  { id: 6, nombre: 'Promocionales', tipo: 'SERVICIO' },
  { id: 7, nombre: 'Instalacion', tipo: 'SERVICIO' }
];

function buildMcpClient() {
  const calls = [];
  return {
    calls,
    async loadFullServiceCatalog() {
      return { services, categories };
    },
    async callTool(toolName, args) {
      calls.push({ toolName, args });
      if (toolName === 'obtener_configuracion_empresa') return { empresa: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' } };
      if (toolName === 'guardar_conversacion') return { conversacion_id: 100 + calls.length };
      if (toolName === 'crear_lead') return { lead_id: 200 + calls.length };
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

function enableCanary(value = '5') {
  process.env.UNIFIED_PLANNER_ENABLED = 'true';
  process.env.UNIFIED_PLANNER_CANARY_EMPRESAS = value;
  process.env.UNIFIED_PLANNER_ROLLBACK_ON_ERROR = 'true';
}

async function runMessage({ message, contextStore, mcpClient = buildMcpClient(), empresaId = 5 }) {
  const result = await runConversationEngine({
    empresaId,
    phone: '5215550000000',
    message,
    whatsappChatId: '5215550000000@c.us',
    contactName: 'Cliente',
    mcpClient,
    contextStore
  });
  assert.equal(result.ncie?.unifiedCanary, true);
  assert.notEqual(result.ncie?.executionPlan?.selectedService?.nombre, 'Aluminio cepillado');
  if (result.ncie?.executionPlan?.responsePlan?.question) {
    assert.notEqual(result.ncie.executionPlan.responsePlan.question, result.ncie.executionPlan.stateBefore?.lastQuestionText);
  }
  return { result, mcpClient, contextStore };
}

async function runFlow(messages, context = null) {
  const contextStore = buildContextStore(context);
  const mcpClient = buildMcpClient();
  const results = [];
  for (const message of messages) {
    results.push((await runMessage({ message, contextStore, mcpClient })).result);
  }
  return { results, contextStore, mcpClient };
}

function lastUnified(contextStore) {
  return contextStore.saved.at(-1)?.datos?.ncie?.unified;
}

function assertNoExactConsecutiveResponses(results) {
  for (let index = 1; index < results.length; index += 1) {
    assert.notEqual(normalize(results[index - 1].respuesta), normalize(results[index].respuesta));
  }
}

describe('Unified Planner Canary e2e phase 7', () => {
  afterEach(() => {
    delete process.env.UNIFIED_PLANNER_ENABLED;
    delete process.env.UNIFIED_PLANNER_CANARY_EMPRESAS;
    delete process.env.UNIFIED_PLANNER_ROLLBACK_ON_ERROR;
    delete process.env.UNIFIED_PLANNER_SHADOW;
  });

  it('01 keeps canary gated by empresa id', async () => {
    process.env.UNIFIED_PLANNER_ENABLED = 'true';
    process.env.UNIFIED_PLANNER_CANARY_EMPRESAS = '7';
    const result = await runConversationEngine({
      empresaId: 5,
      phone: '5215550000000',
      message: 'Impresion de lona',
      whatsappChatId: '5215550000000@c.us',
      mcpClient: buildMcpClient(),
      contextStore: buildContextStore()
    });
    assert.notEqual(result.ncie?.unifiedCanary, true);
  });

  it('02 recognizes typo catalog request', async () => {
    enableCanary();
    const { results } = await runFlow(['Cstalogo']);
    assert.equal(results[0].ncie.executionPlan.intent, 'SHOW_CATALOG');
  });

  it('03 catalog number 9 selects promotional service', async () => {
    enableCanary();
    const { results } = await runFlow(['Catalogo', '9']);
    assert.equal(results.at(-1).ncie.selectedService.nombre, 'Promocionales con corte de vinil');
    assertNoExactConsecutiveResponses(results);
  });

  it('04 catalog number phrase selects promotional service', async () => {
    enableCanary();
    const { results } = await runFlow(['Catalogo completo', 'El numero 9']);
    assert.equal(results.at(-1).ncie.selectedService.nombre, 'Promocionales con corte de vinil');
  });

  it('05 promotional quantity asks detail before budget', async () => {
    enableCanary();
    const { results, contextStore } = await runFlow(['Catalogo', '9', '3 piezas']);
    assert.equal(lastUnified(contextStore).entities.quantity, 3);
    assert.match(normalize(results.at(-1).respuesta), /medidas.*diseno.*detalle/);
    assert.doesNotMatch(normalize(results.at(-1).respuesta), /presupuesto aproximado quieres empezar/);
  });

  it('06 textil lists category options only', async () => {
    enableCanary();
    const { results } = await runFlow(['Textil']);
    assert.equal(results[0].ncie.executionPlan.intent, 'SHOW_CATEGORY');
    assert.equal(results[0].ncie.selectedService, null);
    assert.match(results[0].respuesta, /Playeras DTF/);
    assert.match(results[0].respuesta, /Bordado textil/);
    assert.match(results[0].respuesta, /Serigrafia textil/);
  });

  it('07 lona accepts dimensions and budget out of order', async () => {
    enableCanary();
    const { results, contextStore } = await runFlow(['Impresion de lona', '4x1', '1000 pesos']);
    assert.equal(lastUnified(contextStore).selectedService.nombre, 'Impresion de lona');
    assert.equal(lastUnified(contextStore).entities.budget, 1000);
    assert.equal(results.at(-1).ncie.executionPlan.reason, 'out_of_order_entity_handling');
    assert.match(normalize(results.at(-1).respuesta), /presupuesto aproximado.*diseno/);
  });

  it('08 rotulacion accepts installation out of order', async () => {
    enableCanary();
    const { results, contextStore } = await runFlow(['Rotulacion', '3x2', 'Instalacion']);
    assert.match(normalize(lastUnified(contextStore).selectedService.nombre), /rotulacion/);
    assert.equal(lastUnified(contextStore).entities.installation, true);
    assert.match(normalize(results.at(-1).respuesta), /instalacion.*diseno|diseno.*instalacion/);
  });

  it('09 thanks keeps active flow resumable', async () => {
    enableCanary();
    const { results, contextStore } = await runFlow(['Rotulacion', 'Gracias', '0.50x1.60']);
    assert.match(normalize(results[1].respuesta), /seguimos con vinil de rotulacion de color|lo dejamos pendiente/);
    assert.match(normalize(lastUnified(contextStore).selectedService.nombre), /rotulacion/);
    assert.equal(lastUnified(contextStore).entities.dimensions.width, 0.5);
  });

  it('10 dimensions without service ask for service', async () => {
    enableCanary();
    const { results } = await runFlow(['0.60x1.60']);
    assert.equal(results[0].ncie.selectedService, null);
    assert.match(normalize(results[0].respuesta), /medidas.*servicio.*cotizar/);
  });

  it('11 bare number remains clarification', async () => {
    enableCanary();
    const { results } = await runFlow(['1000']);
    assert.equal(results[0].ncie.executionPlan.intent, 'CLARIFY');
    assert.match(normalize(results[0].respuesta), /cantidad, presupuesto o una medida/);
  });

  it('12 budget without active service does not become dimensions', async () => {
    enableCanary();
    const { results } = await runFlow(['1000 pesos']);
    assert.equal(results[0].parametros.budget.value, 1000);
    assert.equal(results[0].ncie.selectedService, null);
    assert.notEqual(results[0].parametros.dimensions?.value?.area, 1000);
  });

  it('13 direct advisor request creates handoff', async () => {
    enableCanary();
    const { results } = await runFlow(['Me comunicas con un asesor por favor']);
    assert.equal(results[0].ncie.executionPlan.intent, 'HANDOFF');
    assert.equal(results[0].ncie.advisorNotificationRequired, true);
    assert.match(normalize(results[0].respuesta), /asesor/);
  });

  it('14 topic switch closes previous unified flow', async () => {
    enableCanary();
    const { results } = await runFlow(['Impresion de lona', 'Mejor diseno web']);
    assert.equal(results.at(-1).ncie.executionPlan.intent, 'TOPIC_SWITCH');
    assert.equal(results.at(-1).ncie.selectedService.nombre, 'Diseno web');
  });

  it('15 polluted legacy state does not revive legacy service', async () => {
    enableCanary();
    const polluted = {
      ultimo_servicio_id: 16,
      datos_json: {
        servicio: { id: 16, nombre: 'Aluminio cepillado', categoria: 'Senaletica' },
        ncie: {
          active_service_id: 16,
          active_service_name: 'Aluminio cepillado',
          planner_state: { activeFlowId: 'flow_service_16', waitingField: 'budget' }
        }
      }
    };
    const { results } = await runFlow(['Catalogo'], polluted);
    assert.equal(results[0].ncie.executionPlan.intent, 'SHOW_CATALOG');
    assert.equal(results[0].ncie.selectedService, null);
    assert.doesNotMatch(normalize(results[0].respuesta), /aluminio/);
  });

  it('16 greeting ignores polluted legacy state', async () => {
    enableCanary();
    const polluted = {
      datos_json: {
        servicio: { id: 16, nombre: 'Aluminio cepillado' },
        ncie: { active_service_name: 'Aluminio cepillado' }
      }
    };
    const { results } = await runFlow(['Hola'], polluted);
    assert.equal(results[0].ncie.executionPlan.intent, 'NEUTRAL');
    assert.doesNotMatch(normalize(results[0].respuesta), /aluminio/);
  });

  it('17 menu synonym shows catalog', async () => {
    enableCanary();
    const { results } = await runFlow(['menu']);
    assert.equal(results[0].ncie.executionPlan.intent, 'SHOW_CATALOG');
  });

  it('18 services synonym shows catalog', async () => {
    enableCanary();
    const { results } = await runFlow(['servicios']);
    assert.equal(results[0].ncie.executionPlan.intent, 'SHOW_CATALOG');
  });

  it('19 does not repeat exact design question', async () => {
    enableCanary();
    const { results } = await runFlow(['Impresion de lona', '4x1', '1000 pesos', '2000 pesos']);
    assertNoExactConsecutiveResponses(results);
    assert.match(normalize(results.at(-1).respuesta), /diseno|cotizacion/);
  });

  it('20 full quote can continue to advisor', async () => {
    enableCanary();
    const { results, contextStore } = await runFlow(['Impresion de lona', '4x1', '1000 pesos', 'Necesito apoyo con diseno', 'asesor']);
    assert.equal(lastUnified(contextStore).selectedService.nombre, 'Impresion de lona');
    assert.equal(results.at(-1).ncie.executionPlan.intent, 'HANDOFF');
    assert.equal(results.at(-1).ncie.selectedService.nombre, 'Impresion de lona');
    assert.equal(results.at(-1).ncie.advisorNotificationRequired, true);
    assertNoExactConsecutiveResponses(results);
  });
});
