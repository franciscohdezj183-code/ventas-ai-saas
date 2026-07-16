export const MESSAGING_PROVIDER_METHODS = [
  'startSession',
  'getStatus',
  'getStatusSnapshot',
  'listStatusSnapshots',
  'getQr',
  'disconnectSession',
  'sendText',
  'sendMedia',
  'shutdown'
];

export const WHATSAPP_SESSION_STATUSES = [
  'DISCONNECTED',
  'INITIALIZING',
  'QR_READY',
  'AUTHENTICATED',
  'CONNECTED',
  'RECONNECTING',
  'AUTH_FAILED',
  'ERROR'
];

export function validateMessagingProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new Error('Messaging provider must be an object');
  }

  if (!provider.providerName || typeof provider.providerName !== 'string') {
    throw new Error('Messaging provider must define providerName');
  }

  for (const methodName of MESSAGING_PROVIDER_METHODS) {
    if (typeof provider[methodName] !== 'function') {
      throw new Error(`Messaging provider "${provider.providerName}" must implement ${methodName}()`);
    }
  }

  return provider;
}

export function validateStatusSnapshot(status) {
  if (!status || typeof status !== 'object') {
    throw new Error('Messaging status snapshot must be an object');
  }

  if (!WHATSAPP_SESSION_STATUSES.includes(status.status)) {
    throw new Error(`Unsupported WhatsApp status: ${status.status}`);
  }

  return status;
}
