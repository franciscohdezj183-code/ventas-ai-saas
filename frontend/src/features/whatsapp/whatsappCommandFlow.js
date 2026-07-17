export const WHATSAPP_COMMAND_POLL_INTERVAL_MS = 2000;
export const WHATSAPP_COMMAND_POLL_TIMEOUT_MS = 60000;

const TERMINAL_STATUSES = new Set(['CONNECTED', 'QR_READY', 'DISCONNECTED', 'AUTH_FAILED']);

export function isQueuedCommandResponse(value) {
  return Boolean(value?.queued === true || value?.http_status === 202 || value?.command_status === 'QUEUED');
}

export function isTerminalWhatsappStatus(status) {
  return TERMINAL_STATUSES.has(String(status?.status ?? '').toUpperCase());
}

export function createSingleFlight() {
  let inFlight = null;

  return async function run(task) {
    if (inFlight) {
      return inFlight;
    }

    inFlight = Promise.resolve()
      .then(task)
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}

export function createWhatsappCommandPoller({
  loadStatus,
  onStatus,
  onDone,
  onError,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  now = Date.now,
  intervalMs = WHATSAPP_COMMAND_POLL_INTERVAL_MS,
  timeoutMs = WHATSAPP_COMMAND_POLL_TIMEOUT_MS
}) {
  let timer = null;
  let stopped = false;
  let startedAt = 0;

  function clearTimer() {
    if (timer) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  async function tick() {
    if (stopped) {
      return;
    }

    if (now() - startedAt >= timeoutMs) {
      stopped = true;
      clearTimer();
      onDone?.({ timedOut: true });
      return;
    }

    try {
      const status = await loadStatus();
      onStatus?.(status);

      if (isTerminalWhatsappStatus(status)) {
        stopped = true;
        clearTimer();
        onDone?.({ status });
        return;
      }
    } catch (error) {
      stopped = true;
      clearTimer();
      onError?.(error);
      return;
    }

    timer = setTimeoutFn(tick, intervalMs);
  }

  return {
    start() {
      clearTimer();
      stopped = false;
      startedAt = now();
      timer = setTimeoutFn(tick, intervalMs);
    },
    stop() {
      stopped = true;
      clearTimer();
    },
    isRunning() {
      return !stopped && Boolean(timer);
    }
  };
}
