import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { createHttpError } from '../utils/http-error.js';
import { logger } from '../utils/logger.js';
import { createProviderRegistry } from './provider-registry.js';

export const SUPPORTED_WHATSAPP_PROVIDERS = ['whatsapp-web', 'baileys'];
export const DESIRED_SESSION_STATES = ['CONNECTED', 'DISCONNECTED'];
const DEFAULT_PROVIDER = 'baileys';
const DEFAULT_CACHE_TTL_MS = 5000;

function normalizeEmpresaId(empresaId) {
  const id = Number(empresaId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return id;
}

function normalizeProvider(provider) {
  const value = String(provider ?? '').trim();

  if (!SUPPORTED_WHATSAPP_PROVIDERS.includes(value)) {
    throw createHttpError(400, `Proveedor de WhatsApp invalido: ${value || 'vacio'}`);
  }

  return value;
}

function normalizeDesiredState(state) {
  const value = String(state ?? '').trim().toUpperCase();

  if (!DESIRED_SESSION_STATES.includes(value)) {
    throw createHttpError(400, `desired_state invalido: ${value || 'vacio'}`);
  }

  return value;
}

function fallbackProvider(config) {
  return SUPPORTED_WHATSAPP_PROVIDERS.includes(config.whatsapp.provider)
    ? config.whatsapp.provider
    : DEFAULT_PROVIDER;
}

function operativeStatusBlocksProviderChange(status) {
  return ['INITIALIZING', 'QR_READY', 'CONNECTED', 'RECONNECTING'].includes(status);
}

export function createCompanyProviderService({
  config = env,
  queryFn = query,
  providerFactory = (providerName) => createProviderRegistry({ providerName }),
  getStatusSnapshot = null,
  loggerInstance = logger,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  now = Date.now
} = {}) {
  const cache = new Map();

  function cacheGet(empresaId) {
    const entry = cache.get(Number(empresaId));
    return entry && entry.expiresAt > now() ? entry.value : null;
  }

  function cacheSet(empresaId, value) {
    cache.set(Number(empresaId), {
      expiresAt: now() + cacheTtlMs,
      value
    });
  }

  function invalidate(empresaId) {
    if (empresaId === undefined || empresaId === null) {
      cache.clear();
      return;
    }

    cache.delete(Number(empresaId));
  }

  async function empresaExists(empresaId) {
    const [rows] = await queryFn(
      'SELECT id FROM empresas WHERE id = ? AND activo = 1 AND estado = ? LIMIT 1',
      [empresaId, 'ACTIVA']
    );
    return rows.length > 0;
  }

  async function readConfig(empresaId) {
    const [rows] = await queryFn(
      `SELECT c.empresa_id, c.provider, c.desired_state, c.auto_restore, e.activo, e.estado
         FROM empresas e
         LEFT JOIN whatsapp_session_config c ON c.empresa_id = e.id
        WHERE e.id = ?
        LIMIT 1`,
      [empresaId]
    );

    if (!rows.length || Number(rows[0].activo) !== 1 || rows[0].estado !== 'ACTIVA') {
      throw createHttpError(404, 'Empresa no encontrada o inactiva');
    }

    const row = rows[0];
    const effectiveProvider = row.provider ? normalizeProvider(row.provider) : fallbackProvider(config);

    return {
      empresaId,
      provider: row.provider ?? null,
      effectiveProvider,
      desiredState: row.desired_state ?? 'DISCONNECTED',
      autoRestore: row.auto_restore === null || row.auto_restore === undefined ? true : Boolean(row.auto_restore)
    };
  }

  async function getSessionConfig(empresaId) {
    const id = normalizeEmpresaId(empresaId);
    const cached = cacheGet(id);

    if (cached) {
      return cached;
    }

    const value = await readConfig(id);
    cacheSet(id, value);
    return value;
  }

  async function setDesiredState(empresaId, state) {
    const id = normalizeEmpresaId(empresaId);
    const desiredState = normalizeDesiredState(state);

    if (!(await empresaExists(id))) {
      throw createHttpError(404, 'Empresa no encontrada o inactiva');
    }

    await queryFn(
      `INSERT INTO whatsapp_session_config (empresa_id, desired_state)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE desired_state = VALUES(desired_state), updated_at = CURRENT_TIMESTAMP`,
      [id, desiredState]
    );
    invalidate(id);
    return getSessionConfig(id);
  }

  async function ensureDefaultSessionConfig(empresaId) {
    const id = normalizeEmpresaId(empresaId);

    if (!(await empresaExists(id))) {
      throw createHttpError(404, 'Empresa no encontrada o inactiva');
    }

    await queryFn(
      `INSERT IGNORE INTO whatsapp_session_config
        (empresa_id, provider, desired_state, auto_restore)
       VALUES (?, 'baileys', 'DISCONNECTED', 1)`,
      [id]
    );
    invalidate(id);
    return getSessionConfig(id);
  }

  return {
    normalizeProvider,
    normalizeDesiredState,
    invalidate,

    async getSessionConfig(empresaId) {
      return getSessionConfig(empresaId);
    },

    async getProviderName(empresaId) {
      return (await getSessionConfig(empresaId)).effectiveProvider;
    },

    async getProvider(empresaId) {
      const providerName = await this.getProviderName(empresaId);
      loggerInstance.info('whatsapp_provider_resolved', {
        empresaId: normalizeEmpresaId(empresaId),
        provider: providerName
      });
      return providerFactory(providerName);
    },

    async setProvider(empresaId, provider, options = {}) {
      const id = normalizeEmpresaId(empresaId);
      const providerName = normalizeProvider(provider);
      const currentConfig = await getSessionConfig(id);
      const sameEffectiveProvider = providerName === currentConfig.effectiveProvider;

      if (sameEffectiveProvider) {
        await queryFn(
          `INSERT INTO whatsapp_session_config (empresa_id, provider)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE provider = VALUES(provider), updated_at = CURRENT_TIMESTAMP`,
          [id, providerName]
        );
        invalidate(id);
        loggerInstance.info('whatsapp_provider_changed', {
          empresaId: id,
          provider: providerName,
          requestedBy: options.requestedBy ?? null,
          idempotent: true
        });
        return getSessionConfig(id);
      }

      if (currentConfig.desiredState !== 'DISCONNECTED') {
        throw createHttpError(409, 'El proveedor solo puede cambiarse con desired_state=DISCONNECTED');
      }

      const status = options.currentStatus ?? (getStatusSnapshot ? await getStatusSnapshot(id) : null);

      if (operativeStatusBlocksProviderChange(status?.status)) {
        throw createHttpError(409, 'No se puede cambiar proveedor con una sesion operativa activa');
      }

      await queryFn(
        `INSERT INTO whatsapp_session_config (empresa_id, provider, desired_state)
         VALUES (?, ?, 'DISCONNECTED')
         ON DUPLICATE KEY UPDATE provider = VALUES(provider), updated_at = CURRENT_TIMESTAMP`,
        [id, providerName]
      );
      invalidate(id);
      loggerInstance.info('whatsapp_provider_changed', {
        empresaId: id,
        provider: providerName,
        requestedBy: options.requestedBy ?? null
      });
      return getSessionConfig(id);
    },

    async setDesiredState(empresaId, state) {
      return setDesiredState(empresaId, state);
    },

    async ensureDefaultSessionConfig(empresaId) {
      return ensureDefaultSessionConfig(empresaId);
    },

    async listRestorableSessions() {
      const [rows] = await queryFn(
        `SELECT c.empresa_id, c.provider, c.desired_state, c.auto_restore
           FROM whatsapp_session_config c
           INNER JOIN empresas e ON e.id = c.empresa_id
           LEFT JOIN whatsapp_session_recovery r ON r.empresa_id = c.empresa_id
          WHERE c.desired_state = 'CONNECTED'
            AND c.auto_restore = 1
            AND e.activo = 1
            AND e.estado = 'ACTIVA'
            AND (r.recovery_status IS NULL OR r.recovery_status <> 'BLOCKED')`
      );

      return rows
        .map((row) => ({
          empresaId: Number(row.empresa_id),
          provider: row.provider ?? null,
          effectiveProvider: row.provider ? normalizeProvider(row.provider) : fallbackProvider(config),
          desiredState: row.desired_state,
          autoRestore: Boolean(row.auto_restore)
        }))
        .filter((row) => SUPPORTED_WHATSAPP_PROVIDERS.includes(row.effectiveProvider));
    },

    async listProviderInventory() {
      const [rows] = await queryFn(
        `SELECT e.id AS empresa_id,
                c.provider,
                c.desired_state,
                c.auto_restore,
                s.status AS session_status
           FROM empresas e
           LEFT JOIN whatsapp_session_config c ON c.empresa_id = e.id
           LEFT JOIN whatsapp_session_status s ON s.empresa_id = e.id
          ORDER BY e.id ASC`
      );

      return rows.map((row) => {
        const configuredProvider = row.provider ?? null;
        return {
          empresa_id: Number(row.empresa_id),
          provider_configurado: configuredProvider,
          provider_efectivo: configuredProvider ? normalizeProvider(configuredProvider) : fallbackProvider(config),
          desired_state: row.desired_state ?? 'DISCONNECTED',
          auto_restore: row.auto_restore === null || row.auto_restore === undefined ? true : Boolean(row.auto_restore),
          session_status: row.session_status ?? 'DISCONNECTED'
        };
      });
    }
  };
}

export const companyProviderService = createCompanyProviderService();
