import { env } from '../config/env.js';
import { validateMessagingProvider } from './messaging-provider.js';
import { whatsappWebProvider } from './providers/whatsapp-web.provider.js';

const DEFAULT_PROVIDER_NAME = 'whatsapp-web';

export function createProviderRegistry({
  providerName = DEFAULT_PROVIDER_NAME,
  providers = {
    'whatsapp-web': whatsappWebProvider
  }
} = {}) {
  const configuredProviderName = String(providerName || DEFAULT_PROVIDER_NAME).trim();
  const provider = providers[configuredProviderName];

  if (!provider) {
    throw new Error(
      `Unsupported WhatsApp provider "${configuredProviderName}". Supported providers: ${Object.keys(providers).join(', ')}`
    );
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
