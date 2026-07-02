import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DIFFERENCE_TYPES,
  classifyShadowComparison,
  evaluateShadowComparisons,
  extractShadowComparisonsFromText
} from './unified-shadow-evaluator.js';

function comparison(overrides = {}) {
  return {
    oldEngineResponse: 'Claro, te ayudo con impresion de lona. ¿Tienes medidas?',
    unifiedResponse: 'Impresion de lona. Me compartes las medidas aproximadas?',
    oldIntent: 'START_SERVICE_QUOTE',
    unifiedIntent: 'START_SERVICE_QUOTE',
    oldSelectedService: 'Impresion de lona',
    unifiedSelectedService: 'Impresion de lona',
    oldNextState: 'ESPERANDO_MEDIDAS',
    unifiedNextState: 'ESPERANDO_MEDIDAS',
    oldHandoff: false,
    unifiedHandoff: false,
    executionPlan: {
      intent: 'START_SERVICE_QUOTE',
      nextState: 'ESPERANDO_MEDIDAS',
      entities: {
        service: { value: 'impresion de lona' }
      },
      responsePlan: {
        repeatedQuestion: false
      },
      handoffPlan: {
        needed: false
      }
    },
    ...overrides
  };
}

describe('unified shadow evaluator phase 6A', () => {
  it('parses unified_shadow_comparison JSONL logs', () => {
    const text = [
      JSON.stringify({ message: 'other_event', value: 1 }),
      JSON.stringify({ message: 'unified_shadow_comparison', ...comparison() })
    ].join('\n');

    const entries = extractShadowComparisonsFromText(text);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].message, 'unified_shadow_comparison');
  });

  it('calculates match rates and phase 6B criteria', () => {
    const report = evaluateShadowComparisons([
      comparison(),
      comparison({
        oldEngineResponse: 'No encontramos ese servicio.',
        unifiedResponse: 'Claro, estos son los servicios disponibles:\n1. Impresion de lona',
        oldIntent: 'MENSAJE_GENERAL',
        unifiedIntent: 'SHOW_CATALOG',
        oldSelectedService: 'Marketing digital',
        unifiedSelectedService: null,
        oldNextState: 'business_summary',
        unifiedNextState: 'CATALOGO',
        executionPlan: {
          intent: 'SHOW_CATALOG',
          nextState: 'CATALOGO',
          entities: {
            catalogRequest: { value: true }
          },
          responsePlan: {
            type: 'catalog_listing',
            repeatedQuestion: false
          },
          handoffPlan: {
            needed: false
          }
        }
      })
    ]);

    assert.equal(report.totalComparisons, 2);
    assert.equal(report.sameIntentRate, 50);
    assert.equal(report.selectedServiceMatchRate, 50);
    assert.equal(report.nextStateMatchRate, 50);
    assert.equal(report.oldEngineFailureDetected, 1);
    assert.equal(report.unifiedEngineFailureDetected, 0);
    assert.equal(report.unifiedBetterCount, 1);
    assert.equal(report.oldBetterCount, 0);
    assert.equal(report.criticalMismatchCount, 0);
    assert.equal(report.phase6B.canProceed, true);
  });

  it('classifies critical unified regressions', () => {
    const types = classifyShadowComparison(comparison({
      unifiedResponse: '',
      unifiedSelectedService: 'Marketing digital',
      executionPlan: {
        intent: 'NEUTRAL',
        nextState: 'ESPERANDO_MEDIDAS',
        entities: {},
        responsePlan: {
          repeatedQuestion: true
        },
        handoffPlan: {
          needed: true
        }
      },
      unifiedHandoff: true
    }));

    assert.ok(types.includes(DIFFERENCE_TYPES.EMPTY_RESPONSE_OR_ERROR));
    assert.ok(types.includes(DIFFERENCE_TYPES.INCORRECT_HANDOFF));
    assert.ok(types.includes(DIFFERENCE_TYPES.REPEATED_QUESTION));
    assert.ok(types.includes(DIFFERENCE_TYPES.STALE_MEMORY_REVIVED));
    assert.ok(types.includes(DIFFERENCE_TYPES.SERVICE_CHANGED_WITHOUT_EXPLICIT_INTENT));
  });

  it('flags ambiguous numbers interpreted as quote state', () => {
    const report = evaluateShadowComparisons([
      comparison({
        oldEngineResponse: '¿Ese numero es cantidad, presupuesto o medida?',
        unifiedResponse: 'Perfecto, espero las medidas.',
        oldIntent: 'CLARIFY',
        unifiedIntent: 'START_SERVICE_QUOTE',
        oldSelectedService: null,
        unifiedSelectedService: null,
        oldNextState: 'INIT',
        unifiedNextState: 'ESPERANDO_MEDIDAS',
        executionPlan: {
          intent: 'START_SERVICE_QUOTE',
          nextState: 'ESPERANDO_MEDIDAS',
          entities: {
            ambiguousNumber: { value: 30 }
          },
          responsePlan: {
            repeatedQuestion: false
          },
          handoffPlan: {
            needed: false
          }
        }
      })
    ]);

    assert.equal(report.differenceCounts[DIFFERENCE_TYPES.MISINTERPRETED_NUMBER], 1);
    assert.equal(report.criticalMismatchCount, 1);
    assert.equal(report.phase6B.canProceed, false);
  });
});
