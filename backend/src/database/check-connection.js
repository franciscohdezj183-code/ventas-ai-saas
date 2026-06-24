import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabase, query } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsPath = path.resolve(__dirname, 'migrations');

const REQUIRED_TABLES = [
  'empresas',
  'usuarios',
  'productos',
  'leads',
  'conversaciones',
  'pedidos',
  'subscriptions',
  'subscription_invoices',
  'ai_usage_logs',
  'configuracion_empresas',
  'whatsapp_session_status',
  'schema_migrations'
];

const REQUIRED_COLUMNS = [
  ['leads', 'score'],
  ['leads', 'prioridad'],
  ['leads', 'score_detalle_json'],
  ['leads', 'score_actualizado_at'],
  ['conversaciones', 'whatsapp_message_id'],
  ['bot_response_settings', 'sinonimos_json'],
  ['bot_response_settings', 'handoff_timeout_minutos'],
  ['configuracion_empresas', 'instrucciones_negocio'],
  ['configuracion_empresas', 'fallback_message']
];

const REQUIRED_INDEXES = [
  ['usuarios', 'usuarios_email_unique'],
  ['productos', 'productos_fulltext_search'],
  ['servicios', 'servicios_fulltext_search'],
  ['categorias', 'categorias_fulltext_search'],
  ['conversaciones', 'conversaciones_empresa_cliente_fecha_index'],
  ['conversaciones', 'conversaciones_empresa_whatsapp_message_unique'],
  ['conversaciones', 'conversaciones_empresa_fecha_id_index'],
  ['leads', 'leads_empresa_estado_fecha_index'],
  ['pedidos', 'pedidos_empresa_estado_fecha_index'],
  ['human_handoffs', 'human_handoffs_estado_expires_index'],
  ['audit_logs', 'audit_logs_empresa_fecha_index']
];

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

async function listMigrationVersions() {
  const entries = await fs.readdir(migrationsPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name.replace(/\.sql$/i, ''))
    .sort((left, right) => left.localeCompare(right));
}

async function main() {
  const migrationVersions = await listMigrationVersions();
  const [databaseRows] = await query('SELECT DATABASE() AS database_name, VERSION() AS mysql_version');
  const [tableRows] = await query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN (${placeholders(REQUIRED_TABLES)})`,
    REQUIRED_TABLES
  );
  const foundTables = new Set(tableRows.map((row) => row.TABLE_NAME ?? row.table_name));
  const missingTables = REQUIRED_TABLES.filter((tableName) => !foundTables.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(`Database connection OK, but missing tables: ${missingTables.join(', ')}`);
  }

  const [columnRows] = await query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND CONCAT(table_name, '.', column_name) IN (${placeholders(REQUIRED_COLUMNS)})`,
    REQUIRED_COLUMNS.map(([tableName, columnName]) => `${tableName}.${columnName}`)
  );
  const foundColumns = new Set(columnRows.map((row) => `${row.TABLE_NAME ?? row.table_name}.${row.COLUMN_NAME ?? row.column_name}`));
  const missingColumns = REQUIRED_COLUMNS
    .map(([tableName, columnName]) => `${tableName}.${columnName}`)
    .filter((columnName) => !foundColumns.has(columnName));

  if (missingColumns.length > 0) {
    throw new Error(`Database connection OK, but missing columns: ${missingColumns.join(', ')}`);
  }

  const [indexRows] = await query(
    `SELECT table_name, index_name
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND CONCAT(table_name, '.', index_name) IN (${placeholders(REQUIRED_INDEXES)})`,
    REQUIRED_INDEXES.map(([tableName, indexName]) => `${tableName}.${indexName}`)
  );
  const foundIndexes = new Set(indexRows.map((row) => `${row.TABLE_NAME ?? row.table_name}.${row.INDEX_NAME ?? row.index_name}`));
  const missingIndexes = REQUIRED_INDEXES
    .map(([tableName, indexName]) => `${tableName}.${indexName}`)
    .filter((indexName) => !foundIndexes.has(indexName));

  if (missingIndexes.length > 0) {
    throw new Error(`Database connection OK, but missing indexes: ${missingIndexes.join(', ')}`);
  }

  const [migrationRows] = await query(
    `SELECT version
     FROM schema_migrations
     WHERE version IN (${placeholders(migrationVersions)})`,
    migrationVersions
  );
  const appliedMigrations = new Set(migrationRows.map((row) => row.version));
  const missingMigrations = migrationVersions.filter((version) => !appliedMigrations.has(version));

  if (missingMigrations.length > 0) {
    throw new Error(`Database connection OK, but pending migrations are not recorded: ${missingMigrations.join(', ')}`);
  }

  console.info(JSON.stringify({
    status: 'ok',
    database: databaseRows[0]?.database_name,
    mysql_version: databaseRows[0]?.mysql_version,
    required_tables: REQUIRED_TABLES.length,
    required_columns: REQUIRED_COLUMNS.length,
    required_indexes: REQUIRED_INDEXES.length,
    recorded_migrations: migrationVersions.length
  }));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
