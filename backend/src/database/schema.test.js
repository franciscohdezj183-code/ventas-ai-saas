import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const databaseDir = fileURLToPath(new URL('.', import.meta.url));

async function readDatabaseFile(fileName) {
  return fs.readFile(path.join(databaseDir, fileName), 'utf8');
}

describe('database production schema', () => {
  it('contains the critical production tables and constraints expected by the backend', async () => {
    const schema = await readDatabaseFile('schema.sql');
    const requiredSnippets = [
      'CREATE TABLE IF NOT EXISTS empresas',
      'CREATE TABLE IF NOT EXISTS usuarios',
      'UNIQUE KEY usuarios_email_unique (email)',
      'CREATE TABLE IF NOT EXISTS productos',
      'FULLTEXT KEY productos_fulltext_search',
      'CREATE TABLE IF NOT EXISTS leads',
      'score INT UNSIGNED NOT NULL DEFAULT 0',
      "prioridad ENUM('BAJA','MEDIA','ALTA','CRITICA')",
      'CREATE TABLE IF NOT EXISTS conversaciones',
      'CREATE TABLE IF NOT EXISTS pedidos',
      'CREATE TABLE IF NOT EXISTS subscriptions',
      'CREATE TABLE IF NOT EXISTS subscription_invoices',
      'CREATE TABLE IF NOT EXISTS ai_usage_logs',
      'CREATE TABLE IF NOT EXISTS configuracion_empresas',
      'CREATE TABLE IF NOT EXISTS whatsapp_session_status',
      'CREATE TABLE IF NOT EXISTS bot_response_settings',
      'sinonimos_json JSON NULL',
      'CREATE TABLE IF NOT EXISTS audit_logs'
    ];

    for (const snippet of requiredSnippets) {
      assert.match(schema, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('keeps migration files ordered and includes the production unique email migration', async () => {
    const migrationsPath = path.resolve(databaseDir, 'migrations');
    const entries = await fs.readdir(migrationsPath);
    const migrationFiles = entries.filter((entry) => entry.endsWith('.sql'));
    const sortedMigrationFiles = [...migrationFiles].sort((left, right) => left.localeCompare(right));

    assert.deepEqual(migrationFiles, sortedMigrationFiles);
    assert.ok(migrationFiles.includes('202606220001_unique_user_email.sql'));
  });

  it('bootstraps clean databases from schema.sql before marking historical migrations', async () => {
    const migrate = await readDatabaseFile('migrate.js');

    assert.match(migrate, /applyBaselineSchema/);
    assert.match(migrate, /markMigrationsApplied/);
    assert.match(migrate, /schema\.sql/);
  });
});
