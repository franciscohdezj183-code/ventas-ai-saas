import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabase, getConnection } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsPath = path.resolve(__dirname, 'migrations');
const schemaPath = path.resolve(__dirname, 'schema.sql');

async function ensureMigrationsTable(connection) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      version VARCHAR(120) NOT NULL,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY schema_migrations_version_unique (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function getAppliedVersions(connection) {
  const [rows] = await connection.query('SELECT version FROM schema_migrations');
  return new Set(rows.map((row) => row.version));
}

async function hasApplicationTables(connection) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_type = 'BASE TABLE'
       AND table_name <> 'schema_migrations'`
  );

  return Number(rows[0]?.total ?? 0) > 0;
}

async function listMigrationFiles() {
  const entries = await fs.readdir(migrationsPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runStatements(connection, statements) {
  for (const statement of statements) {
    await connection.query(statement);
  }
}

async function applyBaselineSchema(connection) {
  const sql = await fs.readFile(schemaPath, 'utf8');
  const statements = splitSqlStatements(sql);

  await runStatements(connection, statements);
}

async function markMigrationsApplied(connection, migrationFiles) {
  for (const fileName of migrationFiles) {
    const version = fileName.replace(/\.sql$/i, '');
    await connection.query('INSERT IGNORE INTO schema_migrations (version) VALUES (?)', [version]);
  }
}

async function runMigration(connection, fileName) {
  const version = fileName.replace(/\.sql$/i, '');
  const sql = await fs.readFile(path.join(migrationsPath, fileName), 'utf8');
  const statements = splitSqlStatements(sql);

  await connection.beginTransaction();

  try {
    await runStatements(connection, statements);

    await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
    await connection.commit();
    console.info(`Migration applied: ${version}`);
  } catch (error) {
    await connection.rollback();
    error.message = `Migration failed (${version}): ${error.message}`;
    throw error;
  }
}

async function main() {
  const connection = await getConnection();

  try {
    const shouldBootstrap = !(await hasApplicationTables(connection));
    await ensureMigrationsTable(connection);
    const migrationFiles = await listMigrationFiles();

    if (shouldBootstrap) {
      await applyBaselineSchema(connection);
      await markMigrationsApplied(connection, migrationFiles);
      console.info('Baseline schema applied. Historical migrations marked as applied.');
      return;
    }

    const appliedVersions = await getAppliedVersions(connection);
    const pendingMigrations = migrationFiles.filter((fileName) => !appliedVersions.has(fileName.replace(/\.sql$/i, '')));

    if (pendingMigrations.length === 0) {
      console.info('No pending migrations.');
      return;
    }

    for (const fileName of pendingMigrations) {
      await runMigration(connection, fileName);
    }
  } finally {
    connection.release();
    await closeDatabase();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
