import { env } from '../config/env.js';
import { validateMessagingProvider } from './messaging-provider.js';

const DEFAULT_PROVIDER_NAME = 'baileys';
const DEFAULT_PROVIDER_LOADERS = {
  async 'whatsapp-web'() {
    return (await import('./providers/whatsapp-web.provider.js')).whatsappWebProvider;
  },
  async baileys() {
    return (await import('./providers/baileys.provider.js')).baileysProvider;
  }
};

function createLazyProvider(providerName, loader) {
  let providerPromise = null;

  async function getProvider() {
    if (!providerPromise) {
      providerPromise = Promise.resolve(loader()).then(validateMessagingProvider);
    }

    return providerPromise;
  }

  return validateMessagingProvider({
    providerName,
    startSession: async (...args) => (await getProvider()).startSession(...args),
    getStatus: async (...args) => (await getProvider()).getStatus(...args),
    getStatusSnapshot: async (...args) => (await getProvider()).getStatusSnapshot(...args),
    listStatusSnapshots: async (...args) => (await getProvider()).listStatusSnapshots(...args),
    getQr: async (...args) => (await getProvider()).getQr(...args),
    disconnectSession: async (...args) => (await getProvider()).disconnectSession(...args),
    restartSession: async (...args) => (await getProvider()).restartSession?.(...args),
    sendText: async (...args) => (await getProvider()).sendText(...args),
    sendTextDirect: async (...args) => (await getProvider()).sendTextDirect?.(...args),
    sendMedia: async (...args) => (await getProvider()).sendMedia(...args),
    shutdown: async (...args) => (await getProvider()).shutdown(...args)
  });
}

export function createProviderRegistry({
  providerName = DEFAULT_PROVIDER_NAME,
  providers = null,
  providerLoaders = DEFAULT_PROVIDER_LOADERS
} = {}) {
  const configuredProviderName = String(providerName || DEFAULT_PROVIDER_NAME).trim();
  const source = providers ?? providerLoaders;
  const provider = source[configuredProviderName];

  if (!provider) {
    throw new Error(
      `Unsupported WhatsApp provider "${configuredProviderName}". Supported providers: ${Object.keys(source).join(', ')}`
    );
  }

  if (typeof provider === 'function') {
    return createLazyProvider(configuredProviderName, provider);
  }

  return validateMessagingProvider(provider);
}

let activeProvider = null;

export function getMessagingProvider() {
  if (!activeProvider) {
    activeProvider = createProviderRegistry({
      providerName: env.whatsapp.provider
    });
  }

  return activeProvider;
}

export function resetMessagingProviderForTests() {
  activeProvider = null;
}
