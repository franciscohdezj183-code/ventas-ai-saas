import { deterministicJobId } from '../queue-factory.js';
import { validateWhatsappOutboundJob } from '../queue-payloads.js';

export async function enqueueOutboundMessage(queue, payload) {
  const job = validateWhatsappOutboundJob(payload);
  return queue.add('WHATSAPP_OUTBOUND_MESSAGE', job, {
    jobId: deterministicJobId('whatsapp-outbound', job.messageId)
  });
}
