import { deterministicJobId } from '../queue-factory.js';
import { validateWhatsappCommandJob } from '../queue-payloads.js';

export async function enqueueWhatsappCommand(queue, payload) {
  const job = validateWhatsappCommandJob(payload);
  return queue.add(job.command, job, {
    jobId: deterministicJobId('whatsapp-command', job.jobId)
  });
}
