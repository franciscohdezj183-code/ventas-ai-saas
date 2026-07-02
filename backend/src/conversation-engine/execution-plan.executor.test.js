import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONVERSATION_STATES,
  PLANNER_INTENTS,
  createConversationSnapshot,
  createConversationState
} from './conversation-contracts.js';
import { extractEntities } from './entity-extractor.js';
import { executeExecutionPlan } from './execution-plan.executor.js';
import { normalizeIncomingMessage } from './message-normalizer.js';
import { planConversation } from './unified-conversation-planner.js';

const catalogHints = {
  services: [
    {
      id: 1,
      nombre: 'Impresion de lona',
      descripcion: 'Impresion gran formato',
      categoria: 'Impresion',
      precio: 390,
      tipo_precio: 'POR_M2',
      unidad_medida: 'm2',
      requiere_medidas: true
    },
    {
      id: 2,
      nombre: 'Playeras DTF',
      descripcion: 'Impresion textil personalizada',
      categoria: 'Textil',
      tipo_precio: 'COTIZACION'
    },
    {
      id: 3,
      nombre: 'Bordado textil',
      descripcion: 'Bordado para uniformes',
      categoria: 'Textil',
      tipo_precio: 'COTIZACION'
    },
    {
      id: 4,
      nombre: 'Diseno web',
      descripcion: 'Paginas web',
      categoria: 'Diseno',
      tipo_precio: 'COTIZACION'
    },
    {
      id: 5,
      nombre: 'Tarjetas digitales laminado mate 100 pzs',
      descripcion: 'Tarjetas digitales laminado mate para negocios',
      categoria: 'Impresion',
      precio: 297,
      tipo_precio: 'POR_PAQUETE',
      requiere_cantidad: true
    }
  ],
  categories: [
    { id: 1, nombre: 'Impresion' },
    { id: 2, nombre: 'Textil' },
    { id: 3, nombre: 'Diseno' }
  ]
};

function normalized(message) {
  return normalizeIncomingMessage({ message, contactName: 'Cliente', phone: '5215550000000' });
}

function planFor(message, snapshot = createConversationSnapshot({ empresaId: 1, conversationId: 'chat-1' }), companyConfig = { nombre: 'Demo' }) {
  const messageObject = normalized(message);
  const entities = extractEntities({ message: messageObject, catalog: catalogHints });
  return planConversation({
    message: messageObject,
    entities,
    conversationSnapshot: snapshot,
    catalogHints,
    companyConfig
  });
}

describe('execution plan executor phase 4 sandbox', () => {
  it('renders catalog text when Planner says list catalog', async () => {
    const executionPlan = planFor('Catalogo completo');
    const result = await executeExecutionPlan({ executionPlan });

    assert.equal(executionPlan.intent, PLANNER_INTENTS.SHOW_CATALOG);
    assert.match(result.responseText, /servicios disponibles/i);
    assert.match(result.responseText, /Impresion de lona/);
    assert.match(result.responseText, /Playeras DTF/);
  });

  it('executes category retrieval and renders textil options', async () => {
    const executionPlan = planFor('Me interesa textil');
    const retrievalCalls = [];
    const result = await executeExecutionPlan({
      executionPlan,
      retrievalAdapter: async (retrievalPlan) => {
        retrievalCalls.push(retrievalPlan);
        return {
          services: catalogHints.services.filter((service) => service.categoria === 'Textil')
        };
      }
    });

    assert.equal(executionPlan.intent, PLANNER_INTENTS.SHOW_CATEGORY);
    assert.equal(retrievalCalls.length, 1);
    assert.deepEqual(retrievalCalls[0].queries, ['Textil']);
    assert.match(result.responseText, /En Textil/i);
    assert.match(result.responseText, /Playeras DTF/);
    assert.match(result.responseText, /Bordado textil/);
  });

  it('preserves service and asks measurements when Planner says quote lona', async () => {
    const executionPlan = planFor('Quiero una impresion de lona');
    const result = await executeExecutionPlan({ executionPlan });

    assert.equal(executionPlan.intent, PLANNER_INTENTS.START_SERVICE_QUOTE);
    assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
    assert.equal(result.stateToPersist.selectedService.nombre, 'Impresion de lona');
    assert.equal(result.stateToPersist.status, CONVERSATION_STATES.ESPERANDO_MEDIDAS);
    assert.match(result.responseText, /Impresion de lona/);
    assert.match(result.responseText, /medidas/i);
  });

  it('renders availability confirmation for direct service availability questions', async () => {
    const executionPlan = planFor('tarjetas digitales, las manejas?', undefined, { nombre: 'Demo', emojiMode: 'none' });
    const result = await executeExecutionPlan({ executionPlan });

    assert.equal(executionPlan.intent, PLANNER_INTENTS.START_SERVICE_QUOTE);
    assert.equal(executionPlan.selectedService.nombre, 'Tarjetas digitales laminado mate 100 pzs');
    assert.match(result.responseText, /^Sí, manejamos Tarjetas digitales laminado mate 100 pzs\. Cuantas piezas necesitas\?/);
  });

  it('generates notification when Planner says handoff', async () => {
    const executionPlan = planFor('Me comunicas con un asesor por favor');
    const result = await executeExecutionPlan({
      executionPlan,
      handoffAdapter: async (handoffPlan) => ({
        type: 'handoff',
        reason: handoffPlan.reason,
        payload: handoffPlan.payload
      })
    });

    assert.equal(executionPlan.intent, PLANNER_INTENTS.HANDOFF);
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].type, 'handoff');
    assert.equal(result.notifications[0].payload.selectedService, null);
    assert.match(result.responseText, /asesor/i);
  });

  it('returns the exact state requested by persistencePlan', async () => {
    const executionPlan = planFor('Quiero una impresion de lona');
    const persisted = [];
    const result = await executeExecutionPlan({
      executionPlan,
      persistenceAdapter: async (plan) => {
        persisted.push(plan.stateAfter);
      }
    });

    assert.deepEqual(result.stateToPersist, executionPlan.persistencePlan.stateAfter);
    assert.deepEqual(persisted[0], executionPlan.persistencePlan.stateAfter);
  });

  it('does not modify nextState or selectedService', async () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_MEDIDAS,
      selectedService: catalogHints.services[0],
      activeFlow: { selectedService: catalogHints.services[0], collectedEntities: {} }
    });
    const executionPlan = planFor('2x3', createConversationSnapshot({
      empresaId: 1,
      conversationId: 'chat-1',
      state
    }));
    const beforeNextState = executionPlan.nextState;
    const beforeSelectedService = JSON.stringify(executionPlan.selectedService);

    await executeExecutionPlan({ executionPlan });

    assert.equal(executionPlan.nextState, beforeNextState);
    assert.equal(JSON.stringify(executionPlan.selectedService), beforeSelectedService);
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.ESPERANDO_DISENO);
  });

  it('applies emojiMode none, professional and friendly', async () => {
    const none = await executeExecutionPlan({ executionPlan: planFor('Catalogo completo', undefined, { nombre: 'Demo', emojiMode: 'none' }) });
    const professional = await executeExecutionPlan({ executionPlan: planFor('Catalogo completo', undefined, { nombre: 'Demo', emojiMode: 'professional' }) });
    const friendly = await executeExecutionPlan({ executionPlan: planFor('Catalogo completo', undefined, { nombre: 'Demo', emojiMode: 'friendly' }) });

    assert.doesNotMatch(none.responseText, /[📋✅🤝💡🧾]/u);
    assert.match(professional.responseText, /📋/u);
    assert.match(friendly.responseText, /📋/u);
  });

  it('renders a structured quote summary for lona with measurements, budget, design and installation', async () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_DISENO,
      selectedService: catalogHints.services[0],
      activeFlow: {
        selectedService: catalogHints.services[0],
        collectedEntities: {
          dimensions: { width: 2, height: 3, area: 6, text: '2x3' },
          budget: 1000
        }
      },
      collectedEntities: {
        dimensions: { width: 2, height: 3, area: 6, text: '2x3' },
        budget: 1000
      }
    });
    const executionPlan = planFor('ya tengo el diseno y con instalacion', createConversationSnapshot({
      empresaId: 1,
      conversationId: 'chat-1',
      state
    }), { nombre: 'Demo', emojiMode: 'none' });
    const result = await executeExecutionPlan({ executionPlan });

    assert.equal(executionPlan.responsePlan.type, 'quote_summary');
    assert.match(result.responseText, /Resumen:/);
    assert.match(result.responseText, /Servicio: Impresion de lona/);
    assert.match(result.responseText, /Medidas\/cantidad: 2x3/);
    assert.match(result.responseText, /Presupuesto: \$1,000/);
    assert.match(result.responseText, /Diseno: Ya tiene diseno/);
    assert.match(result.responseText, /Instalacion: Revisar instalacion/);
    assert.match(result.responseText, /Estimado: \$2,340/);
    assert.match(result.responseText, /Siguiente paso:/);
  });
});
