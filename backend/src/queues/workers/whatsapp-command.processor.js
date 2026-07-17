import { UnrecoverableError } from 'bullmq';
import { env } from '../../config/env.js';
import { messagingService } from '../../messaging/messaging.service.js';
import { QueuePayloadValidationError, validateWhatsappCommandJob } from '../queue-payloads.js';
import { logger } from '../../utils/logger.js';
import { companyProviderService } from '../../messaging/company-provider.service.js';
import { whatsappSessionLeaseService } from '../whatsapp-session-lease.service.js';

const companyLocks = new Map();

function normalizeError(error) {
  return {
    name: error?.name ?? 'Error',
    message: String(error?.message ?? error ?? 'Unknown error'),
    code: error?.code,
    statusCode: error?.statusCode ?? error?.status
  };
}

function isPermanentError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  const statusCode = Number(error?.statusCode ?? error?.status);

  return error instanceof QueuePayloadValidationError ||
    error?.code === 'QUEUE_PAYLOAD_INVALID' ||
    [400, 401, 403, 404, 409, 422].includes(statusCode) ||
    /auth failure|auth_failed|unauthorized|forbidden|plan|configuration|configuracion|invalid/i.test(message);
}

function withTimeout(promise, timeoutMs, { command, empresaId, loggerInstance = logger } = {}) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`WhatsApp command timed out after ${timeoutMs}ms`);
      error.code = 'WHATSAPP_COMMAND_TIMEOUT';
      loggerInstance.error('whatsapp_command_failed', {
        empresaId,
        command,
        error: normalizeError(error)
      });
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function withCompanyCommandLock(empresaId, operation) {
  const currentLock = companyLocks.get(empresaId) ?? Promise.resolve();
  let release;
  const nextLock = new Promise((resolve) => {
    release = resolve;
  });
  const queuedLock = currentLock.then(() => nextLock, () => nextLock);
  companyLocks.set(empresaId, queuedLock);

  await currentLock.catch(() => {});

  try {
    return await operation();
  } finally {
    release();

    if (companyLocks.get(empresaId) === queuedLock) {
      companyLocks.delete(empresaId);
    }
  }
}

export function createWhatsappCommandProcessor({
  service = messagingService,
  config = env,
  loggerInstance = logger,
  companyProvider = null,
  sessionLease = null
} = {}) {
  async function executeCommand(commandJob) {
    switch (commandJob.command) {
      case 'START_SESSION':
        await companyProvider?.setDesiredState?.(commandJob.empresaId, 'CONNECTED');
        await sessionLease?.acquire?.(commandJob.empresaId);
        return service.startSession(commandJob.empresaId);
      case 'DISCONNECT_SESSION':
        try {
          const result = await service.disconnectSession(commandJob.empresaId);
          await companyProvider?.setDesiredState?.(commandJob.empresaId, 'DISCONNECTED');
          return result;
        } finally {
          await sessionLease?.release?.(commandJob.empresaId);
        }
      case 'RESTART_SESSION':
        await companyProvider?.setDesiredState?.(commandJob.empresaId, 'CONNECTED');
        await sessionLease?.acquire?.(commandJob.empresaId);
        if (typeof service.restartSession === 'function') {
          return service.restartSession(commandJob.empresaId);
        }
        await service.disconnectSession(commandJob.empresaId);
        return service.startSession(commandJob.empresaId);
      case 'GET_STATUS':
        return service.getStatusSnapshot(commandJob.empresaId);
      default:
        throw new QueuePayloadValidationError(`Unsupported WhatsApp command: ${commandJob.command}`);
    }
  }

  return async function processWhatsappCommand(job) {
    let commandJob;

    try {
      commandJob = validateWhatsappCommandJob(job?.data);
    } catch (error) {
      loggerInstance.error('whatsapp_command_failed', {
        jobId: job?.id,
        error: normalizeError(error)
      });
      throw new UnrecoverableError(error.message);
    }

    loggerInstance.info('whatsapp_command_started', {
      jobId: job?.id,
      commandId: commandJob.jobId,
      command: commandJob.command,
      empresaId: commandJob.empresaId,
      attempt: Number(job?.attemptsMade ?? 0) + 1
    });

    try {
      const result = await withCompanyCommandLock(commandJob.empresaId, () => withTimeout(
        executeCommand(commandJob),
        config.whatsapp.commandWorker.timeoutMs,
        {
          command: commandJob.command,
          empresaId: commandJob.empresaId,
          loggerInstance
        }
      ));

      loggerInstance.info('whatsapp_command_completed', {
        jobId: job?.id,
        commandId: commandJob.jobId,
        command: commandJob.command,
        empresaId: commandJob.empresaId,
        status: result?.status
      });
      return result;
    } catch (error) {
      const normalizedError = normalizeError(error);
      loggerInstance.error('whatsapp_command_failed', {
        jobId: job?.id,
        commandId: commandJob.jobId,
        command: commandJob.command,
        empresaId: commandJob.empresaId,
        error: normalizedError
      });

      if (isPermanentError(error)) {
        throw new UnrecoverableError(error.message);
      }

      loggerInstance.warn('whatsapp_command_retrying', {
        jobId: job?.id,
        commandId: commandJob.jobId,
        command: commandJob.command,
        empresaId: commandJob.empresaId,
        error: normalizedError
      });
      throw error;
    }
  };
}

export const processWhatsappCommand = createWhatsappCommandProcessor({
  companyProvider: companyProviderService,
  sessionLease: whatsappSessionLeaseService
});
