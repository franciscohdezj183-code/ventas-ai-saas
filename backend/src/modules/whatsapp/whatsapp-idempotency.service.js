import { createHash } from 'node:crypto';
import { getConnection, query } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const INBOUND_TABLE = 'whatsapp_inbound_idempotency';
const OUTBOUND_TABLE = 'whatsapp_outbound_idempotency';

function nowIso(now) {
  return new Date(now()).toISOString().slice(0, 19).replace('T', ' ');
}

function errorCode(error) {
  return String(error?.code ?? error?.name ?? 'ERROR').slice(0, 120);
}

function isStale(startedAt, staleMs, now) {
  const timestamp = new Date(startedAt ?? 0).getTime();
  return !timestamp || now() - timestamp >= staleMs;
}

function normalizeKey(value, fallback) {
  return String(value ?? fallback ?? '').trim().slice(0, 255);
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

export function createOutboundIdempotencyKey(job) {
  return normalizeKey(
    `${job.empresaId}:${job.correlationId ?? job.messageId}:${job.type}`,
    `${job.empresaId}:${job.messageId}:${job.type}`
  );
}

export function createOutboundPayloadHash(job) {
  const payload = {
    empresaId: job.empresaId,
    provider: job.provider,
    type: job.type,
    whatsappChatId: job.whatsappChatId ?? null,
    resolvedPhoneId: job.resolvedPhoneId ?? null,
    phone: job.phone ?? null,
    textHash: createHash('sha256').update(String(job.text ?? '')).digest('hex'),
    mediaHash: job.media ? createHash('sha256').update(stableJson(job.media)).digest('hex') : null
  };

  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

export function createMysqlWhatsappIdempotencyRepository({ getConnectionFn = getConnection, queryFn = query } = {}) {
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
          const result = await work(createTransaction(connection));
          await connection.commit();
          return result;
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      });
    },

    async cleanup({ retentionDays, batchSize, execute }) {
      const params = [retentionDays, batchSize];
      const [inboundRows] = await queryFn(
        `SELECT empresa_id, provider, external_message_id
           FROM ${INBOUND_TABLE}
          WHERE status = 'COMPLETED'
            AND completed_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
          LIMIT ?`,
        params
      );
      const [outboundRows] = await queryFn(
        `SELECT empresa_id, provider, idempotency_key
           FROM ${OUTBOUND_TABLE}
          WHERE status = 'SENT'
            AND sent_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
          LIMIT ?`,
        params
      );

      if (!execute) {
        return { inbound: inboundRows.length, outbound: outboundRows.length, deleted: false };
      }

      return this.transaction(async (tx) => {
        await tx.deleteInboundRows(inboundRows);
        await tx.deleteOutboundRows(outboundRows);
        return { inbound: inboundRows.length, outbound: outboundRows.length, deleted: true };
      });
    }
  };
}

function createTransaction(connection) {
  return {
    async getInbound(empresaId, provider, externalMessageId) {
      const [rows] = await connection.execute(
        `SELECT * FROM ${INBOUND_TABLE}
          WHERE empresa_id = ? AND provider = ? AND external_message_id = ?
          FOR UPDATE`,
        [empresaId, provider, externalMessageId]
      );
      return rows[0] ?? null;
    },

    async insertInbound(row) {
      await connection.execute(
        `INSERT INTO ${INBOUND_TABLE}
          (empresa_id, provider, external_message_id, correlation_id, status, attempts, processing_started_at)
         VALUES (?, ?, ?, ?, 'PROCESSING', 1, ?)`,
        [row.empresaId, row.provider, row.externalMessageId, row.correlationId, row.startedAt]
      );
    },

    async updateInboundProcessing(row) {
      await connection.execute(
        `UPDATE ${INBOUND_TABLE}
            SET status = 'PROCESSING',
                attempts = attempts + 1,
                processing_started_at = ?,
                last_error_code = NULL
          WHERE empresa_id = ? AND provider = ? AND external_message_id = ?`,
        [row.startedAt, row.empresaId, row.provider, row.externalMessageId]
      );
    },

    async completeInbound(row) {
      await connection.execute(
        `UPDATE ${INBOUND_TABLE}
            SET status = 'COMPLETED',
                completed_at = ?,
                last_error_code = NULL
          WHERE empresa_id = ? AND provider = ? AND external_message_id = ?`,
        [row.completedAt, row.empresaId, row.provider, row.externalMessageId]
      );
    },

    async failInbound(row) {
      await connection.execute(
        `UPDATE ${INBOUND_TABLE}
            SET status = 'FAILED',
                last_error_code = ?
          WHERE empresa_id = ? AND provider = ? AND external_message_id = ?`,
        [row.errorCode, row.empresaId, row.provider, row.externalMessageId]
      );
    },

    async getOutbound(empresaId, provider, idempotencyKey) {
      const [rows] = await connection.execute(
        `SELECT * FROM ${OUTBOUND_TABLE}
          WHERE empresa_id = ? AND provider = ? AND idempotency_key = ?
          FOR UPDATE`,
        [empresaId, provider, idempotencyKey]
      );
      return rows[0] ?? null;
    },

    async insertOutbound(row) {
      await connection.execute(
        `INSERT INTO ${OUTBOUND_TABLE}
          (empresa_id, provider, idempotency_key, correlation_id, payload_hash, status, attempts, sending_started_at)
         VALUES (?, ?, ?, ?, ?, 'SENDING', 1, ?)`,
        [row.empresaId, row.provider, row.idempotencyKey, row.correlationId, row.payloadHash, row.startedAt]
      );
    },

    async updateOutboundSending(row) {
      await connection.execute(
        `UPDATE ${OUTBOUND_TABLE}
            SET status = 'SENDING',
                attempts = attempts + 1,
                payload_hash = ?,
                sending_started_at = ?,
                last_error_code = NULL
          WHERE empresa_id = ? AND provider = ? AND idempotency_key = ?`,
        [row.payloadHash, row.startedAt, row.empresaId, row.provider, row.idempotencyKey]
      );
    },

    async completeOutbound(row) {
      await connection.execute(
        `UPDATE ${OUTBOUND_TABLE}
            SET status = 'SENT',
                provider_message_id = ?,
                sent_at = ?,
                last_error_code = NULL
          WHERE empresa_id = ? AND provider = ? AND idempotency_key = ?`,
        [row.providerMessageId, row.sentAt, row.empresaId, row.provider, row.idempotencyKey]
      );
    },

    async failOutbound(row) {
      await connection.execute(
        `UPDATE ${OUTBOUND_TABLE}
            SET status = 'FAILED',
                last_error_code = ?
          WHERE empresa_id = ? AND provider = ? AND idempotency_key = ?`,
        [row.errorCode, row.empresaId, row.provider, row.idempotencyKey]
      );
    },

    async deleteInboundRows(rows) {
      for (const row of rows) {
        await connection.execute(
          `DELETE FROM ${INBOUND_TABLE} WHERE empresa_id = ? AND provider = ? AND external_message_id = ?`,
          [row.empresa_id, row.provider, row.external_message_id]
        );
      }
    },

    async deleteOutboundRows(rows) {
      for (const row of rows) {
        await connection.execute(
          `DELETE FROM ${OUTBOUND_TABLE} WHERE empresa_id = ? AND provider = ? AND idempotency_key = ?`,
          [row.empresa_id, row.provider, row.idempotency_key]
        );
      }
    }
  };
}

export function createWhatsappIdempotencyService({
  repository = createMysqlWhatsappIdempotencyRepository(),
  config = env,
  loggerInstance = logger,
  now = Date.now
} = {}) {
  return {
    async claimInbound({ empresaId, provider, externalMessageId, correlationId }) {
      const startedAt = nowIso(now);
      return repository.transaction(async (tx) => {
        const row = await tx.getInbound(empresaId, provider, externalMessageId);

        if (!row) {
          await tx.insertInbound({ empresaId, provider, externalMessageId, correlationId, startedAt });
          loggerInstance.info('whatsapp_inbound_claimed', { empresaId, provider, externalMessageId });
          return { claimed: true, duplicate: false, recovered: false };
        }

        if (row.status === 'COMPLETED') {
          loggerInstance.info('whatsapp_inbound_duplicate_skipped', { empresaId, provider, externalMessageId });
          return { claimed: false, duplicate: true, status: row.status };
        }

        if (row.status === 'PROCESSING' && !isStale(row.processing_started_at, config.whatsapp.idempotency.staleMs, now)) {
          return { claimed: false, duplicate: true, status: row.status };
        }

        await tx.updateInboundProcessing({ empresaId, provider, externalMessageId, startedAt });
        loggerInstance.info(row.status === 'PROCESSING' ? 'whatsapp_inbound_claim_recovered' : 'whatsapp_inbound_claimed', {
          empresaId,
          provider,
          externalMessageId
        });
        return { claimed: true, duplicate: false, recovered: row.status === 'PROCESSING' };
      });
    },

    completeInbound({ empresaId, provider, externalMessageId }) {
      return repository.transaction((tx) => tx.completeInbound({
        empresaId,
        provider,
        externalMessageId,
        completedAt: nowIso(now)
      }));
    },

    failInbound({ empresaId, provider, externalMessageId, error }) {
      return repository.transaction((tx) => tx.failInbound({
        empresaId,
        provider,
        externalMessageId,
        errorCode: errorCode(error)
      }));
    },

    async claimOutbound({ empresaId, provider, idempotencyKey, correlationId, payloadHash }) {
      const startedAt = nowIso(now);
      return repository.transaction(async (tx) => {
        const row = await tx.getOutbound(empresaId, provider, idempotencyKey);

        if (!row) {
          await tx.insertOutbound({ empresaId, provider, idempotencyKey, correlationId, payloadHash, startedAt });
          loggerInstance.info('whatsapp_outbound_claimed', { empresaId, provider, idempotencyKey });
          return { claimed: true, duplicate: false, sent: false, recovered: false };
        }

        if (row.status === 'SENT') {
          loggerInstance.info('whatsapp_outbound_duplicate_skipped', { empresaId, provider, idempotencyKey });
          return { claimed: false, duplicate: true, sent: true, providerMessageId: row.provider_message_id };
        }

        if (row.status === 'SENDING' && !isStale(row.sending_started_at, config.whatsapp.idempotency.staleMs, now)) {
          return { claimed: false, duplicate: true, sent: false, status: row.status };
        }

        if (row.status === 'SENDING') {
          loggerInstance.warn('whatsapp_outbound_delivery_uncertain', { empresaId, provider, idempotencyKey });
        }

        await tx.updateOutboundSending({ empresaId, provider, idempotencyKey, payloadHash, startedAt });
        loggerInstance.info('whatsapp_outbound_claimed', { empresaId, provider, idempotencyKey });
        return { claimed: true, duplicate: false, sent: false, recovered: row.status === 'SENDING' };
      });
    },

    completeOutbound({ empresaId, provider, idempotencyKey, providerMessageId = null }) {
      return repository.transaction((tx) => tx.completeOutbound({
        empresaId,
        provider,
        idempotencyKey,
        providerMessageId,
        sentAt: nowIso(now)
      }));
    },

    failOutbound({ empresaId, provider, idempotencyKey, error }) {
      return repository.transaction((tx) => tx.failOutbound({
        empresaId,
        provider,
        idempotencyKey,
        errorCode: errorCode(error)
      }));
    },

    cleanup(options = {}) {
      return repository.cleanup({
        retentionDays: options.retentionDays ?? config.whatsapp.idempotency.retentionDays,
        batchSize: options.batchSize ?? 500,
        execute: Boolean(options.execute)
      });
    }
  };
}

export const whatsappIdempotencyService = createWhatsappIdempotencyService();
