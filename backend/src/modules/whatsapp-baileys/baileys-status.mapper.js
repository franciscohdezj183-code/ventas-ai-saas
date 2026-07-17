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
