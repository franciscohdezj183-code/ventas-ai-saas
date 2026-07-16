import { createHttpError } from '../../utils/http-error.js';
import {
  disconnectWhatsappSession,
  getWhatsappStatus,
  getWhatsappStatusSnapshot,
  listWhatsappStatusSnapshots,
  sendWhatsappMessage,
  sendWhatsappTextDirect,
  shutdownWhatsappSessions,
  startWhatsappSession
} from '../../modules/whatsapp/whatsapp.service.js';
import { validateMessagingProvider, validateStatusSnapshot } from '../messaging-provider.js';

export const whatsappWebProvider = validateMessagingProvider({
  providerName: 'whatsapp-web',

  startSession(empresaId) {
    return startWhatsappSession(empresaId);
  },

  getStatus(empresaId) {
    return validateStatusSnapshot(getWhatsappStatus(empresaId));
  },

  async getStatusSnapshot(empresaId) {
    return validateStatusSnapshot(await getWhatsappStatusSnapshot(empresaId));
  },

  async listStatusSnapshots() {
    const statuses = await listWhatsappStatusSnapshots();
    statuses.forEach(validateStatusSnapshot);
    return statuses;
  },

  async getQr(empresaId) {
    const status = await getWhatsappStatusSnapshot(empresaId);
    validateStatusSnapshot(status);
    return {
      empresa_id: status.empresa_id,
      status: status.status,
      qr: status.qr,
      qr_image: status.qr_image,
      updated_at: status.updated_at
    };
  },

  disconnectSession(empresaId) {
    return disconnectWhatsappSession(empresaId);
  },

  sendText(empresaId, telefono, mensaje) {
    return sendWhatsappMessage(empresaId, telefono, mensaje);
  },

  sendTextDirect(empresaId, destination, mensaje) {
    return sendWhatsappTextDirect(empresaId, destination, mensaje);
  },

  async sendMedia() {
    throw createHttpError(501, 'El envio de media por proveedor neutral aun no esta implementado');
  },

  shutdown() {
    return shutdownWhatsappSessions();
  }
});
