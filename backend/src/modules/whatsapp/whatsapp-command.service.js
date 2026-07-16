import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { messagingService } from '../../messaging/messaging.service.js';
import { getQueueRegistry } from '../../queues/queue-registry.js';
import { createHttpError } from '../../utils/http-error.js';
import { logger } from '../../utils/logger.js';

const COMMAND_STATUS_QUEUED = 'QUEUED';

function normalizeEmpresaId(empresaId) {
  const id = Number(empresaId);

  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  return id;
}

function commandSlug(command) {
  return String(command).toLowerCase().replace(/_/g, '-');
}

export function createWhatsappCommandJobId(command, empresaId, { now = Date.now(), staleMs = env.whatsapp.commandWorker.staleMs } = {}) {
  // Deduplication window: identical commands for the same company share a jobId during WHATSAPP_COMMAND_STALE_MS.
  const windowId = Math.floor(now / staleMs);
  return `wa-${commandSlug(command)}-empresa-${empresaId}-${windowId}`;
}

function optimisticStatus(command) {
  if (command === 'START_SESSION' || command === 'RESTART_SESSION') {
    return 'INITIALIZING';
  }

  if (command === 'DISCONNECT_SESSION') {
    return 'DISCONNECTED';
  }

  return 'UNKNOWN';
}

async function findExistingCommand(queue, commandId) {
  if (typeof queue?.getJob !== 'function') {
    return null;
  }

  const existingJob = await queue.getJob(`whatsapp-command-${commandId}`);

  if (!existingJob) {
    return null;
  }

  const state = typeof existingJob.getState === 'function' ? await existingJob.getState() : null;

  if (!state || ['completed', 'failed'].includes(state)) {
    return null;
  }

  return existingJob;
}

function queuedResponse({ empresaId, command, commandId, requestedAt, duplicate = false }) {
  return {
    empresa_id: empresaId,
    status: optimisticStatus(command),
    command_id: commandId,
    command_status: COMMAND_STATUS_QUEUED,
    queued: true,
    duplicate,
    requested_at: requestedAt
  };
}

export function createWhatsappCommandService({
  config = env,
  provider = messagingService,
  getRegistry = getQueueRegistry,
  loggerInstance = logger,
  now = Date.now,
  uuid = randomUUID
} = {}) {
  async function enqueueCommand(command, empresaId, payload = {}) {
    const id = normalizeEmpresaId(empresaId);
    const requestedAt = new Date(now()).toISOString();
    const commandId = createWhatsappCommandJobId(command, id, {
      now: now(),
      staleMs: config.whatsapp.commandWorker.staleMs
    });
    const registry = getRegistry();
    const queueWrapper = registry?.whatsappCommandQueue;

    if (!queueWrapper || queueWrapper.status !== 'ready') {
      throw createHttpError(503, 'La cola de comandos de WhatsApp no esta disponible');
    }

    const existingJob = await findExistingCommand(queueWrapper.queue, commandId);

    if (existingJob) {
      loggerInstance.info('whatsapp_command_duplicate', {
        empresaId: id,
        command,
        commandId
      });
      return queuedResponse({ empresaId: id, command, commandId, requestedAt, duplicate: true });
    }

    const jobPayload = {
      jobId: commandId,
      command,
      empresaId: id,
      requestedAt,
      requestedBy: payload.requestedBy ?? null,
      payload: {
        requestId: uuid(),
        source: 'api',
        ...payload
      }
    };
    const job = await queueWrapper.enqueue(jobPayload);
    loggerInstance.info('whatsapp_command_queued', {
      empresaId: id,
      command,
      commandId,
      jobId: job?.id
    });
    return queuedResponse({ empresaId: id, command, commandId, requestedAt });
  }

  return {
    async requestStartSession(empresaId, options = {}) {
      if (!config.whatsapp.commandsViaQueue) {
        return provider.startSession(empresaId);
      }

      return enqueueCommand('START_SESSION', empresaId, options);
    },

    async requestDisconnectSession(empresaId, options = {}) {
      if (!config.whatsapp.commandsViaQueue) {
        return provider.disconnectSession(empresaId);
      }

      return enqueueCommand('DISCONNECT_SESSION', empresaId, options);
    },

    async requestRestartSession(empresaId, options = {}) {
      if (!config.whatsapp.commandsViaQueue) {
        await provider.disconnectSession(empresaId);
        return provider.startSession(empresaId);
      }

      return enqueueCommand('RESTART_SESSION', empresaId, options);
    },

    async requestGetStatus(empresaId, options = {}) {
      if (!config.whatsapp.commandsViaQueue) {
        return provider.getStatusSnapshot(empresaId);
      }

      return enqueueCommand('GET_STATUS', empresaId, options);
    }
  };
}

export const whatsappCommandService = createWhatsappCommandService();
