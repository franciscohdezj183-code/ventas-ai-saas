import { deterministicJobId } from '../queue-factory.js';
import { validateWhatsappOutboundJob } from '../queue-payloads.js';
import { env } from '../../config/env.js';

function safeJobId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

export async function enqueueOutboundMessage(queue, payload) {
  const job = validateWhatsappOutboundJob(payload);
  const dedupeId = job.correlationId ?? job.messageId;
  return queue.add('WHATSAPP_OUTBOUND_MESSAGE', job, {
    jobId: safeJobId(deterministicJobId('whatsapp-outbound', dedupeId)),
    attempts: env.whatsapp.messageMaxAttempts,
    backoff: {
      type: 'exponential',
      delay: env.queue.backoffMs
    }
  });
}
