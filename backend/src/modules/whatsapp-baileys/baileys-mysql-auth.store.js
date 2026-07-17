import { proto } from '@whiskeysockets/baileys';
import { getConnection } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  decryptBaileysAuthPayload,
  encryptBaileysAuthPayload,
  parseBaileysAuthEncryptionKey
} from './baileys-auth.crypto.js';

const CREDS_TABLE = 'whatsapp_baileys_auth_creds';
const KEYS_TABLE = 'whatsapp_baileys_auth_keys';

function normalizeEmpresaId(empresaId) {
  const id = Number(empresaId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('La empresa es requerida');
  }

  return id;
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function serialize(value, BufferJSON) {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize(value, BufferJSON) {
  return JSON.parse(value, BufferJSON.reviver);
}

function restoreBaileysKey(type, value) {
  if (type === 'app-state-sync-key' && value) {
    return proto.Message.AppStateSyncKeyData.fromObject(value);
  }

  return value;
}

function sanitizeError(error) {
  return {
    name: error?.name,
    message: error?.message,
    code: error?.code
  };
}

export function createMysqlBaileysAuthRepository({ getConnectionFn = getConnection } = {}) {
  async function withConnection(work) {
    const connection = await getConnectionFn();

    try {
      return await work(connection);
    } finally {
      connection.release();
    }
  }

  return {
    async transaction(work) {
      return withConnection(async (connection) => {
        await connection.beginTransaction();

        try {
          const result = await work(createMysqlBaileysAuthTransaction(connection));
          await connection.commit();
          return result;
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      });
    },

    async getCreds(empresaId) {
      return withConnection(async (connection) => {
        const [rows] = await connection.execute(
          `SELECT payload, iv, auth_tag, schema_version FROM ${CREDS_TABLE} WHERE empresa_id = ? LIMIT 1`,
          [empresaId]
        );
        return rows[0] ?? null;
      });
    },

    async getKeys(empresaId, type, ids) {
      if (ids.length === 0) {
        return [];
      }

      return withConnection(async (connection) => {
        const placeholders = ids.map(() => '?').join(', ');
        const [rows] = await connection.execute(
          `SELECT key_id, payload, iv, auth_tag, schema_version
             FROM ${KEYS_TABLE}
            WHERE empresa_id = ? AND category = ? AND key_id IN (${placeholders})`,
          [empresaId, type, ...ids]
        );
        return rows;
      });
    },

    async clearEmpresaAuth(empresaId) {
      return this.transaction((tx) => tx.clearEmpresaAuth(empresaId));
    }
  };
}

function createMysqlBaileysAuthTransaction(connection) {
  return {
    async upsertCreds(empresaId, encrypted) {
      await connection.execute(
        `INSERT INTO ${CREDS_TABLE} (empresa_id, payload, iv, auth_tag, schema_version)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           payload = VALUES(payload),
           iv = VALUES(iv),
           auth_tag = VALUES(auth_tag),
           schema_version = VALUES(schema_version),
           updated_at = CURRENT_TIMESTAMP`,
        [empresaId, encrypted.payload, encrypted.iv, encrypted.authTag, encrypted.schemaVersion]
      );
    },

    async upsertKeys(rows) {
      if (rows.length === 0) {
        return;
      }

      const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const params = rows.flatMap((row) => [
        row.empresaId,
        row.type,
        row.id,
        row.encrypted.payload,
        row.encrypted.iv,
        row.encrypted.authTag,
        row.encrypted.schemaVersion
      ]);

      await connection.execute(
        `INSERT INTO ${KEYS_TABLE} (empresa_id, category, key_id, payload, iv, auth_tag, schema_version)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           payload = VALUES(payload),
           iv = VALUES(iv),
           auth_tag = VALUES(auth_tag),
           schema_version = VALUES(schema_version),
           updated_at = CURRENT_TIMESTAMP`,
        params
      );
    },

    async deleteKeys(empresaId, type, ids) {
      if (ids.length === 0) {
        return;
      }

      const placeholders = ids.map(() => '?').join(', ');
      await connection.execute(
        `DELETE FROM ${KEYS_TABLE} WHERE empresa_id = ? AND category = ? AND key_id IN (${placeholders})`,
        [empresaId, type, ...ids]
      );
    },

    async clearEmpresaAuth(empresaId) {
      await connection.execute(`DELETE FROM ${KEYS_TABLE} WHERE empresa_id = ?`, [empresaId]);
      await connection.execute(`DELETE FROM ${CREDS_TABLE} WHERE empresa_id = ?`, [empresaId]);
    }
  };
}

export function createMysqlBaileysAuthStore({
  repository = createMysqlBaileysAuthRepository(),
  encryptionKey = env.whatsapp.baileys.authEncryptionKey,
  batchSize = env.whatsapp.baileys.authDbBatchSize,
  loggerInstance = logger,
  importBaileys = () => import('@whiskeysockets/baileys')
} = {}) {
  const key = Buffer.isBuffer(encryptionKey) ? encryptionKey : parseBaileysAuthEncryptionKey(encryptionKey);

  async function loadBaileys() {
    return importBaileys();
  }

  return {
    async createAuthState(empresaId) {
      const id = normalizeEmpresaId(empresaId);
      const { BufferJSON, initAuthCreds } = await loadBaileys();

      try {
        const credsRow = await repository.getCreds(id);
        const creds = credsRow
          ? deserialize(decryptBaileysAuthPayload(credsRow, key), BufferJSON)
          : initAuthCreds();

        loggerInstance.info('baileys_auth_mysql_loaded', {
          empresaId: id,
          hasCredentials: Boolean(credsRow)
        });

        return {
          store: 'mysql',
          state: {
            creds,
            keys: {
              async get(type, ids) {
                const requestedIds = [...new Set(ids.map(String))];
                const rows = await repository.getKeys(id, type, requestedIds);
                const valuesById = new Map(rows.map((row) => [String(row.key_id), row]));
                const data = {};

                for (const keyId of requestedIds) {
                  const row = valuesById.get(keyId);
                  data[keyId] = row
                    ? restoreBaileysKey(type, deserialize(decryptBaileysAuthPayload(row, key), BufferJSON))
                    : undefined;
                }

                return data;
              },

              async set(data) {
                const writes = [];
                const deletes = [];

                for (const type of Object.keys(data)) {
                  for (const [keyId, value] of Object.entries(data[type])) {
                    if (value === null || value === undefined) {
                      deletes.push({ type, keyId });
                    } else {
                      writes.push({
                        empresaId: id,
                        type,
                        id: keyId,
                        encrypted: encryptBaileysAuthPayload(serialize(value, BufferJSON), key)
                      });
                    }
                  }
                }

                await repository.transaction(async (tx) => {
                  for (const [type, groupedDeletes] of Map.groupBy(deletes, (entry) => entry.type)) {
                    for (const deleteBatch of chunk(groupedDeletes.map((entry) => entry.keyId), batchSize)) {
                      await tx.deleteKeys(id, type, deleteBatch);
                    }
                  }

                  for (const writeBatch of chunk(writes, batchSize)) {
                    await tx.upsertKeys(writeBatch);
                  }
                });

                loggerInstance.info('baileys_auth_mysql_saved', {
                  empresaId: id,
                  keysWritten: writes.length,
                  keysDeleted: deletes.length
                });
              }
            }
          },

          async saveCreds() {
            const encrypted = encryptBaileysAuthPayload(serialize(creds, BufferJSON), key);
            await repository.transaction((tx) => tx.upsertCreds(id, encrypted));
            loggerInstance.info('baileys_auth_mysql_saved', {
              empresaId: id,
              creds: 1
            });
          }
        };
      } catch (error) {
        loggerInstance.error('baileys_auth_mysql_error', {
          empresaId: id,
          error: sanitizeError(error)
        });
        throw error;
      }
    },

    async removeAuthState(empresaId) {
      const id = normalizeEmpresaId(empresaId);

      try {
        await repository.clearEmpresaAuth(id);
        loggerInstance.info('baileys_auth_mysql_cleared', { empresaId: id });
      } catch (error) {
        loggerInstance.error('baileys_auth_mysql_error', {
          empresaId: id,
          error: sanitizeError(error)
        });
        throw error;
      }
    },

    async hasCredentials(empresaId) {
      const id = normalizeEmpresaId(empresaId);
      return Boolean(await repository.getCreds(id));
    }
  };
}
