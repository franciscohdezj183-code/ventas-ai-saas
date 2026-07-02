import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONVERSATION_STATES,
  EXECUTION_ACTIONS,
  ENTITY_NAMES,
  PLANNER_INTENTS,
  createConversationSnapshot,
  createConversationState,
  createExecutionPlan,
  createPlannerDecision,
  resolveQuestionPlan
} from './conversation-contracts.js';
import { extractEntities } from './entity-extractor.js';
import { normalizeIncomingMessage } from './message-normalizer.js';

const services = [
  {
    id: 1,
    nombre: 'Impresion de lona',
    descripcion: 'Impresion gran formato en lona para anuncios',
    categoria: 'Impresion',
    requiere_medidas: true
  },
  {
    id: 2,
    nombre: 'Playeras DTF',
    descripcion: 'Impresion textil personalizada',
    categoria: 'Textil'
  },
  {
    id: 3,
    nombre: 'Diseno web',
    descripcion: 'Paginas web, catalogos y pedidos en linea',
    categoria: 'Diseno'
  },
  {
    id: 4,
    nombre: 'Diseno de logotipo',
    descripcion: 'Logo e identidad visual',
    categoria: 'Diseno'
  },
  {
    id: 5,
    nombre: 'Promocionales con corte de vinil',
    descripcion: 'Articulos promocionales personalizados con corte de vinil',
    categoria: 'Promocionales',
    requiere_cantidad: true
  },
  {
    id: 6,
    nombre: 'Vinil de rotulacion de color',
    descripcion: 'Rotulacion con vinil para negocio o vehiculo',
    categoria: 'Rotulacion',
    requiere_medidas: true
  }
];

const categories = [
  { id: 1, nombre: 'Impresion' },
  { id: 2, nombre: 'Textil' },
  { id: 3, nombre: 'Diseno' }
];

function normalized(message) {
  return normalizeIncomingMessage({ message, contactName: 'Cliente', phone: '5215550000000' });
}

function extract(message, extra = {}) {
  return extractEntities({
    message: normalized(message),
    catalog: { services, categories },
    ...extra
  });
}

function entity(result, name) {
  return result.entities[name];
}

describe('conversation contracts phase 1', () => {
  it('creates the required canonical data contracts', () => {
    const stateBefore = createConversationState({
      status: CONVERSATION_STATES.INIT,
      lastQuestionId: 'quote.measurements',
      lastQuestionText: 'Me compartes las medidas aproximadas?'
    });
    const snapshot = createConversationSnapshot({
      empresaId: 1,
      conversationId: 'chat-1',
      state: stateBefore,
      activeMemory: {
        lastServiceConsulted: { id: 99, nombre: 'Servicio viejo' }
      }
    });
    const stateAfter = createConversationState({
      status: CONVERSATION_STATES.CATALOGO,
      questionHistory: ['catalog.selection']
    });
    const decision = createPlannerDecision({
      intent: PLANNER_INTENTS.SHOW_CATALOG,
      confidence: 0.94,
      reason: 'catalog_request_detected',
      entities: {},
      stateBefore: snapshot.state,
      stateAfter
    });
    const plan = createExecutionPlan({
      decisionId: 'decision-1',
      decision,
      responsePlan: { type: 'catalog_listing', questionId: 'catalog.selection' },
      persistencePlan: { saveState: true },
      actions: [EXECUTION_ACTIONS.RENDER_RESPONSE, EXECUTION_ACTIONS.PERSIST_STATE]
    });

    assert.equal(snapshot.schema, 'ConversationSnapshot');
    assert.equal(snapshot.activeMemory.lastServiceConsulted.nombre, 'Servicio viejo');
    assert.equal(decision.schema, 'PlannerDecision');
    assert.equal(plan.schema, 'ExecutionPlan');
    assert.equal(plan.intent, PLANNER_INTENTS.SHOW_CATALOG);
    assert.equal(plan.nextState, CONVERSATION_STATES.CATALOGO);
  });

  it('prevents exact repeated questions at the contract boundary', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_MEDIDAS,
      lastQuestionId: 'quote.measurements',
      lastQuestionText: 'Me compartes las medidas aproximadas?'
    });

    const question = resolveQuestionPlan({
      state,
      questionId: 'quote.measurements',
      text: 'Me compartes las medidas aproximadas?',
      variants: [
        'Que alto y ancho aproximado necesitas?',
        'Me compartes las medidas aproximadas?'
      ]
    });

    assert.equal(question.repeated, true);
    assert.equal(question.text, 'Que alto y ancho aproximado necesitas?');
  });
});

describe('central entity extractor phase 2 regressions', () => {
  it('detects full catalog requests without selecting an old service', () => {
    const result = extract('Me podrias pasar el catalogo completo?');

    assert.equal(entity(result, ENTITY_NAMES.CATALOG_REQUEST).value, true);
    assert.equal(entity(result, ENTITY_NAMES.SERVICE), undefined);
  });

  it('detects textil as a category', () => {
    const result = extract('Me interesa textil');

    assert.equal(entity(result, ENTITY_NAMES.CATEGORY).value, 'Textil');
    assert.ok(entity(result, ENTITY_NAMES.CATEGORY).confidence >= 0.8);
  });

  it('detects impresion de lona as a service', () => {
    const result = extract('Quiero una impresion de lona');

    assert.equal(entity(result, ENTITY_NAMES.SERVICE).value, 'Impresion de lona');
    assert.equal(entity(result, ENTITY_NAMES.CATEGORY), undefined);
  });

  it('detects migrated direct matcher aliases in the central extractor', () => {
    const result = extract('quiero tres piezas de promcionalesd e corte de vinil');

    assert.equal(entity(result, ENTITY_NAMES.SERVICE).value, 'Promocionales con corte de vinil');
    assert.equal(entity(result, ENTITY_NAMES.QUANTITY).value, 3);
  });

  it('keeps bare numbers ambiguous instead of forcing quantity, budget or dimensions', () => {
    const result = extract('1000');

    assert.equal(entity(result, ENTITY_NAMES.AMBIGUOUS_NUMBER).value, 1000);
    assert.equal(entity(result, ENTITY_NAMES.BUDGET), undefined);
    assert.equal(entity(result, ENTITY_NAMES.QUANTITY), undefined);
    assert.equal(entity(result, ENTITY_NAMES.DIMENSIONS), undefined);
  });

  it('detects explicit budget', () => {
    const result = extract('Tengo presupuesto de 1000 pesos');

    assert.equal(entity(result, ENTITY_NAMES.BUDGET).value, 1000);
    assert.ok(entity(result, ENTITY_NAMES.BUDGET).confidence >= 0.9);
  });

  it('detects required synonyms for manta, rotular, cuanto sale and humano', () => {
    assert.equal(entity(extract('Quiero una manta'), ENTITY_NAMES.SERVICE).value, 'Impresion de lona');
    assert.equal(entity(extract('Necesito rotular mi local'), ENTITY_NAMES.SERVICE).value, 'Vinil de rotulacion de color');
    assert.equal(entity(extract('Cuanto sale?'), ENTITY_NAMES.PRICE_REQUEST).value, true);
    assert.equal(entity(extract('Quiero hablar con un humano'), ENTITY_NAMES.ADVISOR_REQUEST).value, true);
  });

  it('supports configurable service synonyms by company', () => {
    const result = extract('Quiero el super banner', {
      companyConfig: {
        synonyms: {
          services: {
            'Impresion de lona': ['super banner']
          }
        }
      }
    });

    assert.equal(entity(result, ENTITY_NAMES.SERVICE).value, 'Impresion de lona');
    assert.equal(entity(result, ENTITY_NAMES.SERVICE).metadata.configurable, true);
  });

  it('detects measurements as dimensions, not budget', () => {
    const result = extract('Las medidas son 2x3');

    assert.equal(entity(result, ENTITY_NAMES.DIMENSIONS).value.area, 6);
    assert.equal(entity(result, ENTITY_NAMES.BUDGET), undefined);
  });

  it('detects topic-switch ingredients in the current message', () => {
    const result = extract('Mejor diseno web');

    assert.equal(entity(result, ENTITY_NAMES.SERVICE).value, 'Diseno web');
    assert.equal(entity(result, ENTITY_NAMES.SERVICE).evidence, 'web');
  });

  it('does not use activeMemory as authority', () => {
    const staleSnapshot = createConversationSnapshot({
      empresaId: 1,
      conversationId: 'chat-1',
      activeMemory: {
        lastServiceConsulted: { id: 1, nombre: 'Impresion de lona' }
      }
    });
    const result = extractEntities({
      message: normalized('Hola'),
      catalog: { services, categories },
      snapshot: staleSnapshot
    });

    assert.equal(entity(result, ENTITY_NAMES.NEUTRAL_MESSAGE).value, 'greeting');
    assert.equal(entity(result, ENTITY_NAMES.SERVICE), undefined);
  });

  it('does not revive a stale service when the customer asks for advisor', () => {
    const result = extractEntities({
      message: normalized('Me comunicas con un asesor por favor'),
      catalog: { services, categories },
      snapshot: createConversationSnapshot({
        empresaId: 1,
        conversationId: 'chat-1',
        activeMemory: {
          lastServiceConsulted: { id: 1, nombre: 'Impresion de lona' }
        }
      })
    });

    assert.equal(entity(result, ENTITY_NAMES.ADVISOR_REQUEST).value, true);
    assert.equal(entity(result, ENTITY_NAMES.SERVICE), undefined);
  });
});
