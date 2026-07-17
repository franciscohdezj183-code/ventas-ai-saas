import { closeDatabase } from '../config/database.js';
import { companyProviderService } from '../messaging/company-provider.service.js';
import { messagingService } from '../messaging/messaging.service.js';

function parseArgs(argv) {
  const args = {};

  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.+)$/);

    if (match) {
      args[match[1]] = match[2];
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const empresaId = Number(args['empresa-id']);
  const provider = args.provider;

  if (!Number.isInteger(empresaId) || empresaId <= 0 || !provider) {
    throw new Error('Uso: npm run whatsapp:set-provider -- --empresa-id=5 --provider=baileys');
  }

  const currentStatus = await messagingService.getStatusSnapshot(empresaId);
  const config = await companyProviderService.setProvider(empresaId, provider, {
    currentStatus,
    requestedBy: 'script:whatsapp:set-provider'
  });
  console.log(JSON.stringify({
    empresa_id: config.empresaId,
    provider: config.provider,
    effective_provider: config.effectiveProvider,
    desired_state: config.desiredState,
    auto_restore: config.autoRestore
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
