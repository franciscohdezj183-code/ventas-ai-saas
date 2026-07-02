import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONVERSATION_STATES,
  ENTITY_NAMES,
  PLANNER_INTENTS,
  createConversationSnapshot,
  createConversationState
} from './conversation-contracts.js';
import { extractEntities } from './entity-extractor.js';
import { normalizeIncomingMessage } from './message-normalizer.js';
import { planConversation } from './unified-conversation-planner.js';

const catalogHints = {
  services: [
    {
      id: 1,
      nombre: 'Impresion de lona',
      descripcion: 'Impresion gran formato en lona',
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
      nombre: 'Diseno web',
      descripcion: 'Paginas web, catalogos y pedidos en linea',
      categoria: 'Diseno',
      tipo_precio: 'COTIZACION'
    },
    {
      id: 4,
      nombre: 'Diseno de logotipo',
      descripcion: 'Logo e identidad visual',
      categoria: 'Diseno',
      tipo_precio: 'COTIZACION'
    },
    {
      id: 5,
      nombre: 'Tarjetas de presentacion',
      descripcion: 'Tarjetas impresas para negocios',
      categoria: 'Impresion',
      tipo_precio: 'POR_UNIDAD',
      requiere_cantidad: true
    },
    {
      id: 55,
      nombre: 'Tarjetas digitales laminado mate 100 pzs',
      descripcion: 'Tarjetas digitales laminado mate para negocios',
      categoria: 'Impresion',
      precio: 297,
      tipo_precio: 'POR_PAQUETE',
      requiere_cantidad: true
    },
    {
      id: 6,
      nombre: 'Vinil impreso',
      descripcion: 'Impresion de vinil para anuncios y rotulos',
      categoria: 'Impresion',
      tipo_precio: 'COTIZACION',
      requiere_medidas: true
    },
    {
      id: 66,
      nombre: 'Impresion textil con vinil textil',
      descripcion: 'Vinil textil para playeras y ropa',
      categoria: 'Textil',
      tipo_precio: 'COTIZACION',
      requiere_cantidad: true
    },
    {
      id: 7,
      nombre: 'Menus para restaurante',
      descripcion: 'Menus impresos para restaurante y cafeteria',
      categoria: 'Impresion',
      precio: 850,
      tipo_precio: 'POR_UNIDAD',
      requiere_cantidad: true
    },
    {
      id: 8,
      nombre: 'Rotulacion de consultorio',
      descripcion: 'Vinil de rotulacion para consultorios, veterinarias y fachadas',
      categoria: 'Senaletica',
      tipo_precio: 'COTIZACION',
      requiere_medidas: true
    },
    {
      id: 9,
      nombre: 'Branding premium',
      descripcion: 'Identidad corporativa y branding premium',
      categoria: 'Diseno',
      tipo_precio: 'COTIZACION'
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

function entitiesFor(message) {
  const messageObject = normalized(message);
  return {
    message: messageObject,
    entities: extractEntities({ message: messageObject, catalog: catalogHints })
  };
}

function plan(message, snapshot = createConversationSnapshot({ empresaId: 1, conversationId: 'chat-1' })) {
  const input = entitiesFor(message);
  return planConversation({
    message: input.message,
    entities: input.entities,
    conversationSnapshot: snapshot,
    catalogHints,
    companyConfig: { nombre: 'Demo' }
  });
}

function planWithConfig(message, companyConfig, snapshot = createConversationSnapshot({ empresaId: 1, conversationId: 'chat-1' })) {
  const input = entitiesFor(message);
  return planConversation({
    message: input.message,
    entities: input.entities,
    conversationSnapshot: snapshot,
    catalogHints,
    companyConfig
  });
}

function planWithSemantic(message, semanticHints, snapshot = createConversationSnapshot({ empresaId: 1, conversationId: 'chat-1' })) {
  const input = entitiesFor(message);
  return planConversation({
    message: input.message,
    entities: input.entities,
    semanticHints,
    conversationSnapshot: snapshot,
    catalogHints,
    companyConfig: { nombre: 'Demo' }
  });
}

function snapshotWithState(state) {
  return createConversationSnapshot({
    empresaId: 1,
    conversationId: 'chat-1',
    state
  });
}

function summaryState(service = catalogHints.services[0]) {
  return createConversationState({
    status: CONVERSATION_STATES.RESUMEN,
    selectedService: service,
    activeFlow: {
      selectedService: service,
      collectedEntities: {
        dimensions: { width: 2, height: 3, area: 6, text: '2x3' },
        budget: 1000,
        design: false
      }
    },
    collectedEntities: {
      dimensions: { width: 2, height: 3, area: 6, text: '2x3' },
      budget: 1000,
      design: false
    },
    lastQuestionId: 'quote.summary',
    lastQuestionText: `Tengo listo el resumen para ${service.nombre}. Quieres que lo revise un asesor?`
  });
}

describe('unified conversation planner phase 3', () => {
  it('returns an ExecutionPlan for full catalog and does not select stale service', () => {
    const snapshot = createConversationSnapshot({
      empresaId: 1,
      conversationId: 'chat-1',
      state: createConversationState({
        status: CONVERSATION_STATES.ESPERANDO_MEDIDAS,
        selectedService: catalogHints.services[0],
        activeFlow: { selectedService: catalogHints.services[0] }
      }),
      activeMemory: {
        lastServiceConsulted: catalogHints.services[0]
      }
    });

    const executionPlan = plan('Catalogo completo', snapshot);

    assert.equal(executionPlan.schema, 'ExecutionPlan');
    assert.equal(executionPlan.intent, PLANNER_INTENTS.SHOW_CATALOG);
    assert.equal(executionPlan.selectedService, null);
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.CATALOGO);
    assert.equal(executionPlan.responsePlan.type, 'catalog_listing');
    assert.equal(executionPlan.persistencePlan.activeMemoryUpdate.mode, 'useful_only');
    assert.equal(executionPlan.persistencePlan.activeMemoryUpdate.preferredServices, undefined);
  });

  it('detects natural services request as catalog listing', () => {
    const executionPlan = plan('¿puedes mostrarme tus servicios?');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.SHOW_CATALOG);
    assert.equal(executionPlan.responsePlan.type, 'catalog_listing');
    assert.equal(executionPlan.selectedService, null);
  });

  it('uses semantic hints for catalog requests the extractor cannot classify', () => {
    for (const message of ['Que manejan?', 'Que ofrecen?']) {
      const executionPlan = planWithSemantic(message, {
        intent: 'SHOW_CATALOG',
        confidence: 0.95,
        entities: {
          businessType: null,
          businessGoal: null,
          budget: null,
          currency: null,
          catalogRequest: true,
          advisorRequest: false
        },
        explanation: 'Pide catalogo.'
      });

      assert.equal(executionPlan.intent, PLANNER_INTENTS.SHOW_CATALOG);
      assert.equal(executionPlan.nextState, CONVERSATION_STATES.CATALOGO);
      assert.equal(executionPlan.entities[ENTITY_NAMES.CATALOG_REQUEST].source, 'semantic-intent-classifier');
    }
  });

  it('plans category listing for textil without choosing an arbitrary service', () => {
    const executionPlan = plan('Me interesa textil');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.SHOW_CATEGORY);
    assert.equal(executionPlan.selectedCategory, 'Textil');
    assert.equal(executionPlan.selectedService, null);
    assert.equal(executionPlan.retrievalPlan.needed, true);
    assert.deepEqual(executionPlan.retrievalPlan.queries, ['Textil']);
  });

  it('starts impresion de lona quote and asks for measurements', () => {
    const executionPlan = plan('Quiero una impresion de lona');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.START_SERVICE_QUOTE);
    assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.ESPERANDO_MEDIDAS);
    assert.equal(executionPlan.responsePlan.questionId, 'quote.measurements');
    assert.match(executionPlan.responsePlan.question, /medidas/i);
  });

  it('keeps bare numbers ambiguous and asks for clarification', () => {
    const executionPlan = plan('1000');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.CLARIFY);
    assert.equal(executionPlan.reason, 'ambiguous_number_requires_clarification');
    assert.equal(executionPlan.entities[ENTITY_NAMES.AMBIGUOUS_NUMBER].value, 1000);
    assert.match(executionPlan.responsePlan.question, /cantidad, presupuesto o una medida/i);
  });

  it('continues active quote when measurements answer the previous state', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_MEDIDAS,
      selectedService: catalogHints.services[0],
      activeFlow: { selectedService: catalogHints.services[0], collectedEntities: {} },
      lastQuestionId: 'quote.measurements',
      lastQuestionText: 'Me compartes las medidas aproximadas?'
    });
    const executionPlan = plan('2x3', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
    assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
    assert.equal(executionPlan.stateAfter.collectedEntities.dimensions.area, 6);
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.ESPERANDO_DISENO);
    assert.equal(executionPlan.responsePlan.questionId, 'quote.design');
  });

  it('continues budget state only when budget evidence exists', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_PRESUPUESTO,
      selectedService: catalogHints.services[2],
      activeFlow: { selectedService: catalogHints.services[2], collectedEntities: {} },
      lastQuestionId: 'quote.budget',
      lastQuestionText: 'Con que presupuesto aproximado quieres empezar?'
    });
    const executionPlan = plan('1000 pesos', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
    assert.equal(executionPlan.selectedService.nombre, 'Diseno web');
    assert.equal(executionPlan.stateAfter.collectedEntities.budget, 1000);
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.RESUMEN);
  });

  it('treats bare number as budget when current state expects budget', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_PRESUPUESTO,
      selectedService: catalogHints.services[2],
      activeFlow: { selectedService: catalogHints.services[2], collectedEntities: {} },
      lastQuestionId: 'quote.budget',
      lastQuestionText: 'Con que presupuesto aproximado quieres empezar?'
    });
    const executionPlan = plan('10000', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
    assert.equal(executionPlan.reason, 'message_answers_expected_state');
    assert.equal(executionPlan.entities[ENTITY_NAMES.BUDGET].value, 10000);
    assert.equal(executionPlan.stateAfter.collectedEntities.budget, 10000);
    assert.notEqual(executionPlan.nextState, CONVERSATION_STATES.INIT);
    assert.notEqual(executionPlan.reason, 'ambiguous_number_requires_clarification');
  });

  it('keeps pesos budget in budget state', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_PRESUPUESTO,
      selectedService: catalogHints.services[2],
      activeFlow: { selectedService: catalogHints.services[2], collectedEntities: {} }
    });
    const executionPlan = plan('10000 pesos', snapshotWithState(state));

    assert.equal(executionPlan.stateAfter.collectedEntities.budget, 10000);
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.RESUMEN);
  });

  it('keeps flow and asks currency confirmation for EUR budget clarification', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_PRESUPUESTO,
      selectedService: catalogHints.services[2],
      activeFlow: {
        selectedService: catalogHints.services[2],
        collectedEntities: { budget: 10000 }
      },
      collectedEntities: { budget: 10000 }
    });
    const executionPlan = plan('Es mi presupuesto en euros', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
    assert.equal(executionPlan.reason, 'budget_currency_requires_confirmation');
    assert.equal(executionPlan.stateAfter.collectedEntities.budget, 10000);
    assert.equal(executionPlan.stateAfter.collectedEntities.budgetCurrency, 'EUR');
    assert.notEqual(executionPlan.nextState, CONVERSATION_STATES.INIT);
    assert.match(executionPlan.responsePlan.question, /presupuesto aproximado en euros/);
  });

  it('keeps budget flow and asks currency confirmation for USD budget', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_PRESUPUESTO,
      selectedService: catalogHints.services[2],
      activeFlow: {
        selectedService: catalogHints.services[2],
        collectedEntities: {}
      },
      collectedEntities: {}
    });
    const executionPlan = plan('123456789 dolares', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
    assert.equal(executionPlan.reason, 'budget_currency_requires_confirmation');
    assert.equal(executionPlan.stateAfter.collectedEntities.budget, 123456789);
    assert.equal(executionPlan.stateAfter.collectedEntities.budgetCurrency, 'USD');
    assert.notEqual(executionPlan.nextState, CONVERSATION_STATES.INIT);
    assert.match(executionPlan.responsePlan.question, /presupuesto aproximado en d[oó]lares/i);
  });

  it('switches topic from lona to diseno web and closes previous flow', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_MEDIDAS,
      selectedService: catalogHints.services[0],
      activeFlow: {
        id: 'flow_service_1',
        status: 'active',
        selectedService: catalogHints.services[0],
        collectedEntities: {}
      },
      lastQuestionId: 'quote.measurements',
      lastQuestionText: 'Me compartes las medidas aproximadas?'
    });

    const executionPlan = plan('Mejor diseno web', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.TOPIC_SWITCH);
    assert.equal(executionPlan.selectedService.nombre, 'Diseno web');
    assert.equal(executionPlan.stateAfter.activeFlow.previousFlow.closeReason, 'topic_switch');
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.ESPERANDO_PRESUPUESTO);
    assert.equal(executionPlan.stateAfter.collectedEntities.dimensions, undefined);
  });

  it('does not use activeMemory as authority for greetings', () => {
    const snapshot = createConversationSnapshot({
      empresaId: 1,
      conversationId: 'chat-1',
      state: createConversationState({ status: CONVERSATION_STATES.INIT }),
      activeMemory: {
        lastServiceConsulted: catalogHints.services[0]
      }
    });

    const executionPlan = plan('Hola', snapshot);

    assert.equal(executionPlan.intent, PLANNER_INTENTS.NEUTRAL);
    assert.equal(executionPlan.selectedService, null);
    assert.equal(executionPlan.reason, 'neutral_message_has_priority_over_memory');
  });

  it('uses configured welcome message for greeting and presentation', () => {
    for (const message of ['Hola, buena tarde, mi nombre es Russel', 'hola, buena tarde']) {
      const executionPlan = planWithConfig(message, {
        nombre: 'Demo',
        greetingMessage: 'Bienvenido a Demo. Te ayudo a cotizar.'
      });

      assert.equal(executionPlan.intent, PLANNER_INTENTS.NEUTRAL);
      assert.equal(executionPlan.reason, 'neutral_message_has_priority_over_memory');
      assert.equal(executionPlan.responsePlan.type, 'neutral_message');
      assert.equal(executionPlan.responsePlan.question, 'Bienvenido a Demo. Te ayudo a cotizar.');
      assert.notEqual(executionPlan.intent, PLANNER_INTENTS.CLARIFY);
    }
  });

  it('creates handoff plan without reviving old service', () => {
    const snapshot = createConversationSnapshot({
      empresaId: 1,
      conversationId: 'chat-1',
      state: createConversationState({ status: CONVERSATION_STATES.INIT }),
      activeMemory: {
        lastServiceConsulted: catalogHints.services[0]
      }
    });

    const executionPlan = plan('Me comunicas con un asesor por favor', snapshot);

    assert.equal(executionPlan.intent, PLANNER_INTENTS.HANDOFF);
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.ASESOR);
    assert.equal(executionPlan.handoffPlan.needed, true);
    assert.equal(executionPlan.handoffPlan.payload.selectedService, null);
    assert.equal(executionPlan.selectedService, null);
  });

  it('accepts advisor confirmation after quote summary', () => {
    const state = summaryState();
    const executionPlan = plan('Si', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.HANDOFF);
    assert.equal(executionPlan.reason, 'advisor_confirmation_accepted');
    assert.equal(executionPlan.handoffPlan.needed, true);
    assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
  });

  it('accepts composed positive confirmation after quote summary', () => {
    for (const message of ['si, gracias', 'sí gracias', 'claro, por favor']) {
      const executionPlan = plan(message, snapshotWithState(summaryState()));

      assert.equal(executionPlan.intent, PLANNER_INTENTS.HANDOFF);
      assert.equal(executionPlan.reason, 'advisor_confirmation_accepted');
      assert.equal(executionPlan.handoffPlan.needed, true);
      assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
      assert.equal(executionPlan.nextState, CONVERSATION_STATES.ASESOR);
      assert.equal(executionPlan.entities[ENTITY_NAMES.CONFIRMATION].value, true);
    }
  });

  it('accepts natural affirmative phrases after quote summary', () => {
    for (const message of ['por supuesto', 'afirmativo']) {
      const executionPlan = plan(message, snapshotWithState(summaryState()));

      assert.equal(executionPlan.intent, PLANNER_INTENTS.HANDOFF);
      assert.equal(executionPlan.reason, 'advisor_confirmation_accepted');
      assert.equal(executionPlan.handoffPlan.needed, true);
      assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
    }
  });

  it('declines advisor politely after quote summary without handoff', () => {
    const executionPlan = plan('no gracias', snapshotWithState(summaryState()));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.NEUTRAL);
    assert.equal(executionPlan.reason, 'advisor_confirmation_declined');
    assert.equal(executionPlan.handoffPlan.needed, false);
    assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.FINALIZADO);
    assert.equal(executionPlan.responsePlan.type, 'quote_declined');
  });

  it('does not duplicate handoff once advisor is already pending', () => {
    const base = summaryState();
    const state = createConversationState({
      ...base,
      status: CONVERSATION_STATES.ASESOR,
      collectedEntities: {
        ...base.collectedEntities,
        handoffSentForSummary: true
      }
    });

    for (const message of ['esperare al asesor', 'Claro']) {
      const executionPlan = plan(message, snapshotWithState(state));

      assert.equal(executionPlan.intent, PLANNER_INTENTS.NEUTRAL);
      assert.equal(executionPlan.reason, 'advisor_handoff_already_pending');
      assert.equal(executionPlan.handoffPlan.needed, false);
      assert.equal(executionPlan.nextState, CONVERSATION_STATES.ASESOR);
      assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
    }
  });

  it('continues active service from summary or advisor state', () => {
    const summary = plan('seguimos', snapshotWithState(summaryState()));
    const advisorState = createConversationState({
      ...summaryState(),
      status: CONVERSATION_STATES.ASESOR
    });
    const advisor = plan('sí seguimos', snapshotWithState(advisorState));

    assert.equal(summary.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
    assert.equal(summary.reason, 'customer_requested_continue_active_service');
    assert.equal(summary.selectedService.nombre, 'Impresion de lona');
    assert.notEqual(summary.nextState, CONVERSATION_STATES.INIT);
    assert.equal(advisor.selectedService.nombre, 'Impresion de lona');
    assert.notEqual(advisor.nextState, CONVERSATION_STATES.INIT);
  });

  it('keeps active service when customer says ya te lo dije', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.RESUMEN,
      selectedService: catalogHints.services[0],
      activeFlow: { selectedService: catalogHints.services[0], collectedEntities: { budget: 1000 } },
      collectedEntities: { budget: 1000 }
    });
    const executionPlan = plan('Ya te lo dije', snapshotWithState(state));

    assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
    assert.equal(executionPlan.reason, 'repeated_info_reference_with_active_service');
    assert.match(executionPlan.responsePlan.question, /Si, tengo registrado: Impresion de lona/);
    assert.match(executionPlan.responsePlan.question, /asesor|ajustar/);
    assert.notEqual(executionPlan.nextState, CONVERSATION_STATES.INIT);
  });

  it('handles composed service quote with service, dimensions, quantity and budget', () => {
    const executionPlan = plan('Quiero una impresion de vinil, de 10x2.3, quiero 4 piezas, presupuesto de 100000 pesos');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.START_SERVICE_QUOTE);
    assert.equal(executionPlan.selectedService.nombre, 'Vinil impreso');
    assert.equal(executionPlan.stateAfter.collectedEntities.dimensions.width, 10);
    assert.equal(executionPlan.stateAfter.collectedEntities.dimensions.height, 2.3);
    assert.equal(executionPlan.stateAfter.collectedEntities.quantity, 4);
    assert.equal(executionPlan.stateAfter.collectedEntities.budget, 100000);
    assert.notEqual(executionPlan.reason, 'dimensions_without_service');
  });

  it('keeps active lona quote when customer asks for design support', () => {
    const service = catalogHints.services[0];
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_DISENO,
      selectedService: service,
      activeFlow: {
        selectedService: service,
        collectedEntities: {
          dimensions: { width: 2, height: 3, area: 6, text: '2x3' }
        }
      },
      collectedEntities: {
        dimensions: { width: 2, height: 3, area: 6, text: '2x3' }
      },
      lastQuestionId: 'quote.design',
      lastQuestionText: 'Ya tienes el diseno o quieres que tambien te apoyemos con eso?'
    });

    for (const message of ['qquiero tambien un diseño', 'necesito apoyo con diseño', 'no tengo diseño']) {
      const executionPlan = plan(message, snapshotWithState(state));

      assert.equal(executionPlan.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
      assert.equal(executionPlan.reason, 'design_support_answered_active_quote');
      assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
      assert.notEqual(executionPlan.selectedService.nombre, 'Diseno de logotipo');
      assert.equal(executionPlan.stateAfter.collectedEntities.design, true);
    }
  });

  it('treats bare number as quantity when current state expects quantity', () => {
    const service = catalogHints.services[4];
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_CANTIDAD,
      selectedService: service,
      activeFlow: { selectedService: service, collectedEntities: {} },
      lastQuestionId: 'quote.quantity',
      lastQuestionText: 'Cuantas piezas necesitas?'
    });
    const executionPlan = plan('345', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
    assert.equal(executionPlan.stateAfter.collectedEntities.quantity, 345);
    assert.equal(executionPlan.entities[ENTITY_NAMES.QUANTITY].value, 345);
    assert.notEqual(executionPlan.reason, 'ambiguous_number_requires_clarification');
  });

  it('uses previous ambiguous number when customer clarifies it is quantity', () => {
    const service = catalogHints.services[4];
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_CANTIDAD,
      selectedService: service,
      activeFlow: {
        selectedService: service,
        collectedEntities: { ambiguousNumber: 345 }
      },
      collectedEntities: { ambiguousNumber: 345 },
      lastQuestionId: 'clarify.number',
      lastQuestionText: 'Ese numero es cantidad, presupuesto o una medida?'
    });
    const executionPlan = plan('es la cantidad de piezas', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
    assert.equal(executionPlan.stateAfter.collectedEntities.quantity, 345);
    assert.equal(executionPlan.entities[ENTITY_NAMES.QUANTITY].value, 345);
  });

  it('prefers printed vinyl over textile vinyl for impresion de vinil', () => {
    const executionPlan = plan('impresion de vinil');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.START_SERVICE_QUOTE);
    assert.equal(executionPlan.selectedService.nombre, 'Vinil impreso');
  });

  it('starts tarjetas digitales quote directly from availability question', () => {
    const executionPlan = plan('tarjetas digitales, las manejas?');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.START_SERVICE_QUOTE);
    assert.equal(executionPlan.selectedService.nombre, 'Tarjetas digitales laminado mate 100 pzs');
    assert.equal(executionPlan.responsePlan.availabilityConfirmation, true);
    assert.match(executionPlan.responsePlan.question, /Cuantas piezas necesitas/);
  });

  it('estimates package products by package count instead of raw pieces', () => {
    const service = catalogHints.services.find((entry) => entry.nombre === 'Tarjetas digitales laminado mate 100 pzs');
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_CANTIDAD,
      selectedService: service,
      activeFlow: { selectedService: service, collectedEntities: {} },
      lastQuestionId: 'quote.quantity',
      lastQuestionText: 'Cuantas piezas necesitas?'
    });
    const executionPlan = plan('200 piezas', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
    assert.equal(executionPlan.stateAfter.collectedEntities.quantity, 200);
    assert.equal(executionPlan.responsePlan.type, 'quote_summary');
    assert.equal(executionPlan.responsePlan.quoteSummary.estimate, '$594.00');
  });

  it('asks to confirm exaggerated dimensions before estimating', () => {
    const service = catalogHints.services[0];
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_MEDIDAS,
      selectedService: service,
      activeFlow: { selectedService: service, collectedEntities: {} },
      lastQuestionId: 'quote.measurements',
      lastQuestionText: 'Me compartes las medidas aproximadas?'
    });
    const executionPlan = plan('12345 x 123 metros', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.CONFIRM_DIMENSIONS);
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.CONFIRM_DIMENSIONS);
    assert.equal(executionPlan.responsePlan.type, 'clarify_need');
    assert.match(executionPlan.responsePlan.question, /12345 x 123 metros/);
    assert.equal(executionPlan.responsePlan.quoteSummary, undefined);
  });

  it('asks to confirm exaggerated budget without generating summary', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_PRESUPUESTO,
      selectedService: catalogHints.services[2],
      activeFlow: { selectedService: catalogHints.services[2], collectedEntities: {} },
      lastQuestionId: 'quote.budget',
      lastQuestionText: 'Con que presupuesto aproximado quieres empezar?'
    });
    const executionPlan = plan('10000000000000 pesos', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.CLARIFY);
    assert.equal(executionPlan.reason, 'budget_amount_requires_confirmation');
    assert.equal(executionPlan.selectedService.nombre, 'Diseno web');
    assert.equal(executionPlan.nextState, CONVERSATION_STATES.ESPERANDO_PRESUPUESTO);
    assert.equal(executionPlan.responsePlan.type, 'budget_amount_confirmation');
    assert.match(executionPlan.responsePlan.question, /\$10,000,000,000,000\.00 MXN/);
    assert.notEqual(executionPlan.responsePlan.type, 'quote_summary');
  });

  it('answers consultative next-step questions with active service context', () => {
    const executionPlan = plan('que mas necesito', snapshotWithState(summaryState()));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.RECOMMENDATION);
    assert.equal(executionPlan.reason, 'consultative_next_step_with_active_service');
    assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
    assert.match(executionPlan.responsePlan.question, /Con lo que llevamos/);
    assert.doesNotMatch(executionPlan.responsePlan.question, /producto.*mente/i);
  });

  it('does not repeat the exact same question', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.INIT,
      lastQuestionId: 'quote.measurements',
      lastQuestionText: 'Me compartes las medidas aproximadas?'
    });

    const executionPlan = plan('Quiero una impresion de lona', snapshotWithState(state));

    assert.equal(executionPlan.responsePlan.questionId, 'quote.measurements');
    assert.equal(executionPlan.responsePlan.repeatedQuestion, true);
    assert.equal(executionPlan.responsePlan.question, 'Que alto y ancho aproximado necesitas?');
  });

  it('plans MCP recommendation without selecting a service', () => {
    const executionPlan = plan('No se que necesito, que me recomiendas?');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.RECOMMENDATION);
    assert.equal(executionPlan.selectedService, null);
    assert.equal(executionPlan.mcpPlan.needed, true);
    assert.deepEqual(executionPlan.mcpPlan.tools, ['recommend_services']);
    assert.equal(executionPlan.responsePlan.type, 'recommendation_question');
    assert.equal(executionPlan.responsePlan.questionId, 'recommendation.business_type');
    assert.match(executionPlan.responsePlan.question, /tipo de negocio/i);
  });

  it('uses semantic hints for business type, business goal and recommendation requests', () => {
    const businessType = planWithSemantic('Tengo una cafeteria', {
      intent: 'PROVIDE_BUSINESS_TYPE',
      confidence: 0.94,
      entities: {
        businessType: 'cafeteria',
        businessGoal: null,
        budget: null,
        currency: null,
        catalogRequest: false,
        advisorRequest: false
      },
      explanation: 'El cliente informa su giro.'
    });
    const businessGoal = planWithSemantic('Mi objetivo es crecer', {
      intent: 'PROVIDE_BUSINESS_GOAL',
      confidence: 0.94,
      entities: {
        businessType: null,
        businessGoal: 'atraer_clientes',
        budget: null,
        currency: null,
        catalogRequest: false,
        advisorRequest: false
      },
      explanation: 'El cliente informa objetivo comercial.'
    });

    assert.equal(businessType.intent, PLANNER_INTENTS.RECOMMENDATION);
    assert.equal(businessType.stateAfter.collectedEntities.businessType, 'cafeteria');
    assert.equal(businessGoal.intent, PLANNER_INTENTS.RECOMMENDATION);
    assert.equal(businessGoal.stateAfter.collectedEntities.objective, 'atraer_clientes');

    for (const message of ['No se que necesito', 'Necesito algo para promocionarme', 'Que me recomiendas?']) {
      const executionPlan = planWithSemantic(message, {
        intent: 'REQUEST_RECOMMENDATION',
        confidence: 0.95,
        entities: {
          businessType: null,
          businessGoal: null,
          budget: null,
          currency: null,
          catalogRequest: false,
          advisorRequest: false
        },
        explanation: 'Pide recomendacion.'
      });

      assert.equal(executionPlan.intent, PLANNER_INTENTS.RECOMMENDATION);
      assert.equal(executionPlan.selectedService, null);
    }
  });

  it('uses auxiliary semantic hint to confirm dimensions unit without dropping active service', () => {
    const service = catalogHints.services[0];
    const state = createConversationState({
      status: CONVERSATION_STATES.CONFIRM_DIMENSIONS,
      selectedService: service,
      activeFlow: {
        selectedService: service,
        collectedEntities: {
          dimensions: { width: 12345, height: 123, area: 1518435, text: '12345 x 123' }
        }
      },
      collectedEntities: {
        dimensions: { width: 12345, height: 123, area: 1518435, text: '12345 x 123' }
      },
      lastQuestionId: 'quote.confirm_dimensions',
      lastQuestionText: 'Solo para confirmar, las medidas son 12345 x 123 metros o quisiste decir centimetros?'
    });

    const executionPlan = planWithSemantic('Metros', {
      intent: 'CONFIRM_DIMENSIONS_UNIT',
      confidence: 0.94,
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
    }, snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.ANSWER_PREVIOUS_QUESTION);
    assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
    assert.notEqual(executionPlan.nextState, CONVERSATION_STATES.INIT);
    assert.equal(executionPlan.stateAfter.collectedEntities.dimensions.unit, 'metros');
  });

  it('uses auxiliary semantic hints for continuation, quantity and budget clarifications', () => {
    const quantityState = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_CANTIDAD,
      selectedService: catalogHints.services[4],
      activeFlow: {
        selectedService: catalogHints.services[4],
        collectedEntities: { ambiguousNumber: 345 }
      },
      collectedEntities: { ambiguousNumber: 345 },
      lastQuestionId: 'clarify.number',
      lastQuestionText: 'Ese numero es cantidad, presupuesto o una medida?'
    });
    const quantity = planWithSemantic('es la cantidad de piezas', {
      intent: 'CONFIRM_QUANTITY',
      confidence: 0.93,
      entities: {},
      explanation: 'Aclara cantidad.'
    }, snapshotWithState(quantityState));

    const budgetState = createConversationState({
      status: CONVERSATION_STATES.ESPERANDO_PRESUPUESTO,
      selectedService: catalogHints.services[2],
      activeFlow: {
        selectedService: catalogHints.services[2],
        collectedEntities: { ambiguousNumber: 10000 }
      },
      collectedEntities: { ambiguousNumber: 10000 },
      lastQuestionId: 'clarify.number',
      lastQuestionText: 'Ese numero es cantidad, presupuesto o una medida?'
    });
    const budget = planWithSemantic('es mi presupuesto', {
      intent: 'CONFIRM_BUDGET',
      confidence: 0.93,
      entities: {},
      explanation: 'Aclara presupuesto.'
    }, snapshotWithState(budgetState));

    const continued = planWithSemantic('seguimos', {
      intent: 'CONTINUE_ACTIVE_FLOW',
      confidence: 0.93,
      entities: {},
      explanation: 'Quiere continuar.'
    }, snapshotWithState(summaryState()));

    assert.equal(quantity.stateAfter.collectedEntities.quantity, 345);
    assert.equal(quantity.selectedService.nombre, 'Tarjetas de presentacion');
    assert.equal(budget.stateAfter.collectedEntities.budget, 10000);
    assert.equal(budget.selectedService.nombre, 'Diseno web');
    assert.equal(continued.reason, 'customer_requested_continue_active_service');
    assert.equal(continued.selectedService.nombre, 'Impresion de lona');
  });

  it('recommends consultative options for attracting customers with budget', () => {
    const executionPlan = plan('Quiero atraer clientes con $1000');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.RECOMMENDATION);
    assert.equal(executionPlan.reason, 'consultative_recommendation_generated');
    assert.equal(executionPlan.selectedService, null);
    assert.equal(executionPlan.responsePlan.type, 'recommendation_options');
    assert.equal(executionPlan.responsePlan.budget, 1000);
    assert.ok(executionPlan.responsePlan.recommendations.length >= 2);
    assert.ok(executionPlan.responsePlan.recommendations.length <= 3);
    assert.deepEqual(executionPlan.mcpPlan.tools, ['recommend_services']);
  });

  it('detects papeleria and asks for the real goal before recommending', () => {
    const executionPlan = plan('Tengo una papeleria');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.RECOMMENDATION);
    assert.equal(executionPlan.responsePlan.type, 'recommendation_question');
    assert.equal(executionPlan.stateAfter.collectedEntities.businessType, 'papeleria');
    assert.equal(executionPlan.persistencePlan.activeMemoryUpdate.businessType, 'papeleria');
    assert.equal(executionPlan.responsePlan.questionId, 'recommendation.goal');
    assert.match(executionPlan.responsePlan.question, /atraer clientes|vender mas|mejorar tu imagen/i);
  });

  it('recommends for restaurant with business matrix and explains why', () => {
    const executionPlan = plan('Tengo un restaurante y quiero vender mas con 10000 pesos');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.RECOMMENDATION);
    assert.equal(executionPlan.responsePlan.type, 'recommendation_options');
    assert.equal(executionPlan.responsePlan.businessType, 'restaurante');
    assert.equal(executionPlan.responsePlan.objective, 'vender mas');
    assert.ok(executionPlan.responsePlan.recommendations.length <= 3);
    assert.ok(executionPlan.responsePlan.recommendations.some((entry) => /Menus|Diseno web|lona|vinil/i.test(entry.service.nombre)));
    assert.ok(executionPlan.responsePlan.recommendations.every((entry) => /restaurante|buscas|cuentas/i.test(entry.reason)));
    assert.equal(executionPlan.responsePlan.recommendationExplained, true);
  });

  it('recommends for dentist and veterinary businesses', () => {
    const dentist = plan('Soy dentista y quiero atraer clientes con 10000 pesos');
    const veterinary = plan('Tengo una veterinaria, quiero mejorar mi imagen con 10000 pesos');

    assert.equal(dentist.responsePlan.businessType, 'dentista');
    assert.ok(dentist.responsePlan.recommendations.some((entry) => /Rotulacion|Diseno web|Vinil/i.test(entry.service.nombre)));
    assert.equal(veterinary.responsePlan.businessType, 'veterinaria');
    assert.ok(veterinary.responsePlan.recommendations.some((entry) => /Rotulacion|lona|vinil|Branding/i.test(entry.service.nombre)));
  });

  it('recommends for cafeteria and adapts to low budget', () => {
    const executionPlan = plan('Tengo una cafeteria y quiero atraer clientes con 1000 pesos');

    assert.equal(executionPlan.responsePlan.businessType, 'cafeteria');
    assert.equal(executionPlan.responsePlan.budget, 1000);
    assert.ok(executionPlan.responsePlan.recommendations.length <= 3);
    assert.ok(!executionPlan.responsePlan.recommendations.some((entry) => entry.service.nombre === 'Branding premium'));
  });

  it('updates recommendation when customer changes budget', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.INIT,
      collectedEntities: {
        businessType: 'cafeteria',
        businessGoal: 'atraer clientes',
        objective: 'atraer clientes',
        budget: 1000
      }
    });

    const executionPlan = plan('Mejor tengo 10000 pesos', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.RECOMMENDATION);
    assert.equal(executionPlan.responsePlan.budget, 10000);
    assert.equal(executionPlan.stateAfter.collectedEntities.businessType, 'cafeteria');
  });

  it('updates business type when customer changes giro', () => {
    const state = createConversationState({
      status: CONVERSATION_STATES.INIT,
      collectedEntities: {
        businessType: 'papeleria',
        businessGoal: 'atraer clientes',
        objective: 'atraer clientes',
        budget: 10000
      }
    });

    const executionPlan = plan('Mejor es para un restaurante', snapshotWithState(state));

    assert.equal(executionPlan.intent, PLANNER_INTENTS.RECOMMENDATION);
    assert.equal(executionPlan.responsePlan.businessType, 'restaurante');
    assert.equal(executionPlan.stateAfter.collectedEntities.businessType, 'restaurante');
  });

  it('does not recommend when customer already knows the service', () => {
    const executionPlan = plan('Quiero una lona para mi papeleria');

    assert.equal(executionPlan.intent, PLANNER_INTENTS.START_SERVICE_QUOTE);
    assert.equal(executionPlan.selectedService.nombre, 'Impresion de lona');
    assert.notEqual(executionPlan.responsePlan.type, 'recommendation_options');
    assert.equal(executionPlan.stateAfter.collectedEntities.businessType, 'papeleria');
  });

  it('does not revive useful memory as service authority', () => {
    const snapshot = createConversationSnapshot({
      empresaId: 1,
      conversationId: 'chat-1',
      state: createConversationState({ status: CONVERSATION_STATES.INIT }),
      activeMemory: {
        preferredServices: [catalogHints.services[0]],
        budgetRange: 1000
      }
    });

    const executionPlan = plan('Cuanto sale?', snapshot);

    assert.equal(executionPlan.intent, PLANNER_INTENTS.CLARIFY);
    assert.equal(executionPlan.reason, 'price_request_needs_context');
    assert.equal(executionPlan.selectedService, null);
    assert.doesNotMatch(executionPlan.responsePlan.question, /Impresion de lona/i);
  });
});
