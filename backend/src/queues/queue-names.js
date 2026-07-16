import { env } from '../config/env.js';

function normalizePrefix(prefix) {
  return String(prefix ?? 'nexus')
    .trim()
    .replace(/:+$/g, '') || 'nexus';
}

export function createQueueNames(prefix = env.queue.redisPrefix) {
  const cleanPrefix = normalizePrefix(prefix);

  return {
    whatsappCommand: `${cleanPrefix}:whatsapp:commands:v1`,
    whatsappInbound: `${cleanPrefix}:whatsapp:inbound:v1`,
    whatsappOutbound: `${cleanPrefix}:whatsapp:outbound:v1`
  };
}

export const QUEUE_NAMES = createQueueNames();
