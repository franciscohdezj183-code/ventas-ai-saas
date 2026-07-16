import { UnrecoverableError } from 'bullmq';
import { validateWhatsappInboundJob } from '../queue-payloads.js';
import { processSerializedInboundMessage } from '../../modules/whatsapp/whatsapp.service.js';
import { logger } from '../../utils/logger.js';

function normalizeError(error) {
  return {
    name: error?.name ?? 'Error',
    message: String(error?.message ?? error ?? 'Unknown error'),
    code: error?.code,
    statusCode: error?.statusCode ?? error?.status
  };
}

export function createWhatsappInboundProcessor({
  processInbound = processSerializedInboundMessage,
  loggerInstance = logger
} = {}) {
  return async function processWhatsappInbound(job) {
    let inboundJob;

    try {
      inboundJob = validateWhatsappInboundJob(job?.data);
    } catch (error) {
      loggerInstance.error('whatsapp_inbound_failed', {
        jobId: job?.id,
        error: normalizeError(error)
      });
      throw new UnrecoverableError(error.message);
    }

    loggerInstance.info('whatsapp_inbound_started', {
      jobId: job?.id,
      empresaId: inboundJob.empresaId,
      messageId: inboundJob.messageId,
      messageType: inboundJob.messageType,
      bodyLength: String(inboundJob.body ?? '').length
    });

    try {
      const result = await processInbound(inboundJob);
      loggerInstance.info('whatsapp_inbound_completed', {
        jobId: job?.id,
        empresaId: inboundJob.empresaId,
        messageId: inboundJob.messageId,
        outboundQueued: Boolean(result?.outboundQueued)
      });
      return result;
    } catch (error) {
      loggerInstance.error('whatsapp_inbound_failed', {
        jobId: job?.id,
        empresaId: inboundJob.empresaId,
        messageId: inboundJob.messageId,
        error: normalizeError(error)
      });
      throw error;
    }
  };
}

export const processWhatsappInbound = createWhatsappInboundProcessor();
