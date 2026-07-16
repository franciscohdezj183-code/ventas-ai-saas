import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { getQueueRegistry } from '../../queues/queue-registry.js';
import { createHttpError } from '../../utils/http-error.js';
import { logger } from '../../utils/logger.js';

function normalizeEmpresaId(empresaId) {
  const id = Number(empresaId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return id;
}

export async function enqueueWhatsappOutboundText({
  empresaId,
  phone = null,
  whatsappChatId = null,
  resolvedPhoneId = null,
  text,
  correlationId = null,
  source = 'api',
  registry = getQueueRegistry(),
  loggerInstance = logger,
  now = () => new Date().toISOString(),
  uuid = randomUUID
}) {
  const id = normalizeEmpresaId(empresaId);
  const cleanText = String(text ?? '').trim();

  if (!cleanText) {
    throw createHttpError(400, 'El mensaje es requerido');
  }

  const queueWrapper = registry?.whatsappOutboundQueue;

  if (!queueWrapper || queueWrapper.status !== 'ready') {
    throw createHttpError(503, 'La cola de salida de WhatsApp no esta disponible');
  }

  const messageId = correlationId ?? uuid();
  const job = await queueWrapper.enqueue({
    messageId,
    empresaId: id,
    provider: 'whatsapp-web',
    whatsappChatId,
    resolvedPhoneId,
    phone,
    type: 'text',
    text: cleanText,
    createdAt: now(),
    correlationId: correlationId ?? messageId,
    source
  });

  loggerInstance.info('whatsapp_outbound_queued', {
    empresaId: id,
    jobId: job?.id,
    source,
    textLength: cleanText.length
  });

  return {
    empresa_id: id,
    telefono_destino: phone,
    status: 'QUEUED',
    queued: true,
    jobId: job?.id,
    messageId,
    queued_at: now()
  };
}
