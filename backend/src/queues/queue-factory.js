import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { getRedisClient } from '../redis/redis-client.js';

export function createDefaultJobOptions(queueConfig = env.queue) {
  return {
    attempts: queueConfig.attempts,
    backoff: {
      type: 'exponential',
      delay: queueConfig.backoffMs
    },
    removeOnComplete: queueConfig.removeOnComplete,
    removeOnFail: queueConfig.removeOnFail
  };
}

export function deterministicJobId(prefix, id) {
  return `${prefix}:${id}`;
}

export function createBullQueueName(name, queueConfig = env.queue) {
  const prefix = String(queueConfig.redisPrefix ?? '').replace(/:+$/g, '');
  const queueName = String(name ?? '');
  const unprefixedName = prefix && queueName.startsWith(`${prefix}:`)
    ? queueName.slice(prefix.length + 1)
    : queueName;

  return unprefixedName.replace(/:+/g, '-');
}

export function createBullQueue({
  name,
  queueConfig = env.queue,
  QueueClass = Queue,
  connection = getRedisClient({ queueConfig })
}) {
  if (!queueConfig.enabled) {
    return null;
  }

  return new QueueClass(createBullQueueName(name, queueConfig), {
    connection,
    prefix: String(queueConfig.redisPrefix ?? 'nexus').replace(/:+$/g, '') || 'nexus',
    defaultJobOptions: createDefaultJobOptions(queueConfig)
  });
}
