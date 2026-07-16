import { deterministicJobId } from '../queue-factory.js';
import { validateWhatsappInboundJob } from '../queue-payloads.js';

export async function enqueueInboundMessage(queue, payload) {
  const job = validateWhatsappInboundJob(payload);
  return queue.add('WHATSAPP_INBOUND_MESSAGE', job, {
    jobId: deterministicJobId('whatsapp-inbound', job.eventId)
  });
}
