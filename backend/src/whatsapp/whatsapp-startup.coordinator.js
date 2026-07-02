import { WHATSAPP_SESSION_STATUSES } from './whatsapp.types.js';

let globalInitQueue = Promise.resolve();

export function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

export function withTimeout(promise, timeoutMs, message = 'Operation timed out') {
  const timeout = Math.max(1, Number(timeoutMs) || 1);
  let timer;

  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(message);
        error.code = 'WHATSAPP_INIT_TIMEOUT';
        reject(error);
      }, timeout);
    })
  ]).finally(() => clearTimeout(timer));
}

export function withGlobalWhatsappInitLock(operation) {
  const next = globalInitQueue
    .catch(() => null)
    .then(operation);

  globalInitQueue = next.catch(() => null);
  return next;
}

export function backoffWithJitter(attempt, {
  baseDelayMs = 5000,
  maxDelayMs = 60000,
  jitterRatio = 0.2,
  random = Math.random
} = {}) {
  const safeAttempt = Math.max(1, Number(attempt) || 1);
  const base = Math.max(1, Number(baseDelayMs) || 1);
  const maximum = Math.max(base, Number(maxDelayMs) || base);
  const exponential = Math.min(base * (2 ** (safeAttempt - 1)), maximum);
  const ratio = Math.max(0, Math.min(Number(jitterRatio) || 0, 1));
  const jitter = exponential * ratio * ((random() * 2) - 1);

  return Math.max(1, Math.round(Math.min(maximum, exponential + jitter)));
}

export function isTargetClosedError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase();
  return message.includes('target closed')
    || message.includes('execution context was destroyed')
    || message.includes('protocol error')
    || message.includes("reading 'getchats'")
    || message.includes("reading 'socket'")
    || message.includes('whatsapp client state is unlaunched')
    || (message.includes('store') && message.includes('socket'));
}

export function isLockedLocalAuthError(error) {
  const code = String(error?.code ?? '').toUpperCase();
  const message = String(error?.message ?? error ?? '').toUpperCase();
  return ['EBUSY', 'EPERM', 'ENOTEMPTY'].some((value) => code === value || message.includes(value));
}

export async function waitForWhatsappTerminalState({
  getSession,
  timeoutMs,
  pollIntervalMs = 100,
  isCancelled = () => false
}) {
  const terminalStatuses = new Set([
    WHATSAPP_SESSION_STATUSES.QR,
    WHATSAPP_SESSION_STATUSES.READY,
    WHATSAPP_SESSION_STATUSES.FAILED
  ]);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (isCancelled()) {
      const error = new Error('WhatsApp initialization cancelled');
      error.code = 'WHATSAPP_INIT_CANCELLED';
      throw error;
    }

    const session = getSession();

    if (terminalStatuses.has(session?.status)) {
      return session;
    }

    await wait(pollIntervalMs);
  }

  const error = new Error(`WhatsApp initialization timed out after ${timeoutMs}ms`);
  error.code = 'WHATSAPP_INIT_TIMEOUT';
  throw error;
}

export function resetWhatsappStartupCoordinatorForTests() {
  globalInitQueue = Promise.resolve();
}
