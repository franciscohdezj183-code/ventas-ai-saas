export function baileysDisconnectStatusCode(error) {
  return error?.output?.statusCode ?? error?.statusCode ?? error?.status ?? error?.code;
}

export function normalizeBaileysError(error) {
  return {
    name: error?.name ?? 'Error',
    message: String(error?.message ?? error ?? 'Unknown error'),
    code: error?.code,
    statusCode: baileysDisconnectStatusCode(error)
  };
}

export function isBaileysLoggedOut(error, disconnectReason = {}) {
  return Number(baileysDisconnectStatusCode(error)) === Number(disconnectReason.loggedOut ?? 401);
}

export function classifyBaileysDisconnect(error, disconnectReason = {}) {
  const statusCode = Number(baileysDisconnectStatusCode(error));
  const retryableCodes = new Set([
    Number(disconnectReason.connectionClosed ?? 428),
    Number(disconnectReason.connectionLost ?? 408),
    Number(disconnectReason.timedOut ?? 408),
    Number(disconnectReason.restartRequired ?? 515),
    Number(disconnectReason.unavailableService ?? 503)
  ]);
  const terminalCodes = new Set([
    Number(disconnectReason.loggedOut ?? 401),
    Number(disconnectReason.forbidden ?? 403),
    Number(disconnectReason.badSession ?? 500),
    Number(disconnectReason.multideviceMismatch ?? 411),
    Number(disconnectReason.connectionReplaced ?? 440)
  ]);

  if (terminalCodes.has(statusCode)) {
    return {
      category: 'terminal',
      retryable: false,
      reason: statusCode === Number(disconnectReason.loggedOut ?? 401) ? 'logged_out' : 'auth_or_session_invalid',
      statusCode
    };
  }

  if (retryableCodes.has(statusCode)) {
    return {
      category: 'retryable',
      retryable: true,
      reason: 'temporary_disconnect',
      statusCode
    };
  }

  return {
    category: 'unknown',
    retryable: true,
    reason: 'unknown_disconnect',
    statusCode: Number.isFinite(statusCode) ? statusCode : null
  };
}
