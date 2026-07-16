import { getMessagingProvider } from './provider-registry.js';

export function createMessagingService(provider = getMessagingProvider()) {
  return {
    get providerName() {
      return provider.providerName;
    },

    startSession(empresaId) {
      return provider.startSession(empresaId);
    },

    getStatus(empresaId) {
      return provider.getStatus(empresaId);
    },

    getStatusSnapshot(empresaId) {
      return provider.getStatusSnapshot(empresaId);
    },

    listStatusSnapshots() {
      return provider.listStatusSnapshots();
    },

    getQr(empresaId) {
      return provider.getQr(empresaId);
    },

    disconnectSession(empresaId) {
      return provider.disconnectSession(empresaId);
    },

    sendText(empresaId, telefono, mensaje) {
      return provider.sendText(empresaId, telefono, mensaje);
    },

    sendMedia(empresaId, telefono, media) {
      return provider.sendMedia(empresaId, telefono, media);
    },

    shutdown() {
      return provider.shutdown();
    }
  };
}

export const messagingService = createMessagingService();
