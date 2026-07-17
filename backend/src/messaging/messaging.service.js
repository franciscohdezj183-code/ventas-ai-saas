import { getMessagingProvider } from './provider-registry.js';
import { env } from '../config/env.js';
import { enqueueWhatsappOutboundText } from '../modules/whatsapp/whatsapp-outbound.service.js';
import { companyProviderService } from './company-provider.service.js';

function isProviderLike(value) {
  return value && typeof value === 'object' && typeof value.startSession === 'function';
}

function withProviderName(status, providerName) {
  return status && typeof status === 'object'
    ? { ...status, provider: status.provider ?? providerName }
    : status;
}

export function createMessagingService(provider = null, {
  enqueueOutbound = enqueueWhatsappOutboundText,
  config = env,
  companyProvider = companyProviderService,
  fallbackProvider = getMessagingProvider()
} = {}) {
  const directProvider = isProviderLike(provider) ? provider : null;

  async function resolveProvider(empresaId) {
    return directProvider ?? companyProvider.getProvider(empresaId);
  }

  async function resolveProviderName(empresaId) {
    return directProvider?.providerName ?? companyProvider.getProviderName(empresaId);
  }

  return {
    get providerName() {
      return directProvider?.providerName ?? 'per-company';
    },

    async startSession(empresaId) {
      const selectedProvider = await resolveProvider(empresaId);
      return withProviderName(await selectedProvider.startSession(empresaId), selectedProvider.providerName);
    },

    async getStatus(empresaId) {
      const selectedProvider = await resolveProvider(empresaId);
      return withProviderName(await selectedProvider.getStatus(empresaId), selectedProvider.providerName);
    },

    async getStatusSnapshot(empresaId) {
      const selectedProvider = await resolveProvider(empresaId);
      return withProviderName(await selectedProvider.getStatusSnapshot(empresaId), selectedProvider.providerName);
    },

    async listStatusSnapshots() {
      if (directProvider) {
        return (await directProvider.listStatusSnapshots()).map((status) => withProviderName(status, directProvider.providerName));
      }

      const restorable = await companyProvider.listRestorableSessions();
      const snapshots = [];

      for (const configRow of restorable) {
        const selectedProvider = await companyProvider.getProvider(configRow.empresaId);
        snapshots.push(withProviderName(await selectedProvider.getStatusSnapshot(configRow.empresaId), selectedProvider.providerName));
      }

      return snapshots;
    },

    async getQr(empresaId) {
      const selectedProvider = await resolveProvider(empresaId);
      return withProviderName(await selectedProvider.getQr(empresaId), selectedProvider.providerName);
    },

    async disconnectSession(empresaId) {
      const selectedProvider = await resolveProvider(empresaId);
      return withProviderName(await selectedProvider.disconnectSession(empresaId), selectedProvider.providerName);
    },

    async restartSession(empresaId) {
      const selectedProvider = await resolveProvider(empresaId);

      if (typeof selectedProvider.restartSession === 'function') {
        return withProviderName(await selectedProvider.restartSession(empresaId), selectedProvider.providerName);
      }

      await selectedProvider.disconnectSession(empresaId);
      return withProviderName(await selectedProvider.startSession(empresaId), selectedProvider.providerName);
    },

    async sendText(empresaId, telefono, mensaje, options = {}) {
      if (config.whatsapp.outboundViaQueue) {
        const providerName = options.provider ?? await resolveProviderName(empresaId);
        return enqueueOutbound({
          empresaId,
          provider: providerName,
          phone: telefono,
          text: mensaje,
          correlationId: options.correlationId,
          source: options.source ?? 'api'
        });
      }

      const selectedProvider = await resolveProvider(empresaId);
      return selectedProvider.sendText(empresaId, telefono, mensaje);
    },

    async sendTextDirect(empresaId, telefono, mensaje) {
      const selectedProvider = await resolveProvider(empresaId);
      return selectedProvider.sendTextDirect?.(empresaId, telefono, mensaje) ?? selectedProvider.sendText(empresaId, telefono, mensaje);
    },

    async sendMedia(empresaId, telefono, media) {
      const selectedProvider = await resolveProvider(empresaId);
      return selectedProvider.sendMedia(empresaId, telefono, media);
    },

    async shutdown() {
      if (directProvider) {
        return directProvider.shutdown();
      }

      const providers = new Map();

      for (const configRow of await companyProvider.listRestorableSessions()) {
        const selectedProvider = await companyProvider.getProvider(configRow.empresaId);
        providers.set(selectedProvider.providerName, selectedProvider);
      }

      await Promise.allSettled(Array.from(providers.values()).map((selectedProvider) => selectedProvider.shutdown()));
    }
  };
}

export const messagingService = createMessagingService();
