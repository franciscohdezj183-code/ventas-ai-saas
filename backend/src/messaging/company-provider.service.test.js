import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompanyProviderService } from './company-provider.service.js';

function createRows() {
  return {
    empresas: new Map([
      [5, { id: 5, activo: 1, estado: 'ACTIVA' }],
      [6, { id: 6, activo: 1, estado: 'ACTIVA' }]
    ]),
    configs: new Map()
  };
}

function queryFnFactory(rows, calls = []) {
  return async function queryFn(sql, params = []) {
    calls.push({ sql, params });

    if (sql.includes('SELECT id FROM empresas')) {
      const empresa = rows.empresas.get(Number(params[0]));
      return [[empresa && empresa.activo === 1 && empresa.estado === params[1] ? { id: empresa.id } : undefined].filter(Boolean)];
    }

    if (sql.includes('LEFT JOIN whatsapp_session_config')) {
      const empresaId = Number(params[0]);
      const empresa = rows.empresas.get(empresaId);
      const config = rows.configs.get(empresaId);
      return empresa ? [[{
        empresa_id: config ? empresaId : null,
        provider: config?.provider ?? null,
        desired_state: config?.desired_state ?? null,
        auto_restore: config?.auto_restore ?? null,
        activo: empresa.activo,
        estado: empresa.estado
      }]] : [[]];
    }

    if (sql.includes('INSERT INTO whatsapp_session_config') && sql.includes('provider')) {
      const current = rows.configs.get(Number(params[0]));
      rows.configs.set(Number(params[0]), {
        provider: params[1],
        desired_state: sql.includes('desired_state') ? 'DISCONNECTED' : (current?.desired_state ?? 'DISCONNECTED'),
        auto_restore: current?.auto_restore ?? 1
      });
      return [[]];
    }

    if (sql.includes('INSERT IGNORE INTO whatsapp_session_config')) {
      const empresaId = Number(params[0]);
      if (!rows.configs.has(empresaId)) {
        rows.configs.set(empresaId, {
          provider: 'baileys',
          desired_state: 'DISCONNECTED',
          auto_restore: 1
        });
      }
      return [[{ affectedRows: rows.configs.has(empresaId) ? 0 : 1 }]];
    }

    if (sql.includes('INSERT INTO whatsapp_session_config') && sql.includes('desired_state')) {
      const empresaId = Number(params[0]);
      rows.configs.set(empresaId, {
        provider: rows.configs.get(empresaId)?.provider ?? null,
        desired_state: params[1],
        auto_restore: rows.configs.get(empresaId)?.auto_restore ?? 1
      });
      return [[]];
    }

    if (sql.includes('FROM whatsapp_session_config c')) {
      return [[...rows.configs.entries()].map(([empresaId, config]) => ({
        empresa_id: empresaId,
        provider: config.provider,
        desired_state: config.desired_state,
        auto_restore: config.auto_restore
      })).filter((row) => row.desired_state === 'CONNECTED' && row.auto_restore === 1)];
    }

    throw new Error(`Unexpected query: ${sql}`);
  };
}

function serviceHarness() {
  const rows = createRows();
  const calls = [];
  const providers = [];
  const service = createCompanyProviderService({
    config: { whatsapp: { provider: 'whatsapp-web' } },
    queryFn: queryFnFactory(rows, calls),
    providerFactory(providerName) {
      providers.push(providerName);
      return { providerName };
    },
    getStatusSnapshot: async () => ({ status: 'DISCONNECTED' }),
    loggerInstance: { info() {}, warn() {}, error() {} },
    cacheTtlMs: 1000,
    now: () => 1000
  });
  return { calls, providers, rows, service };
}

function serviceHarnessWithOptions(options = {}) {
  const rows = createRows();
  const calls = [];
  const providers = [];
  const service = createCompanyProviderService({
    config: { whatsapp: { provider: options.globalProvider ?? 'whatsapp-web' } },
    queryFn: queryFnFactory(rows, calls),
    providerFactory(providerName) {
      providers.push(providerName);
      return { providerName };
    },
    getStatusSnapshot: async () => ({ status: options.status ?? 'DISCONNECTED' }),
    loggerInstance: { info() {}, warn() {}, error() {} },
    cacheTtlMs: 1000,
    now: () => 1000
  });
  return { calls, providers, rows, service };
}

function serviceHarnessNoProvider() {
  const rows = createRows();
  const calls = [];
  const service = createCompanyProviderService({
    config: { whatsapp: {} },
    queryFn: queryFnFactory(rows, calls),
    loggerInstance: { info() {}, warn() {}, error() {} },
    cacheTtlMs: 1000,
    now: () => 1000
  });
  return { calls, rows, service };
}

test('company without config uses env provider fallback', async () => {
  const { service } = serviceHarness();

  assert.equal(await service.getProviderName(5), 'whatsapp-web');
});

test('fallback without WHATSAPP_PROVIDER returns baileys', async () => {
  const { service } = serviceHarnessNoProvider();

  assert.equal(await service.getProviderName(5), 'baileys');
});

test('explicit whatsapp-web provider keeps priority over baileys default', async () => {
  const { rows, service } = serviceHarnessNoProvider();
  rows.configs.set(5, { provider: 'whatsapp-web', desired_state: 'DISCONNECTED', auto_restore: 1 });

  assert.equal(await service.getProviderName(5), 'whatsapp-web');
});

test('empresa 5 uses baileys and empresa 6 uses whatsapp-web', async () => {
  const { rows, service } = serviceHarness();
  rows.configs.set(5, { provider: 'baileys', desired_state: 'DISCONNECTED', auto_restore: 1 });
  rows.configs.set(6, { provider: 'whatsapp-web', desired_state: 'DISCONNECTED', auto_restore: 1 });

  assert.equal(await service.getProviderName(5), 'baileys');
  assert.equal(await service.getProviderName(6), 'whatsapp-web');
});

test('invalid provider is rejected', async () => {
  const { service } = serviceHarness();

  await assert.rejects(() => service.setProvider(5, 'bad-provider'), /Proveedor de WhatsApp invalido/);
});

test('cache is isolated and invalidated after provider change', async () => {
  const { calls, rows, service } = serviceHarness();
  rows.configs.set(5, { provider: 'baileys', desired_state: 'DISCONNECTED', auto_restore: 1 });
  rows.configs.set(6, { provider: 'whatsapp-web', desired_state: 'DISCONNECTED', auto_restore: 1 });

  assert.equal(await service.getProviderName(5), 'baileys');
  assert.equal(await service.getProviderName(6), 'whatsapp-web');
  const before = calls.length;
  assert.equal(await service.getProviderName(5), 'baileys');
  assert.equal(calls.length, before);

  await service.setProvider(5, 'whatsapp-web');
  assert.equal(await service.getProviderName(5), 'whatsapp-web');
});

test('provider change only allowed when disconnected and does not clear credentials', async () => {
  const credentials = new Map([[5, 'still-here']]);
  const { rows, service } = serviceHarness();
  rows.configs.set(5, { provider: 'baileys', desired_state: 'CONNECTED', auto_restore: 1 });

  await assert.rejects(() => service.setProvider(5, 'whatsapp-web'), /desired_state=DISCONNECTED/);
  assert.equal(credentials.get(5), 'still-here');
});

test('global baileys fallback plus requested baileys with CONNECTED session is allowed', async () => {
  const { rows, service } = serviceHarnessWithOptions({ globalProvider: 'baileys', status: 'CONNECTED' });

  const result = await service.setProvider(5, 'baileys');

  assert.equal(result.provider, 'baileys');
  assert.equal(result.effectiveProvider, 'baileys');
  assert.equal(rows.configs.get(5).provider, 'baileys');
});

test('explicit baileys plus requested baileys is idempotent while connected', async () => {
  const { rows, service } = serviceHarnessWithOptions({ status: 'CONNECTED' });
  rows.configs.set(5, { provider: 'baileys', desired_state: 'CONNECTED', auto_restore: 1 });

  const result = await service.setProvider(5, 'baileys');

  assert.equal(result.effectiveProvider, 'baileys');
  assert.equal(result.desiredState, 'CONNECTED');
});

test('effective baileys plus requested whatsapp-web with CONNECTED session is rejected', async () => {
  const { rows, service } = serviceHarnessWithOptions({ status: 'CONNECTED' });
  rows.configs.set(5, { provider: 'baileys', desired_state: 'DISCONNECTED', auto_restore: 1 });

  await assert.rejects(
    () => service.setProvider(5, 'whatsapp-web'),
    /sesion operativa activa/
  );
});

test('same provider preserves desired_state CONNECTED and auto_restore value', async () => {
  const { rows, service } = serviceHarnessWithOptions({ status: 'CONNECTED' });
  rows.configs.set(5, { provider: 'baileys', desired_state: 'CONNECTED', auto_restore: 0 });

  const result = await service.setProvider(5, 'baileys');

  assert.equal(result.desiredState, 'CONNECTED');
  assert.equal(result.autoRestore, false);
  assert.deepEqual(rows.configs.get(5), { provider: 'baileys', desired_state: 'CONNECTED', auto_restore: 0 });
});

test('idempotent provider persistence leaves other companies intact', async () => {
  const { rows, service } = serviceHarnessWithOptions({ status: 'CONNECTED' });
  rows.configs.set(5, { provider: 'baileys', desired_state: 'CONNECTED', auto_restore: 1 });
  rows.configs.set(6, { provider: 'whatsapp-web', desired_state: 'DISCONNECTED', auto_restore: 0 });

  await service.setProvider(5, 'baileys');

  assert.deepEqual(rows.configs.get(6), { provider: 'whatsapp-web', desired_state: 'DISCONNECTED', auto_restore: 0 });
});

test('listRestorableSessions returns only desired connected auto restore sessions', async () => {
  const { rows, service } = serviceHarness();
  rows.configs.set(5, { provider: 'baileys', desired_state: 'CONNECTED', auto_restore: 1 });
  rows.configs.set(6, { provider: 'whatsapp-web', desired_state: 'DISCONNECTED', auto_restore: 1 });

  assert.deepEqual(await service.listRestorableSessions(), [{
    empresaId: 5,
    provider: 'baileys',
    effectiveProvider: 'baileys',
    desiredState: 'CONNECTED',
    autoRestore: true
  }]);
});

test('onboarding default config is baileys and idempotent without altering existing config', async () => {
  const { rows, service } = serviceHarness();
  rows.configs.set(6, { provider: 'whatsapp-web', desired_state: 'CONNECTED', auto_restore: 0 });

  await service.ensureDefaultSessionConfig(5);
  await service.ensureDefaultSessionConfig(5);
  await service.ensureDefaultSessionConfig(6);

  assert.deepEqual(rows.configs.get(5), {
    provider: 'baileys',
    desired_state: 'DISCONNECTED',
    auto_restore: 1
  });
  assert.deepEqual(rows.configs.get(6), {
    provider: 'whatsapp-web',
    desired_state: 'CONNECTED',
    auto_restore: 0
  });
});

test('provider inventory is read-only and isolated per company', async () => {
  const rows = createRows();
  rows.configs.set(5, { provider: 'baileys', desired_state: 'CONNECTED', auto_restore: 1, session_status: 'CONNECTED' });
  rows.configs.set(6, { provider: 'whatsapp-web', desired_state: 'DISCONNECTED', auto_restore: 0, session_status: 'DISCONNECTED' });
  const calls = [];
  const service = createCompanyProviderService({
    config: { whatsapp: {} },
    queryFn: async (sql) => {
      calls.push(sql);

      if (sql.includes('LEFT JOIN whatsapp_session_status')) {
        return [[...rows.empresas.keys()].map((empresaId) => {
          const config = rows.configs.get(empresaId);
          return {
            empresa_id: empresaId,
            provider: config?.provider ?? null,
            desired_state: config?.desired_state ?? null,
            auto_restore: config?.auto_restore ?? null,
            session_status: config?.session_status ?? null
          };
        })];
      }

      throw new Error(`Unexpected query: ${sql}`);
    },
    loggerInstance: { info() {}, warn() {}, error() {} }
  });

  assert.deepEqual(await service.listProviderInventory(), [
    {
      empresa_id: 5,
      provider_configurado: 'baileys',
      provider_efectivo: 'baileys',
      desired_state: 'CONNECTED',
      auto_restore: true,
      session_status: 'CONNECTED'
    },
    {
      empresa_id: 6,
      provider_configurado: 'whatsapp-web',
      provider_efectivo: 'whatsapp-web',
      desired_state: 'DISCONNECTED',
      auto_restore: false,
      session_status: 'DISCONNECTED'
    }
  ]);
  assert.equal(calls.length, 1);
});
