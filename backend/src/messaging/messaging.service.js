import { getMessagingProvider } from './provider-registry.js';
import { env } from '../config/env.js';
import { enqueueWhatsappOutboundText } from '../modules/whatsapp/whatsapp-outbound.service.js';

export function createMessagingService(provider = getMessagingProvider(), { enqueueOutbound = enqueueWhatsappOutboundText, config = env } = {}) {
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

    sendText(empresaId, telefono, mensaje, options = {}) {
      if (config.whatsapp.outboundViaQueue) {
        return enqueueOutbound({
          empresaId,
          phone: telefono,
          text: mensaje,
          correlationId: options.correlationId,
          source: options.source ?? 'api'
        });
      }

      return provider.sendText(empresaId, telefono, mensaje);
    },

    sendTextDirect(empresaId, telefono, mensaje) {
      return provider.sendTextDirect?.(empresaId, telefono, mensaje) ?? provider.sendText(empresaId, telefono, mensaje);
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
