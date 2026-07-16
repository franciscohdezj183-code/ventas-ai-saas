import { deterministicJobId } from '../queue-factory.js';
import { validateWhatsappInboundJob } from '../queue-payloads.js';
import { env } from '../../config/env.js';

function safeJobId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

export async function enqueueInboundMessage(queue, payload) {
  const job = validateWhatsappInboundJob(payload);
  return queue.add('WHATSAPP_INBOUND_MESSAGE', job, {
    jobId: safeJobId(deterministicJobId('whatsapp-inbound', job.eventId)),
    attempts: env.whatsapp.messageMaxAttempts,
    backoff: {
      type: 'exponential',
      delay: env.queue.backoffMs
    }
  });
}
