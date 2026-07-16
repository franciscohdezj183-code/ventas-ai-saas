import { validateWhatsappCommandJob } from '../queue-payloads.js';

export async function enqueueWhatsappCommand(queue, payload) {
  const job = validateWhatsappCommandJob(payload);
  const safeJobId = String(job.jobId).replace(/[^a-zA-Z0-9_-]/g, '-');
  return queue.add(job.command, job, {
    jobId: `whatsapp-command-${safeJobId}`
  });
}
