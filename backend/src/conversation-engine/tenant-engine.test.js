import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { env } from '../config/env.js';
import {
  assessNcieRisk,
  ENGINE_VERSIONS,
  resolveTenantEngineConfig,
  selectTenantEngine,
  shouldTriggerAutoRollback
} from './tenant-engine.service.js';

const originalEnvVersion = env.conversationEngine.version;
const originalEnvShadowMode = env.conversationEngine.shadowMode;
const originalAutoRollbackEnabled = env.conversationEngine.autoRollbackEnabled;

const baseConfig = {
  empresa_id: 1,
  conversation_engine_version: ENGINE_VERSIONS.LEGACY,
  ncie_enabled: false,
  ncie_canary_percentage: 0,
  ncie_min_confidence: 0.6,
  ncie_min_retrieval_score: 10,
  ncie_auto_rollback_enabled: true,
  ncie_max_risk_rate: 0.35
};

afterEach(() => {
  env.conversationEngine.version = originalEnvVersion;
  env.conversationEngine.shadowMode = originalEnvShadowMode;
  env.conversationEngine.autoRollbackEnabled = originalAutoRollbackEnabled;
});

describe('tenant conversation engine selection', () => {
  it('uses global env NCIE when tenant has no explicit config', () => {
    env.conversationEngine.version = 'ncie';
    env.conversationEngine.shadowMode = false;

    const config = resolveTenantEngineConfig({ empresa_id: 5, tenant_config_empresa_id: null }, 5);
    const selection = selectTenantEngine({ config, conversationKey: 'chat-a' });

    assert.equal(config.conversation_engine_version, 'ncie');
    assert.equal(config.ncie_enabled, true);
    assert.equal(config.ncie_canary_percentage, 100);
    assert.equal(config.config_source, 'env');
    assert.equal(selection.engine, 'ncie');
    assert.equal(selection.responseEngine, 'ncie');
  });

  it('uses global env legacy when tenant has no explicit config', () => {
    env.conversationEngine.version = 'legacy';
    env.conversationEngine.shadowMode = false;

    const config = resolveTenantEngineConfig({ empresa_id: 5, tenant_config_empresa_id: null }, 5);
    const selection = selectTenantEngine({ config, conversationKey: 'chat-a' });

    assert.equal(config.conversation_engine_version, 'legacy');
    assert.equal(config.ncie_enabled, false);
    assert.equal(config.config_source, 'env');
    assert.equal(selection.engine, 'legacy');
  });

  it('lets explicit tenant legacy override global env NCIE', () => {
    env.conversationEngine.version = 'ncie';
    env.conversationEngine.shadowMode = false;

    const config = resolveTenantEngineConfig({
      empresa_id: 5,
      tenant_config_empresa_id: 5,
      conversation_engine_explicit: 1,
      conversation_engine_version: 'legacy',
      ncie_enabled: false,
      ncie_canary_percentage: 0
    }, 5);
    const selection = selectTenantEngine({ config, conversationKey: 'chat-a' });

    assert.equal(config.config_source, 'tenant');
    assert.equal(selection.engine, 'legacy');
  });

  it('lets explicit tenant NCIE override global env legacy', () => {
    env.conversationEngine.version = 'legacy';
    env.conversationEngine.shadowMode = false;

    const config = resolveTenantEngineConfig({
      empresa_id: 5,
      tenant_config_empresa_id: 5,
      conversation_engine_explicit: 1,
      conversation_engine_version: 'ncie',
      ncie_enabled: true,
      ncie_canary_percentage: 100
    }, 5);
    const selection = selectTenantEngine({ config, conversationKey: 'chat-a' });

    assert.equal(config.config_source, 'tenant');
    assert.equal(selection.engine, 'ncie');
    assert.equal(selection.responseEngine, 'ncie');
  });

  it('uses global shadow mode when tenant has no explicit config', () => {
    env.conversationEngine.version = 'ncie';
    env.conversationEngine.shadowMode = true;

    const config = resolveTenantEngineConfig({ empresa_id: 5, tenant_config_empresa_id: null }, 5);
    const selection = selectTenantEngine({ config, conversationKey: 'chat-a' });

    assert.equal(config.conversation_engine_version, 'shadow');
    assert.equal(config.config_source, 'env');
    assert.equal(selection.engine, 'shadow');
    assert.equal(selection.responseEngine, 'legacy');
    assert.equal(selection.shouldRunNcie, true);
  });

  it('ignores default tenant columns when engine was not explicitly configured', () => {
    env.conversationEngine.version = 'ncie';
    env.conversationEngine.shadowMode = false;

    const config = resolveTenantEngineConfig({
      empresa_id: 5,
      tenant_config_empresa_id: 5,
      conversation_engine_explicit: 0,
      conversation_engine_version: 'legacy',
      ncie_enabled: false,
      ncie_canary_percentage: 0
    }, 5);
    const selection = selectTenantEngine({ config, conversationKey: 'chat-a' });

    assert.equal(config.config_source, 'env');
    assert.equal(config.conversation_engine_version, 'ncie');
    assert.equal(selection.engine, 'ncie');
  });

  it('keeps a legacy company on legacy', () => {
    const selection = selectTenantEngine({ config: baseConfig, conversationKey: 'chat-a' });

    assert.equal(selection.engine, 'legacy');
    assert.equal(selection.responseEngine, 'legacy');
    assert.equal(selection.shouldRunNcie, false);
  });

  it('keeps shadow company responding with legacy while running NCIE', () => {
    const selection = selectTenantEngine({
      config: { ...baseConfig, conversation_engine_version: 'shadow' },
      conversationKey: 'chat-a'
    });

    assert.equal(selection.engine, 'shadow');
    assert.equal(selection.responseEngine, 'legacy');
    assert.equal(selection.shouldRunNcie, true);
  });

  it('selects NCIE for an enabled NCIE company with 100 percent canary', () => {
    const selection = selectTenantEngine({
      config: { ...baseConfig, conversation_engine_version: 'ncie', ncie_enabled: true, ncie_canary_percentage: 100 },
      conversationKey: 'chat-a'
    });

    assert.equal(selection.engine, 'ncie');
    assert.equal(selection.responseEngine, 'ncie');
    assert.equal(selection.canarySelected, true);
  });

  it('skips NCIE when canary is 0 percent', () => {
    const selection = selectTenantEngine({
      config: { ...baseConfig, conversation_engine_version: 'ncie', ncie_enabled: true, ncie_canary_percentage: 0 },
      conversationKey: 'chat-a'
    });

    assert.equal(selection.engine, 'legacy');
    assert.equal(selection.canarySelected, false);
  });

  it('selects a stable subset when canary is 50 percent', () => {
    const selected = Array.from({ length: 100 }, (_, index) => selectTenantEngine({
      config: { ...baseConfig, conversation_engine_version: 'ncie', ncie_enabled: true, ncie_canary_percentage: 50 },
      conversationKey: `chat-${index}`
    })).filter((selection) => selection.canarySelected);

    assert.ok(selected.length > 25);
    assert.ok(selected.length < 75);
  });

  it('selects every conversation when canary is 100 percent', () => {
    const selections = Array.from({ length: 20 }, (_, index) => selectTenantEngine({
      config: { ...baseConfig, conversation_engine_version: 'ncie', ncie_enabled: true, ncie_canary_percentage: 100 },
      conversationKey: `chat-${index}`
    }));

    assert.equal(selections.every((selection) => selection.canarySelected), true);
  });
});

describe('tenant NCIE rollback decisions', () => {
  it('triggers rollback after repeated low confidence', () => {
    const shouldRollback = shouldTriggerAutoRollback({
      config: { ...baseConfig, conversation_engine_version: 'ncie', ncie_enabled: true },
      latestRisk: { risky: true, error: false },
      total: 20,
      risky: 8,
      clarifications: 2
    });

    assert.equal(shouldRollback, true);
  });

  it('does not rollback before 20 evaluated interactions even on NCIE error', () => {
    const shouldRollback = shouldTriggerAutoRollback({
      config: { ...baseConfig, conversation_engine_version: 'ncie', ncie_enabled: true },
      latestRisk: { risky: true, error: true },
      total: 19,
      risky: 0,
      clarifications: 0
    });

    assert.equal(shouldRollback, false);
  });

  it('triggers rollback on NCIE error after the minimum sample size', () => {
    const shouldRollback = shouldTriggerAutoRollback({
      config: { ...baseConfig, conversation_engine_version: 'ncie', ncie_enabled: true },
      latestRisk: { risky: true, error: true },
      total: 20,
      risky: 0,
      clarifications: 0
    });

    assert.equal(shouldRollback, true);
  });

  it('triggers rollback when handoff confusion increases', () => {
    const shouldRollback = shouldTriggerAutoRollback({
      config: { ...baseConfig, conversation_engine_version: 'ncie', ncie_enabled: true },
      latestRisk: { risky: false, error: false },
      total: 20,
      risky: 2,
      clarifications: 2,
      handoffs: 8
    });

    assert.equal(shouldRollback, true);
  });

  it('marks low confidence and low retrieval as risky', () => {
    const risk = assessNcieRisk({
      config: baseConfig,
      ncieResult: {
        confianza: 0.4,
        respuesta: 'Necesito confirmar algo?',
        ncie: {
          retrieval: {
            services: [{ score: 2 }],
            products: []
          },
          decision: {}
        }
      }
    });

    assert.equal(risk.risky, true);
    assert.equal(risk.ncieHizoPregunta, true);
  });

  it('marks escalation to human as handoff confusion risk', () => {
    const risk = assessNcieRisk({
      config: baseConfig,
      ncieResult: {
        confianza: 0.9,
        respuesta: 'Voy a pedir apoyo de un asesor.',
        ncie: {
          retrieval: {
            services: [{ score: 30 }],
            products: []
          },
          decision: {
            action: 'escalate_human'
          }
        }
      }
    });

    assert.equal(risk.handoffConfusion, true);
    assert.equal(risk.risky, true);
  });

  it('does not mark safe catalog listing as risky', () => {
    const risk = assessNcieRisk({
      config: baseConfig,
      ncieResult: {
        intencion: 'LISTAR_SERVICIOS',
        confianza: 0.82,
        respuesta: 'Claro. Manejamos servicios de:\n\n1. Diseno web: pagina web\n\n¿Que te gustaria cotizar?',
        ncie: {
          nlu: {
            recommended_action: 'list_service_families'
          },
          retrieval: {
            services: [{ score: 0 }],
            products: []
          },
          decision: {
            action: 'list_service_families'
          }
        }
      }
    });

    assert.equal(risk.risky, false);
    assert.equal(risk.ncieHizoPregunta, true);
  });
});
