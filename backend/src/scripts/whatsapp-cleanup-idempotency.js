import { closeDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { whatsappIdempotencyService } from '../modules/whatsapp/whatsapp-idempotency.service.js';

function parseArgs(argv) {
  return {
    execute: argv.includes('--execute'),
    dryRun: !argv.includes('--execute'),
    batchSize: Number(argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] ?? 500)
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await whatsappIdempotencyService.cleanup({
    retentionDays: env.whatsapp.idempotency.retentionDays,
    batchSize: options.batchSize,
    execute: options.execute
  });

  console.log(JSON.stringify({
    dry_run: options.dryRun,
    execute: options.execute,
    inbound_records: result.inbound,
    outbound_records: result.outbound,
    deleted: result.deleted
  }, null, 2));
}

main()
  .catch((error) => {
    console.log(JSON.stringify({ error: String(error?.message ?? error) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
