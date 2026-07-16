import { env } from '../config/env.js';
import { getRedisStatus } from './redis-client.js';

export async function getRedisHealth({ queueConfig = env.queue, status = getRedisStatus() } = {}) {
  if (!queueConfig.enabled) {
    return {
      enabled: false,
      redis_status: 'disabled'
    };
  }

  return {
    enabled: true,
    redis_status: status === 'ready' ? 'ready' : 'error'
  };
}
