import { createHttpError } from '../../utils/http-error.js';
import { validateMessagingProvider, validateStatusSnapshot } from '../messaging-provider.js';
import { baileysService } from '../../modules/whatsapp-baileys/baileys.service.js';

export const baileysProvider = validateMessagingProvider({
  providerName: 'baileys',

  startSession(empresaId) {
    return baileysService.startSession(empresaId);
  },

  getStatus(empresaId) {
    return validateStatusSnapshot(baileysService.getStatus(empresaId));
  },

  async getStatusSnapshot(empresaId) {
    return validateStatusSnapshot(await baileysService.getStatusSnapshot(empresaId));
  },

  async listStatusSnapshots() {
    const statuses = await baileysService.listStatusSnapshots();
    statuses.forEach(validateStatusSnapshot);
    return statuses;
  },

  getQr(empresaId) {
    return baileysService.getQr(empresaId);
  },

  disconnectSession(empresaId) {
    return baileysService.disconnectSession(empresaId);
  },

  restartSession(empresaId) {
    return baileysService.restartSession(empresaId);
  },

  sendText(empresaId, telefono, mensaje) {
    return baileysService.sendText(empresaId, telefono, mensaje);
  },

  sendTextDirect(empresaId, destination, mensaje) {
    return baileysService.sendTextDirect(empresaId, destination, mensaje);
  },

  async sendMedia() {
    throw createHttpError(501, 'El envio de multimedia por Baileys no esta implementado en esta fase');
  },

  shutdown() {
    return baileysService.shutdown();
  }
});
