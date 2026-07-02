import { query } from '../config/database.js';

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    args[key] = rest.join('=');
  }
  return args;
}

function normalizePhone(value) {
  return String(value ?? '')
    .replace('@c.us', '')
    .replace(/\D/g, '');
}

async function resetConversation({ empresaId, phone }) {
  const normalizedPhone = normalizePhone(phone);
  const tenantId = Number(empresaId);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    throw new Error('Missing or invalid --empresaId');
  }
  if (!normalizedPhone) {
    throw new Error('Missing or invalid --phone');
  }
  const [result] = await query(
    'DELETE FROM conversacion_contexto WHERE empresa_id = ? AND telefono_cliente = ?',
    [tenantId, normalizedPhone]
  );
  return {
    empresaId: tenantId,
    phone: normalizedPhone,
    deletedRows: result?.affectedRows ?? 0
  };
}

const args = parseArgs(process.argv.slice(2));
resetConversation(args)
  .then((result) => {
    console.log(JSON.stringify({
      event: 'conversation_reset_completed',
      ...result
    }));
  })
  .catch((error) => {
    console.error(JSON.stringify({
      event: 'conversation_reset_failed',
      error: {
        name: error?.name,
        message: error?.message
      }
    }));
    process.exitCode = 1;
  });
