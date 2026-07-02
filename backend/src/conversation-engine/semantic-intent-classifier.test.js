import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  classifySemanticIntent,
  resetSemanticIntentClassifierCacheForTests,
  shouldUseSemanticClassifier
} from './semantic-intent-classifier.js';
import { normalizeIncomingMessage } from './message-normalizer.js';

function normalized(message) {
  return normalizeIncomingMessage({ message, contactName: 'Cliente', phone: '5215550000000' });
}

function mockClient(payload, calls = []) {
  return {
    chat: {
      completions: {
        create: async (request) => {
          calls.push(request);
          return {
            model: 'test-model',
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            choices: [
              {
                message: {
                  content: JSON.stringify(payload)
                }
              }
            ]
          };
        }
      }
    }
  };
}

describe('semantic intent classifier', () => {
  beforeEach(() => {
    resetSemanticIntentClassifierCacheForTests();
  });

  it('returns strict structured JSON without customer response or MCP fields', async () => {
    const result = await classifySemanticIntent({
      empresaId: 1,
      message: normalized('Tengo una cafetería'),
      client: mockClient({
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
      }),
      config: { enabled: true, minConfidence: 0.85, maxTokens: 250, temperature: 0, timeoutMs: 4000, cacheTTL: 3600 }
    });

    assert.equal(result.intent, 'PROVIDE_BUSINESS_TYPE');
    assert.equal(result.entities.businessType, 'cafeteria');
    assert.equal(Object.hasOwn(result, 'respuesta_sugerida'), false);
    assert.equal(Object.hasOwn(result, 'herramienta_mcp'), false);
    assert.equal(Object.hasOwn(result, 'selectedService'), false);
    assert.equal(Object.hasOwn(result, 'nextState'), false);
  });

  it('rejects forbidden decision fields from model output', async () => {
    const result = await classifySemanticIntent({
      empresaId: 1,
      message: normalized('Quiero atraer clientes'),
      client: mockClient({
        intent: 'PROVIDE_BUSINESS_GOAL',
        confidence: 0.97,
        entities: {
          businessType: null,
          businessGoal: 'atraer_clientes',
          budget: null,
          currency: null,
          catalogRequest: false,
          advisorRequest: false
        },
        selectedService: 'Impresion de lona',
        explanation: 'Incluye un campo prohibido.'
      }),
      config: { enabled: true, minConfidence: 0.85, maxTokens: 250, temperature: 0, timeoutMs: 4000, cacheTTL: 3600 }
    });

    assert.equal(result.used, false);
    assert.equal(result.reason, 'invalid_or_forbidden_payload');
  });

  it('uses json_object response format and configured generation options', async () => {
    const calls = [];
    await classifySemanticIntent({
      empresaId: 1,
      message: normalized('¿Qué ofrecen?'),
      client: mockClient({
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
        explanation: 'Pide opciones.'
      }, calls),
      config: { enabled: true, minConfidence: 0.85, maxTokens: 123, temperature: 0, timeoutMs: 4000, cacheTTL: 3600 }
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].max_tokens, 123);
    assert.equal(calls[0].temperature, 0);
    assert.deepEqual(calls[0].response_format, { type: 'json_object' });
  });

  it('cache avoids a second OpenAI call for same normalized message and company', async () => {
    const calls = [];
    const client = mockClient({
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
    }, calls);
    const config = { enabled: true, minConfidence: 0.85, maxTokens: 250, temperature: 0, timeoutMs: 4000, cacheTTL: 3600 };

    const first = await classifySemanticIntent({ empresaId: 1, message: normalized('No sé qué necesito'), client, config });
    const second = await classifySemanticIntent({ empresaId: 1, message: normalized('no se que necesito'), client, config });

    assert.equal(first.intent, 'REQUEST_RECOMMENDATION');
    assert.equal(second.cacheHit, true);
    assert.equal(calls.length, 1);
  });

  it('low confidence does not produce usable hints', async () => {
    const result = await classifySemanticIntent({
      empresaId: 1,
      message: normalized('mmm'),
      client: mockClient({
        intent: 'REQUEST_RECOMMENDATION',
        confidence: 0.4,
        entities: {
          businessType: null,
          businessGoal: null,
          budget: null,
          currency: null,
          catalogRequest: false,
          advisorRequest: false
        },
        explanation: 'Inseguro.'
      }),
      config: { enabled: true, minConfidence: 0.85, maxTokens: 250, temperature: 0, timeoutMs: 4000, cacheTTL: 3600 }
    });

    assert.equal(result.used, false);
    assert.equal(result.reason, 'low_confidence');
  });

  it('accepts auxiliary planner hints without allowing planner authority fields', async () => {
    const result = await classifySemanticIntent({
      empresaId: 1,
      message: normalized('es la cantidad de piezas'),
      client: mockClient({
        intent: 'CONFIRM_QUANTITY',
        confidence: 0.93,
        entities: {
          businessType: null,
          businessGoal: null,
          budget: null,
          quantity: null,
          dimensionsUnit: null,
          currency: null,
          catalogRequest: false,
          advisorRequest: false
        },
        explanation: 'Aclara el dato anterior como cantidad.'
      }),
      config: { enabled: true, minConfidence: 0.85, maxTokens: 250, temperature: 0, timeoutMs: 4000, cacheTTL: 3600 }
    });

    assert.equal(result.intent, 'CONFIRM_QUANTITY');
    assert.equal(result.confidence, 0.93);
    assert.equal(Object.hasOwn(result, 'nextState'), false);
  });

  it('gates semantic classifier on low quality clarify even when entities exist', () => {
    const useSemantic = shouldUseSemanticClassifier({
      message: normalized('Metros'),
      entities: {
        entities: {
          currency: { name: 'currency', value: 'MXN', confidence: 0.5 }
        }
      },
      initialPlan: {
        intent: 'CLARIFY',
        reason: 'no_planner_rule_matched',
        confidence: 0.72,
        nextState: 'INIT',
        responsePlan: {
          type: 'clarify_need',
          question: 'Que producto, servicio o categoria tienes en mente?'
        },
        selectedService: null
      },
      conversationSnapshot: {
        state: {
          status: 'CONFIRM_DIMENSIONS',
          selectedService: { nombre: 'Impresion de lona' },
          lastQuestionText: 'Solo para confirmar, esas medidas son en metros o centimetros?'
        }
      }
    });

    assert.equal(useSemantic, true);
  });

  it('does not gate semantic classifier when planner already produced a concrete catalog response', () => {
    const useSemantic = shouldUseSemanticClassifier({
      message: normalized('Catalogo'),
      entities: { entities: { catalogRequest: { name: 'catalogRequest', value: true, confidence: 0.94 } } },
      initialPlan: {
        intent: 'SHOW_CATALOG',
        reason: 'catalog_request_detected',
        confidence: 0.94,
        nextState: 'CATALOGO',
        responsePlan: { type: 'catalog_listing', question: 'Cual te gustaria cotizar?' }
      },
      conversationSnapshot: { state: { status: 'INIT' } }
    });

    assert.equal(useSemantic, false);
  });
});
