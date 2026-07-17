import { createHttpError } from '../../utils/http-error.js';
import { validateMessagingProvider, validateStatusSnapshot } from '../messaging-provider.js';

async function whatsappService() {
  return import('../../modules/whatsapp/whatsapp.service.js');
}

export const whatsappWebProvider = validateMessagingProvider({
  providerName: 'whatsapp-web',

  async startSession(empresaId) {
    return (await whatsappService()).startWhatsappSession(empresaId);
  },

  async getStatus(empresaId) {
    return validateStatusSnapshot((await whatsappService()).getWhatsappStatus(empresaId));
  },

  async getStatusSnapshot(empresaId) {
    return validateStatusSnapshot(await (await whatsappService()).getWhatsappStatusSnapshot(empresaId));
  },

  async listStatusSnapshots() {
    const statuses = await (await whatsappService()).listWhatsappStatusSnapshots();
    statuses.forEach(validateStatusSnapshot);
    return statuses;
  },

  async getQr(empresaId) {
    const status = await (await whatsappService()).getWhatsappStatusSnapshot(empresaId);
    validateStatusSnapshot(status);
    return {
      empresa_id: status.empresa_id,
      status: status.status,
      qr: status.qr,
      qr_image: status.qr_image,
      updated_at: status.updated_at
    };
  },

  async disconnectSession(empresaId) {
    return (await whatsappService()).disconnectWhatsappSession(empresaId);
  },

  async restartSession(empresaId) {
    const service = await whatsappService();
    await service.disconnectWhatsappSession(empresaId);
    return service.startWhatsappSession(empresaId);
  },

  async sendText(empresaId, telefono, mensaje) {
    return (await whatsappService()).sendWhatsappMessage(empresaId, telefono, mensaje);
  },

  async sendTextDirect(empresaId, destination, mensaje) {
    return (await whatsappService()).sendWhatsappTextDirect(empresaId, destination, mensaje);
  },

  async sendMedia() {
    throw createHttpError(501, 'El envio de media por proveedor neutral aun no esta implementado');
  },

  async shutdown() {
    return (await whatsappService()).shutdownWhatsappSessions();
  }
});
