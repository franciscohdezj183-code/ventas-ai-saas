import { closeDatabase, query } from '../config/database.js';
import { whatsappSessionRecoveryService } from '../modules/whatsapp/whatsapp-session-recovery.service.js';
import { companyProviderService } from '../messaging/company-provider.service.js';

function parseArgs(argv) {
  const args = new Map();

  for (const arg of argv) {
    if (arg.startsWith('--empresa-id=')) {
      args.set('empresaId', Number(arg.slice('--empresa-id='.length)));
    } else if (arg === '--status') {
      args.set('action', 'status');
    } else if (arg === '--retry') {
      args.set('action', 'retry');
    } else if (arg === '--cancel') {
      args.set('action', 'cancel');
    }
  }

  return args;
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

async function readSessionConfig(empresaId) {
  const [rows] = await query(
    `SELECT c.empresa_id, c.provider, c.desired_state, c.auto_restore, s.status AS session_status
       FROM whatsapp_session_config c
       LEFT JOIN whatsapp_session_status s ON s.empresa_id = c.empresa_id
      WHERE c.empresa_id = ?
      LIMIT 1`,
    [empresaId]
  );
  return rows[0] ?? null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const empresaId = args.get('empresaId');
  const action = args.get('action');

  if (!Number.isInteger(empresaId) || empresaId <= 0 || !['status', 'retry', 'cancel'].includes(action)) {
    printJson({
      ok: false,
      error: 'Uso: npm run whatsapp:recovery --workspace backend -- --empresa-id=5 --status|--retry|--cancel'
    });
    process.exitCode = 1;
    return;
  }

  if (action === 'retry') {
    await whatsappSessionRecoveryService.retry({ empresaId });
  }

  if (action === 'cancel') {
    await companyProviderService.setDesiredState(empresaId, 'DISCONNECTED');
    await whatsappSessionRecoveryService.cancel({ empresaId, reason: 'admin_cancel' });
  }

  printJson({
    ok: true,
    action,
    empresa_id: empresaId,
    session_config: await readSessionConfig(empresaId),
    recovery: await whatsappSessionRecoveryService.getStatus(empresaId)
  });
}

main()
  .catch((error) => {
    printJson({
      ok: false,
      error: {
        name: error?.name ?? 'Error',
        message: String(error?.message ?? error),
        code: error?.code
      }
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
