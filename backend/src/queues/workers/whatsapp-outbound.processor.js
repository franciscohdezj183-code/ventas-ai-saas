import { UnrecoverableError } from 'bullmq';
import { validateWhatsappOutboundJob } from '../queue-payloads.js';
import { messagingService } from '../../messaging/messaging.service.js';
import { logger } from '../../utils/logger.js';
import { companyProviderService } from '../../messaging/company-provider.service.js';
import { whatsappSessionLeaseService } from '../whatsapp-session-lease.service.js';

function maskIdentifier(value) {
  const rawValue = String(value ?? '');

  if (!rawValue) {
    return null;
  }

  if (rawValue.length <= 8) {
    return `${rawValue.slice(0, 2)}***`;
  }

  return `${rawValue.slice(0, 4)}***${rawValue.slice(-5)}`;
}

function normalizeError(error) {
  return {
    name: error?.name ?? 'Error',
    message: String(error?.message ?? error ?? 'Unknown error'),
    code: error?.code,
    statusCode: error?.statusCode ?? error?.status
  };
}

export function createWhatsappOutboundProcessor({
  service = messagingService,
  loggerInstance = logger,
  companyProvider = null,
  sessionLease = null
} = {}) {
  return async function processWhatsappOutbound(job) {
    let outboundJob;

    try {
      outboundJob = validateWhatsappOutboundJob(job?.data);
    } catch (error) {
      loggerInstance.error('whatsapp_outbound_failed', {
        jobId: job?.id,
        error: normalizeError(error)
      });
      throw new UnrecoverableError(error.message);
    }

    if (outboundJob.type !== 'text') {
      loggerInstance.warn('whatsapp_outbound_media_not_supported_in_queue_mode', {
        jobId: job?.id,
        empresaId: outboundJob.empresaId,
        type: outboundJob.type
      });
      return { sent: false, unsupported: true };
    }

    if (companyProvider?.getProviderName) {
      const configuredProvider = await companyProvider.getProviderName(outboundJob.empresaId);

      if (configuredProvider !== outboundJob.provider) {
        const error = new Error('El provider del job outbound no coincide con el provider configurado');
        error.code = 'WHATSAPP_OUTBOUND_PROVIDER_MISMATCH';
        loggerInstance.error('whatsapp_outbound_failed', {
          jobId: job?.id,
          empresaId: outboundJob.empresaId,
          provider: outboundJob.provider,
          configuredProvider
        });
        throw error;
      }
    }

    if (sessionLease?.owns && !sessionLease.owns(outboundJob.empresaId)) {
      const error = new Error('El gateway no posee el lease de la sesion WhatsApp');
      error.code = 'WHATSAPP_SESSION_LEASE_REQUIRED';
      loggerInstance.warn('whatsapp_outbound_send_deferred', {
        jobId: job?.id,
        empresaId: outboundJob.empresaId,
        reason: error.code
      });
      throw error;
    }

    const attempts = [];
    const destinations = [
      { method: 'whatsappChatId', value: outboundJob.whatsappChatId },
      { method: 'resolvedPhoneId', value: outboundJob.resolvedPhoneId },
      { method: 'phone', value: outboundJob.phone }
    ].filter((item, index, items) => item.value && items.findIndex((candidate) => candidate.value === item.value) === index);

    loggerInstance.info('whatsapp_outbound_started', {
      jobId: job?.id,
      empresaId: outboundJob.empresaId,
      textLength: String(outboundJob.text ?? '').length
    });

    for (const destination of destinations) {
      try {
        const result = await service.sendTextDirect(outboundJob.empresaId, destination.value, outboundJob.text);
        attempts.push({ method: destination.method, success: true });
        loggerInstance.info('whatsapp_outbound_sent', {
          jobId: job?.id,
          empresaId: outboundJob.empresaId,
          method: destination.method,
          destination: maskIdentifier(destination.value)
        });
        return { ...result, attempts };
      } catch (error) {
        attempts.push({ method: destination.method, success: false, error: normalizeError(error) });
        loggerInstance.warn('whatsapp_outbound_send_failed', {
          jobId: job?.id,
          empresaId: outboundJob.empresaId,
          method: destination.method,
          destination: maskIdentifier(destination.value),
          error: normalizeError(error)
        });
      }
    }

    const error = new Error('No se pudo enviar la respuesta de WhatsApp por ningun destino disponible');
    error.attempts = attempts;
    loggerInstance.error('whatsapp_outbound_failed', {
      jobId: job?.id,
      empresaId: outboundJob.empresaId,
      attempts
    });
    throw error;
  };
}

export const processWhatsappOutbound = createWhatsappOutboundProcessor({
  companyProvider: companyProviderService,
  sessionLease: whatsappSessionLeaseService
});
