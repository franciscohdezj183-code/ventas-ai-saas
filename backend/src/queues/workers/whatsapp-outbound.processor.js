import { UnrecoverableError } from 'bullmq';
import { validateWhatsappOutboundJob } from '../queue-payloads.js';
import { messagingService } from '../../messaging/messaging.service.js';
import { logger } from '../../utils/logger.js';
import { companyProviderService } from '../../messaging/company-provider.service.js';
import { whatsappSessionLeaseService } from '../whatsapp-session-lease.service.js';
import {
  createOutboundIdempotencyKey,
  createOutboundPayloadHash,
  whatsappIdempotencyService
} from '../../modules/whatsapp/whatsapp-idempotency.service.js';

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
  sessionLease = null,
  idempotency = null
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
    const idempotencyKey = createOutboundIdempotencyKey(outboundJob);

    if (idempotency) {
      const payloadHash = createOutboundPayloadHash(outboundJob);
      const claim = await idempotency.claimOutbound({
        empresaId: outboundJob.empresaId,
        provider: outboundJob.provider,
        idempotencyKey,
        correlationId: outboundJob.correlationId ?? outboundJob.messageId,
        payloadHash
      });

      if (!claim.claimed) {
        if (claim.sent) {
          return {
            status: 'SENT',
            duplicate: true,
            provider_message_id: claim.providerMessageId ?? null
          };
        }

        const error = new Error('Entrega outbound ya esta en proceso para esta idempotency_key');
        error.code = 'WHATSAPP_OUTBOUND_IN_PROGRESS';
        throw error;
      }
    }

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
      let result;

      try {
        result = await service.sendTextDirect(outboundJob.empresaId, destination.value, outboundJob.text);
      } catch (error) {
        attempts.push({ method: destination.method, success: false, error: normalizeError(error) });
        loggerInstance.warn('whatsapp_outbound_send_failed', {
          jobId: job?.id,
          empresaId: outboundJob.empresaId,
          method: destination.method,
          destination: maskIdentifier(destination.value),
          error: normalizeError(error)
        });
        continue;
      }

      try {
        await idempotency?.completeOutbound({
          empresaId: outboundJob.empresaId,
          provider: outboundJob.provider,
          idempotencyKey,
          providerMessageId: result?.provider_message_id ?? result?.messageId ?? result?.id ?? null
        });
      } catch (error) {
        loggerInstance.warn('whatsapp_outbound_delivery_uncertain', {
          jobId: job?.id,
          empresaId: outboundJob.empresaId,
          provider: outboundJob.provider,
          idempotencyKey,
          error: normalizeError(error)
        });
        throw error;
      }

      attempts.push({ method: destination.method, success: true });
      loggerInstance.info('whatsapp_outbound_sent', {
        jobId: job?.id,
        empresaId: outboundJob.empresaId,
        method: destination.method,
        destination: maskIdentifier(destination.value)
      });
      return { ...result, attempts };
    }

    const error = new Error('No se pudo enviar la respuesta de WhatsApp por ningun destino disponible');
    error.attempts = attempts;
    await idempotency?.failOutbound({
      empresaId: outboundJob.empresaId,
      provider: outboundJob.provider,
      idempotencyKey,
      error
    }).catch(() => {});
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
  sessionLease: whatsappSessionLeaseService,
  idempotency: whatsappIdempotencyService
});
