import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { normalizeIncomingMessage } from '../message-normalizer.js';
import { planCommercialConversation } from './commercial-conversation-planner.js';
import { COMMERCIAL_NEXT_ACTIONS, COMMERCIAL_PLANNER_GOALS } from './commercial-state.schema.js';

function normalized(message) {
  return normalizeIncomingMessage({ message, contactName: 'Cliente', phone: '5215550000000' });
}

const lona = {
  id: 7,
  nombre: 'Impresion de lona',
  descripcion: 'Impresion gran formato en lona para anunciar negocios',
  precio: 390,
  tipo_precio: 'POR_M2',
  requiere_medidas: true,
  categoria: 'Impresion',
  score: 28
};

const web = {
  id: 6,
  nombre: 'Diseno web',
  descripcion: 'Paginas web informativas, catalogos y pedidos en linea',
  precio: 0,
  tipo_precio: 'COTIZACION',
  categoria: 'Marketing',
  score: 31
};

const marketing = {
  id: 16,
  nombre: 'Marketing digital',
  descripcion: 'Publicidad digital, campanas y anuncios para atraer clientes',
  precio: 0,
  tipo_precio: 'COTIZACION',
  categoria: 'Marketing',
  score: 34
};

const tarjetas = {
  id: 22,
  nombre: 'Tarjetas de presentacion',
  descripcion: 'Tarjetas impresas para negocios',
  precio: 297,
  tipo_precio: 'POR_UNIDAD',
  requiere_cantidad: true,
  categoria: 'Impresion',
  score: 30
};

const emptyNlu = {
  intent: 'MENSAJE_GENERAL',
  type: 'unknown',
  confidence: 0.5,
  entities: {}
};

function stateWithActiveService(service, extra = {}) {
  return {
    lastServiceId: service.id,
    lastService: service,
    commercial: {
      activeServiceId: service.id,
      activeServiceName: service.nombre,
      activeDomain: service.categoria,
      lastBotQuestion: extra.lastBotQuestion ?? null,
      lastQuoteContext: extra.lastQuoteContext ?? null,
      plannerState: extra.plannerState ?? null
    }
  };
}

describe('Commercial Conversation Planner shadow v2', () => {
  afterEach(() => {
    delete process.env.NCIE_CONVERSATION_PLANNER_ENABLED;
    delete process.env.NCIE_CONVERSATION_PLANNER_SHADOW;
  });

  it('selects lona and detects missing measurements', () => {
    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Me gustaria una lona'),
      nlu: { ...emptyNlu, intent: 'CONSULTAR_PRECIO', type: 'service' },
      state: {},
      retrieval: { services: [lona], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.goal, COMMERCIAL_PLANNER_GOALS.QUOTE);
    assert.equal(decision.selectedService.nombre, 'Impresion de lona');
    assert.deepEqual(decision.missing, ['medidas']);
    assert.equal(decision.responsePlanType, 'ask_measurements');
  });

  it('does not trap a new lona request inside an active web flow', () => {
    const activeWebState = stateWithActiveService(web, {
      lastBotQuestion: 'Sera una pagina informativa, catalogo o para pedidos?'
    });
    const preRetrieval = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Me gustaria una lona'),
      nlu: { ...emptyNlu, intent: 'CONSULTAR_PRECIO', type: 'service' },
      state: activeWebState,
      phase: 'pre_retrieval'
    });

    assert.equal(preRetrieval.retrievalNeeded, true);
    assert.equal(preRetrieval.retrievalPolicy.reason, 'explicit_topic_change_requires_retrieval');
    assert.equal(preRetrieval.explicitTopicChange, true);

    const postRetrieval = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Me gustaria una lona'),
      nlu: { ...emptyNlu, intent: 'CONSULTAR_PRECIO', type: 'service' },
      state: activeWebState,
      retrieval: { services: [lona], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(postRetrieval.nextAction, COMMERCIAL_NEXT_ACTIONS.SWITCH_TOPIC);
    assert.equal(postRetrieval.selectedService.nombre, 'Impresion de lona');
    assert.deepEqual(postRetrieval.missing, ['medidas']);
  });

  it('detects dimensions after lona and does not need retrieval', () => {
    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('2x1'),
      nlu: emptyNlu,
      state: stateWithActiveService(lona, {
        lastBotQuestion: 'Que medidas necesitas?'
      }),
      retrieval: { services: [], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.selectedService.nombre, 'Impresion de lona');
    assert.deepEqual(decision.missing, []);
    assert.equal(decision.detectedDimensions.area, 2);
    assert.equal(decision.retrievalNeeded, false);
  });

  it('updates web type after web question without repeating it', () => {
    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Para recibir pedidos'),
      nlu: emptyNlu,
      state: stateWithActiveService(web, {
        lastBotQuestion: 'Sera una pagina informativa, catalogo o para pedidos?'
      }),
      retrieval: { services: [], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.selectedService.nombre, 'Diseno web');
    assert.equal(decision.detectedWebType, 'pedidos');
    assert.deepEqual(decision.missing, ['presupuesto']);
    assert.equal(decision.waitingField, 'budget');
    assert.notEqual(decision.responsePlanType, 'ask_web_type');
    assert.equal(decision.retrievalNeeded, false);
  });

  it('updates web type as catalog when customer answers "Para catalogo"', () => {
    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Para catalogo'),
      nlu: emptyNlu,
      state: stateWithActiveService(web, {
        lastBotQuestion: 'Sera una pagina informativa, catalogo o para pedidos?'
      }),
      retrieval: { services: [], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.selectedService.nombre, 'Diseno web');
    assert.equal(decision.detectedWebType, 'catalogo');
    assert.deepEqual(decision.missing, ['presupuesto']);
    assert.equal(decision.waitingField, 'budget');
    assert.notEqual(decision.responsePlanType, 'ask_web_type');
  });

  it('treats "Son los unicos servicios?" as catalog follow-up', () => {
    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Son los unicos servicios?'),
      nlu: { ...emptyNlu, intent: 'LISTAR_SERVICIOS', type: 'service' },
      state: stateWithActiveService(web),
      retrieval: { services: [lona, web], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.goal, COMMERCIAL_PLANNER_GOALS.FOLLOW_UP_CATALOG);
    assert.equal(decision.nextAction, COMMERCIAL_NEXT_ACTIONS.FOLLOW_UP_CATALOG);
    assert.equal(decision.responsePlanType, 'catalog_listing');
  });

  it('does not let active web flow hijack company information requests', () => {
    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Quiero informes'),
      nlu: emptyNlu,
      state: stateWithActiveService(web, {
        lastBotQuestion: 'Sera una pagina informativa, catalogo o para pedidos?'
      }),
      retrieval: { services: [lona, web], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.goal, COMMERCIAL_PLANNER_GOALS.KNOW_COMPANY);
    assert.equal(decision.responsePlanType, 'business_summary');
    assert.equal(decision.nextAction, COMMERCIAL_NEXT_ACTIONS.FOLLOW_UP_CATALOG);
    assert.equal(decision.selectedService, null);
    assert.equal(decision.activeFlow, null);
  });

  it('does not create an active service flow from a catalog request', () => {
    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Quiero informes'),
      nlu: emptyNlu,
      state: {},
      retrieval: { services: [web, lona], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.goal, COMMERCIAL_PLANNER_GOALS.KNOW_COMPANY);
    assert.equal(decision.responsePlanType, 'business_summary');
    assert.equal(decision.selectedService, null);
    assert.equal(decision.activeFlow, null);
    assert.equal(decision.stateUpdatePreview.flows.length, 0);
  });

  it('lets a concrete lona request override a previous catalog goal', () => {
    const contaminatedCatalogState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_6',
      lastBotQuestion: 'Que te gustaria cotizar?',
      flows: [
        {
          id: 'flow_service_6',
          goal: 'conocer_empresa',
          stage: 'seguimiento',
          selectedServiceId: 6,
          selectedServiceName: 'Diseno web',
          selectedCategory: 'Marketing',
          entities: {},
          missing: [],
          status: 'active'
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Me gustaria una lona'),
      nlu: { ...emptyNlu, type: 'service' },
      state: {
        commercial: { plannerState: contaminatedCatalogState }
      },
      retrieval: { services: [lona], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.goal, COMMERCIAL_PLANNER_GOALS.QUOTE);
    assert.equal(decision.selectedService.nombre, 'Impresion de lona');
    assert.equal(decision.responsePlanType, 'ask_measurements');
    assert.deepEqual(decision.missing, ['medidas']);
  });

  it('treats dimensions as quote continuation even after an old catalog goal', () => {
    const contaminatedLonaState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_7',
      lastBotQuestion: 'Que te gustaria cotizar?',
      flows: [
        {
          id: 'flow_service_7',
          goal: 'conocer_empresa',
          stage: 'seguimiento',
          selectedServiceId: 7,
          selectedServiceName: 'Impresion de lona',
          selectedCategory: 'Impresion',
          servicePriceType: 'POR_M2',
          servicePrice: 390,
          requiresMeasurements: true,
          entities: {},
          missing: [],
          status: 'active'
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('2x1'),
      nlu: emptyNlu,
      state: {
        commercial: { plannerState: contaminatedLonaState }
      },
      retrieval: { services: [], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.goal, COMMERCIAL_PLANNER_GOALS.QUOTE);
    assert.equal(decision.selectedService.nombre, 'Impresion de lona');
    assert.equal(decision.detectedDimensions.area, 2);
    assert.equal(decision.retrievalNeeded, false);
  });

  it('does not let active lona answer a new increase-sales goal', () => {
    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Quiero anunciar mi negocio'),
      nlu: emptyNlu,
      state: stateWithActiveService(lona, {
        lastBotQuestion: 'Ya tienes el diseno o quieres que tambien te apoyemos?',
        plannerState: {
          version: 2,
          empresaId: 1,
          conversationId: 'chat-1',
          activeFlowId: 'flow_service_7',
          flows: [
            {
              id: 'flow_service_7',
              goal: 'cotizar',
              stage: 'recolectando_requisitos',
              selectedServiceId: 7,
              selectedServiceName: 'Impresion de lona',
              selectedCategory: 'Impresion',
              servicePriceType: 'POR_M2',
              servicePrice: 390,
              requiresMeasurements: true,
              entities: { dimensions: { alto: 2, ancho: 1, area: 2, text: '2x1' } },
              missing: [],
              status: 'active'
            }
          ]
        }
      }),
      phase: 'pre_retrieval'
    });

    assert.equal(decision.goal, COMMERCIAL_PLANNER_GOALS.INCREASE_SALES);
    assert.equal(decision.selectedService, null);
    assert.equal(decision.retrievalNeeded, false);
    assert.equal(decision.responsePlanType, 'consultative_diagnosis');
  });

  it('switches from active lona to explicit marketing digital without carrying dimensions', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_7',
      flows: [
        {
          id: 'flow_service_7',
          goal: 'cotizar',
          stage: 'recolectando_requisitos',
          selectedServiceId: 7,
          selectedServiceName: 'Impresion de lona',
          selectedCategory: 'Impresion',
          servicePriceType: 'POR_M2',
          servicePrice: 390,
          requiresMeasurements: true,
          entities: { dimensions: { alto: 2, ancho: 1, area: 2, text: '2x1' } },
          missing: [],
          status: 'active'
        }
      ]
    };

    const preRetrieval = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Me interesa marketing digital'),
      nlu: { ...emptyNlu, intent: 'INTENCION_COMPRA', type: 'service', confidence: 0.82 },
      state: { commercial: { plannerState } },
      phase: 'pre_retrieval'
    });

    assert.equal(preRetrieval.explicitTopicChange, true);
    assert.equal(preRetrieval.retrievalNeeded, true);
    assert.equal(preRetrieval.selectedService, null);

    const postRetrieval = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Me interesa marketing digital'),
      nlu: { ...emptyNlu, intent: 'INTENCION_COMPRA', type: 'service', confidence: 0.82 },
      state: { commercial: { plannerState } },
      retrieval: { services: [marketing], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(postRetrieval.selectedService.nombre, 'Marketing digital');
    assert.equal(postRetrieval.responsePlanType, 'topic_switch_service');
    assert.equal(postRetrieval.activeFlow.selectedServiceName, 'Marketing digital');
    assert.equal(postRetrieval.stateUpdatePreview.flows.find((flow) => flow.id === 'flow_service_7').status, 'paused');
    assert.equal(postRetrieval.activeFlow.entities?.dimensions, undefined);
    assert.equal(postRetrieval.activeFlow.entities?.webType, undefined);
  });

  it('switches from active web to marketing digital even when both share category', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_6',
      flows: [
        {
          id: 'flow_service_6',
          goal: 'cotizar',
          stage: 'recolectando_requisitos',
          selectedServiceId: 6,
          selectedServiceName: 'Diseno web',
          selectedCategory: 'Marketing',
          entities: { webType: 'catalogo' },
          missing: [],
          status: 'active'
        }
      ]
    };

    const preRetrieval = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Tambien marketing digital'),
      nlu: { ...emptyNlu, intent: 'MENSAJE_GENERAL', type: 'unknown', confidence: 0.35 },
      state: { commercial: { plannerState } },
      phase: 'pre_retrieval'
    });

    assert.equal(preRetrieval.retrievalNeeded, true);

    const postRetrieval = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Tambien marketing digital'),
      nlu: { ...emptyNlu, intent: 'MENSAJE_GENERAL', type: 'unknown', confidence: 0.35 },
      state: { commercial: { plannerState } },
      retrieval: { services: [marketing], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(postRetrieval.selectedService.nombre, 'Marketing digital');
    assert.equal(postRetrieval.activeFlow.selectedServiceName, 'Marketing digital');
    assert.equal(postRetrieval.activeFlow.entities?.webType, undefined);
  });

  it('does not let active lona answer product requests', () => {
    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Manejan productos?'),
      nlu: { ...emptyNlu, intent: 'BUSCAR_PRODUCTO', type: 'product', confidence: 0.68 },
      state: stateWithActiveService(lona),
      phase: 'pre_retrieval'
    });

    assert.equal(decision.selectedService, null);
    assert.equal(decision.retrievalNeeded, true);
    assert.equal(decision.responsePlanType, 'business_summary');
  });

  it('recognizes compound greetings without clearing the active flow', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_7',
      lastBotQuestion: 'Que medidas necesitas?',
      waitingField: 'dimensions',
      flows: [
        {
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
          waitingField: 'dimensions',
          status: 'active'
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Hola buenas tardes'),
      nlu: { ...emptyNlu, intent: 'MENSAJE_GENERAL', type: 'unknown', confidence: 0.35 },
      state: { commercial: { plannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(decision.neutralMessageType, 'greeting');
    assert.equal(decision.responsePlanType, 'neutral_message');
    assert.equal(decision.activeFlow.selectedServiceName, 'Impresion de lona');
    assert.equal(decision.activeFlow.waitingField, 'dimensions');
  });

  it('uses waitingField to interpret quantity without reclassifying the message', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_22',
      lastBotQuestion: 'Cuantas piezas necesitas?',
      waitingField: 'quantity',
      flows: [
        {
          id: 'flow_service_22',
          goal: 'cotizar',
          stage: 'esperando_cantidad',
          selectedServiceId: 22,
          selectedServiceName: 'Tarjetas de presentacion',
          selectedCategory: 'Impresion',
          servicePriceType: 'POR_UNIDAD',
          servicePrice: 297,
          requiresQuantity: true,
          entities: {},
          missing: ['cantidad'],
          waitingField: 'quantity',
          lastQuestion: 'Cuantas piezas necesitas?',
          status: 'active'
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('3'),
      nlu: { ...emptyNlu, intent: 'RESPUESTA_CONTEXTO', confidence: 0.98, entities: { quantity: 3 } },
      state: { commercial: { plannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(decision.selectedService.nombre, 'Tarjetas de presentacion');
    assert.equal(decision.interpretedResponse.handled, true);
    assert.equal(decision.activeFlow.entities.quantity, 3);
    assert.deepEqual(decision.missing, []);
    assert.equal(decision.activeFlow.waitingField, null);
  });

  it('keeps single yes ambiguous when several pending options exist', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: null,
      waitingField: 'option',
      lastBotQuestion: 'Quieres publicidad fisica, diseno o marketing digital?',
      flows: []
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Si'),
      nlu: { ...emptyNlu, intent: 'RESPUESTA_AMBIGUA_CONTEXTO', confidence: 0.2 },
      state: {
        commercial: {
          plannerState,
          lastOptionsShown: ['Publicidad fisica', 'Diseno', 'Marketing digital']
        }
      },
      phase: 'post_retrieval'
    });

    assert.equal(decision.interpretedResponse.ambiguous, true);
    assert.equal(decision.responsePlanType, 'clarify_pending_options');
    assert.equal(decision.selectedService, null);
  });

  it('keeps design and installation answers inside the active lona flow', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_7',
      lastBotQuestion: 'Ya tienes el diseno o quieres que tambien te apoyemos?',
      flows: [
        {
          id: 'flow_service_7',
          goal: 'cotizar',
          stage: 'recolectando_requisitos',
          selectedServiceId: 7,
          selectedServiceName: 'Impresion de lona',
          selectedCategory: 'Impresion',
          servicePriceType: 'POR_M2',
          servicePrice: 390,
          requiresMeasurements: true,
          entities: { dimensions: { alto: 2, ancho: 1, area: 2, text: '2x1' } },
          missing: [],
          status: 'active'
        }
      ]
    };

    const design = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Si'),
      nlu: { ...emptyNlu, intent: 'INTENCION_COMPRA', type: 'service' },
      state: { commercial: { plannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(design.selectedService.nombre, 'Impresion de lona');
    assert.equal(design.detectedDesignPreference, true);
    assert.equal(design.retrievalNeeded, false);
    assert.equal(design.activeFlow.entities.design, true);
    assert.equal(design.activeFlow.entities.designSupport, true);

    const noDesign = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('No'),
      nlu: { ...emptyNlu, intent: 'MENSAJE_GENERAL', type: 'unknown' },
      state: { commercial: { plannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(noDesign.selectedService.nombre, 'Impresion de lona');
    assert.equal(noDesign.detectedDesignPreference, false);
    assert.equal(noDesign.retrievalNeeded, false);
    assert.equal(noDesign.activeFlow.entities.design, false);
    assert.equal(noDesign.activeFlow.entities.designSupport, false);

    const installationPlannerState = {
      ...plannerState,
      lastBotQuestion: 'Quieres instalacion o seria sin instalacion?'
    };

    const installation = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Sin instalacion'),
      nlu: { ...emptyNlu, intent: 'BUSCAR_SERVICIO', type: 'service' },
      state: { commercial: { plannerState: installationPlannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(installation.selectedService.nombre, 'Impresion de lona');
    assert.equal(installation.explicitTopicChange, false);
    assert.equal(installation.detectedInstallationPreference, false);
    assert.equal(installation.retrievalNeeded, false);
    assert.equal(installation.activeFlow.entities.installation, false);
  });

  it('resolves phase 9 short-answer polarity for design and installation', () => {
    const basePlannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_7',
      lastBotQuestion: 'Ya tienes el diseno o quieres que tambien te apoyemos con eso?',
      flows: [
        {
          id: 'flow_service_7',
          goal: 'cotizar',
          stage: 'recolectando_requisitos',
          selectedServiceId: 7,
          selectedServiceName: 'Impresion de lona',
          selectedCategory: 'Impresion',
          servicePriceType: 'POR_M2',
          servicePrice: 390,
          requiresMeasurements: true,
          entities: { dimensions: { alto: 2, ancho: 1, area: 2, text: '2x1' } },
          missing: [],
          status: 'active'
        }
      ]
    };

    const conDiseno = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Con diseno'),
      nlu: emptyNlu,
      state: { commercial: { plannerState: basePlannerState } },
      phase: 'post_retrieval'
    });
    assert.equal(conDiseno.detectedDesignPreference, true);
    assert.equal(conDiseno.activeFlow.entities.design, true);

    const yaTengoDiseno = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Ya tengo diseno'),
      nlu: emptyNlu,
      state: { commercial: { plannerState: basePlannerState } },
      phase: 'post_retrieval'
    });
    assert.equal(yaTengoDiseno.detectedDesignPreference, false);
    assert.equal(yaTengoDiseno.activeFlow.entities.design, false);

    const installationPlannerState = {
      ...basePlannerState,
      lastBotQuestion: 'Quieres instalacion o seria sin instalacion?'
    };
    const conInstalacion = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Con instalacion'),
      nlu: emptyNlu,
      state: { commercial: { plannerState: installationPlannerState } },
      phase: 'post_retrieval'
    });
    assert.equal(conInstalacion.detectedInstallationPreference, true);
    assert.equal(conInstalacion.activeFlow.entities.installation, true);

    const sinInstalacion = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Sin instalacion'),
      nlu: emptyNlu,
      state: { commercial: { plannerState: installationPlannerState } },
      phase: 'post_retrieval'
    });
    assert.equal(sinInstalacion.detectedInstallationPreference, false);
    assert.equal(sinInstalacion.activeFlow.entities.installation, false);
  });

  it('does not apply installation answers to marketing digital', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_16',
      lastBotQuestion: 'Que objetivo quieres lograr con marketing digital?',
      flows: [
        {
          id: 'flow_service_16',
          goal: 'cotizar',
          stage: 'recolectando_requisitos',
          selectedServiceId: 16,
          selectedServiceName: 'Marketing digital',
          selectedCategory: 'Marketing',
          entities: {},
          missing: [],
          status: 'active'
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Sin instalacion'),
      nlu: { ...emptyNlu, intent: 'BUSCAR_SERVICIO', type: 'service' },
      state: { commercial: { plannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(decision.selectedService.nombre, 'Marketing digital');
    assert.equal(decision.activeFlow.selectedServiceName, 'Marketing digital');
    assert.equal(decision.detectedInstallationPreference, undefined);
    assert.equal(decision.activeFlow.entities?.installation, undefined);
    assert.equal(decision.explicitTopicChange, false);
  });

  it('resolves all web type short answers without carrying lona dimensions', () => {
    const webState = stateWithActiveService(web, {
      lastBotQuestion: 'Sera una pagina informativa, catalogo o para pedidos?'
    });

    const informativa = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Informativa'),
      nlu: emptyNlu,
      state: webState,
      phase: 'post_retrieval'
    });
    assert.equal(informativa.selectedService.nombre, 'Diseno web');
    assert.equal(informativa.detectedWebType, 'informativa');
    assert.equal(informativa.activeFlow.entities?.dimensions ?? null, null);

    const catalogo = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Para catalogo'),
      nlu: emptyNlu,
      state: webState,
      phase: 'post_retrieval'
    });
    assert.equal(catalogo.detectedWebType, 'catalogo');
    assert.equal(catalogo.activeFlow.entities?.dimensions ?? null, null);
  });

  it('starts a fresh lona quote when customer asks for lona again instead of reusing old dimensions', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_7',
      lastBotQuestion: 'Ya tienes el diseno o quieres que tambien te apoyemos?',
      flows: [
        {
          id: 'flow_service_7',
          goal: 'cotizar',
          stage: 'recolectando_requisitos',
          selectedServiceId: 7,
          selectedServiceName: 'Impresion de lona',
          selectedCategory: 'Impresion',
          servicePriceType: 'POR_M2',
          servicePrice: 390,
          requiresMeasurements: true,
          entities: {
            dimensions: { alto: 2, ancho: 1, area: 2, text: '2x1' },
            design: false,
            designSupport: false
          },
          missing: [],
          status: 'active'
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Me interesa una lona'),
      nlu: { ...emptyNlu, intent: 'INTENCION_COMPRA', type: 'service' },
      state: { commercial: { plannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(decision.selectedService.nombre, 'Impresion de lona');
    assert.deepEqual(decision.missing, ['medidas']);
    assert.equal(decision.responsePlanType, 'ask_measurements');
    assert.equal(decision.activeFlow.entities?.dimensions, undefined);
    assert.equal(decision.activeFlow.entities?.design, undefined);
  });

  it('keeps asking for measurements when design is answered before dimensions', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_7',
      lastBotQuestion: 'Que medidas necesitas?',
      flows: [
        {
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
          status: 'active'
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Con diseno'),
      nlu: { ...emptyNlu, intent: 'MENSAJE_GENERAL', type: 'unknown' },
      state: { commercial: { plannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(decision.selectedService.nombre, 'Impresion de lona');
    assert.equal(decision.detectedDesignPreference, true);
    assert.deepEqual(decision.missing, ['medidas']);
    assert.equal(decision.responsePlanType, 'ask_measurements');
    assert.equal(decision.activeFlow.entities?.dimensions, undefined);
  });

  it('does not answer neutral messages as the active flow', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_16',
      lastBotQuestion: 'Que objetivo quieres lograr con marketing digital?',
      flows: [
        {
          id: 'flow_service_16',
          goal: 'cotizar',
          stage: 'recolectando_requisitos',
          selectedServiceId: 16,
          selectedServiceName: 'Marketing digital',
          selectedCategory: 'Marketing',
          entities: {},
          missing: [],
          status: 'active'
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Hola'),
      nlu: { ...emptyNlu, intent: 'MENSAJE_GENERAL', type: 'unknown', confidence: 0.35 },
      state: { commercial: { plannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(decision.selectedService, null);
    assert.equal(decision.neutralMessageType, 'greeting');
    assert.equal(decision.responsePlanType, 'neutral_message');
    assert.equal(decision.activeFlow.selectedServiceName, 'Marketing digital');
    assert.equal(decision.retrievalNeeded, false);
  });

  it('keeps active flow available after neutral ping while not selecting it', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_6',
      lastBotQuestion: 'Sera una pagina informativa, catalogo o para pedidos?',
      flows: [
        {
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
        }
      ]
    };

    const ping = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('?'),
      nlu: { ...emptyNlu, intent: 'MENSAJE_GENERAL', type: 'unknown', confidence: 0.35 },
      state: { commercial: { plannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(ping.selectedService, null);
    assert.equal(ping.neutralMessageType, 'ping');
    assert.equal(ping.responsePlanType, 'neutral_message');
    assert.equal(ping.activeFlow.selectedServiceName, 'Diseno web');

    const catalogo = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Para catalogo'),
      nlu: emptyNlu,
      state: { commercial: { plannerState: ping.stateUpdatePreview } },
      phase: 'post_retrieval'
    });

    assert.equal(catalogo.selectedService.nombre, 'Diseno web');
    assert.equal(catalogo.detectedWebType, 'catalogo');
    assert.equal(catalogo.retrievalNeeded, false);
  });

  it('still uses active flow for measurement answers', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_7',
      lastBotQuestion: 'Que medidas necesitas?',
      flows: [
        {
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
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('2x1'),
      nlu: emptyNlu,
      state: { commercial: { plannerState } },
      phase: 'post_retrieval'
    });

    assert.equal(decision.selectedService.nombre, 'Impresion de lona');
    assert.equal(decision.detectedDimensions.area, 2);
    assert.equal(decision.neutralMessageType, null);
    assert.equal(decision.retrievalNeeded, false);
  });

  it('resumes previous lona flow after switching to web', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_6',
      lastBotQuestion: 'Sera una pagina informativa, catalogo o para pedidos?',
      flows: [
        {
          id: 'flow_service_7',
          goal: 'cotizar',
          stage: 'esperando_medidas',
          selectedServiceId: 7,
          selectedServiceName: 'Impresion de lona',
          selectedCategory: 'Impresion',
          servicePriceType: 'POR_M2',
          servicePrice: 390,
          unitMeasure: 'm2',
          requiresMeasurements: true,
          includes: 'impresion en lona',
          excludes: 'instalacion',
          entities: {},
          missing: ['medidas'],
          status: 'paused'
        },
        {
          id: 'flow_service_6',
          goal: 'cotizar',
          stage: 'esperando_tipo_web',
          selectedServiceId: 6,
          selectedServiceName: 'Diseno web',
          selectedCategory: 'Marketing',
          entities: {},
          missing: ['tipo_web'],
          status: 'active'
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Continuemos con la lona'),
      nlu: emptyNlu,
      state: {
        commercial: { plannerState }
      },
      retrieval: { services: [], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.nextAction, COMMERCIAL_NEXT_ACTIONS.RESUME_FLOW);
    assert.equal(decision.topicSwitch.resumeFlow.selectedServiceName, 'Impresion de lona');
    assert.equal(decision.activeFlow.selectedServiceName, 'Impresion de lona');
    assert.equal(decision.selectedServiceItem.precio, 390);
    assert.equal(decision.selectedServiceItem.tipo_precio, 'POR_M2');
    assert.equal(decision.selectedServiceItem.unidad_medida, 'm2');
    assert.equal(decision.selectedServiceItem.incluye, 'impresion en lona');
    assert.equal(decision.selectedServiceItem.no_incluye, 'instalacion');
  });

  it('resumes previous lona flow with "Continuamos"', () => {
    const plannerState = {
      version: 2,
      empresaId: 1,
      conversationId: 'chat-1',
      activeFlowId: 'flow_service_6',
      lastBotQuestion: 'Quieres que tambien permita pagos o solo levantar solicitudes?',
      flows: [
        {
          id: 'flow_service_7',
          goal: 'cotizar',
          stage: 'recolectando_requisitos',
          selectedServiceId: 7,
          selectedServiceName: 'Impresion de lona',
          selectedCategory: 'Impresion',
          entities: { dimensions: { alto: 2, ancho: 1, area: 2, text: '2x1' } },
          missing: [],
          status: 'paused'
        },
        {
          id: 'flow_service_6',
          goal: 'cotizar',
          stage: 'recolectando_requisitos',
          selectedServiceId: 6,
          selectedServiceName: 'Diseno web',
          selectedCategory: 'Marketing',
          entities: { webType: 'pedidos' },
          missing: [],
          status: 'active'
        }
      ]
    };

    const decision = planCommercialConversation({
      empresaId: 1,
      normalizedMessage: normalized('Continuamos con la lona'),
      nlu: emptyNlu,
      state: {
        commercial: { plannerState }
      },
      retrieval: { services: [], products: [] },
      phase: 'post_retrieval'
    });

    assert.equal(decision.goal, COMMERCIAL_PLANNER_GOALS.CONTINUE_FLOW);
    assert.equal(decision.nextAction, COMMERCIAL_NEXT_ACTIONS.RESUME_FLOW);
    assert.equal(decision.activeFlow.selectedServiceName, 'Impresion de lona');
  });
});
