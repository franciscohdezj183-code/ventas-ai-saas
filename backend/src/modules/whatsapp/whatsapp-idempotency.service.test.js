import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOutboundIdempotencyKey,
  createOutboundPayloadHash,
  createWhatsappIdempotencyService
} from './whatsapp-idempotency.service.js';

function cloneMap(map) {
  return new Map(Array.from(map.entries()).map(([key, value]) => [key, { ...value }]));
}

function createMemoryRepository() {
  const inbound = new Map();
  const outbound = new Map();
  let lock = Promise.resolve();
  let failCommit = false;

  function inboundKey(empresaId, provider, externalMessageId) {
    return `${empresaId}:${provider}:${externalMessageId}`;
  }

  function outboundKey(empresaId, provider, idempotencyKey) {
    return `${empresaId}:${provider}:${idempotencyKey}`;
  }

  return {
    inbound,
    outbound,
    failNextCommit() {
      failCommit = true;
    },
    async transaction(work) {
      const previous = lock;
      let release;
      lock = new Promise((resolve) => {
        release = resolve;
      });
      await previous;

      const nextInbound = cloneMap(inbound);
      const nextOutbound = cloneMap(outbound);
      const tx = {
        async getInbound(empresaId, provider, externalMessageId) {
          return nextInbound.get(inboundKey(empresaId, provider, externalMessageId)) ?? null;
        },
        async insertInbound(row) {
          nextInbound.set(inboundKey(row.empresaId, row.provider, row.externalMessageId), {
            empresa_id: row.empresaId,
            provider: row.provider,
            external_message_id: row.externalMessageId,
            correlation_id: row.correlationId,
            status: 'PROCESSING',
            attempts: 1,
            processing_started_at: row.startedAt
          });
        },
        async updateInboundProcessing(row) {
          const current = nextInbound.get(inboundKey(row.empresaId, row.provider, row.externalMessageId));
          nextInbound.set(inboundKey(row.empresaId, row.provider, row.externalMessageId), {
            ...current,
            status: 'PROCESSING',
            attempts: Number(current?.attempts ?? 0) + 1,
            processing_started_at: row.startedAt,
            last_error_code: null
          });
        },
        async completeInbound(row) {
          const key = inboundKey(row.empresaId, row.provider, row.externalMessageId);
          nextInbound.set(key, { ...nextInbound.get(key), status: 'COMPLETED', completed_at: row.completedAt });
        },
        async failInbound(row) {
          const key = inboundKey(row.empresaId, row.provider, row.externalMessageId);
          nextInbound.set(key, { ...nextInbound.get(key), status: 'FAILED', last_error_code: row.errorCode });
        },
        async getOutbound(empresaId, provider, idempotencyKey) {
          return nextOutbound.get(outboundKey(empresaId, provider, idempotencyKey)) ?? null;
        },
        async insertOutbound(row) {
          nextOutbound.set(outboundKey(row.empresaId, row.provider, row.idempotencyKey), {
            empresa_id: row.empresaId,
            provider: row.provider,
            idempotency_key: row.idempotencyKey,
            correlation_id: row.correlationId,
            payload_hash: row.payloadHash,
            status: 'SENDING',
            attempts: 1,
            sending_started_at: row.startedAt
          });
        },
        async updateOutboundSending(row) {
          const key = outboundKey(row.empresaId, row.provider, row.idempotencyKey);
          const current = nextOutbound.get(key);
          nextOutbound.set(key, {
            ...current,
            status: 'SENDING',
            attempts: Number(current?.attempts ?? 0) + 1,
            payload_hash: row.payloadHash,
            sending_started_at: row.startedAt,
            last_error_code: null
          });
        },
        async completeOutbound(row) {
          const key = outboundKey(row.empresaId, row.provider, row.idempotencyKey);
          nextOutbound.set(key, {
            ...nextOutbound.get(key),
            status: 'SENT',
            sent_at: row.sentAt,
            provider_message_id: row.providerMessageId
          });
        },
        async failOutbound(row) {
          const key = outboundKey(row.empresaId, row.provider, row.idempotencyKey);
          nextOutbound.set(key, { ...nextOutbound.get(key), status: 'FAILED', last_error_code: row.errorCode });
        },
        async deleteInboundRows(rows) {
          for (const row of rows) nextInbound.delete(inboundKey(row.empresa_id, row.provider, row.external_message_id));
        },
        async deleteOutboundRows(rows) {
          for (const row of rows) nextOutbound.delete(outboundKey(row.empresa_id, row.provider, row.idempotency_key));
        }
      };

      try {
        const result = await work(tx);
        if (failCommit) {
          failCommit = false;
          throw new Error('commit failed');
        }
        inbound.clear();
        outbound.clear();
        for (const [key, value] of nextInbound) inbound.set(key, value);
        for (const [key, value] of nextOutbound) outbound.set(key, value);
        return result;
      } finally {
        release();
      }
    },
    async cleanup({ retentionDays, batchSize, execute }) {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const inboundRows = Array.from(inbound.values())
        .filter((row) => row.status === 'COMPLETED' && new Date(row.completed_at).getTime() < cutoff)
        .slice(0, batchSize)
        .map((row) => ({ empresa_id: row.empresa_id, provider: row.provider, external_message_id: row.external_message_id }));
      const outboundRows = Array.from(outbound.values())
        .filter((row) => row.status === 'SENT' && new Date(row.sent_at).getTime() < cutoff)
        .slice(0, batchSize)
        .map((row) => ({ empresa_id: row.empresa_id, provider: row.provider, idempotency_key: row.idempotency_key }));

      if (!execute) return { inbound: inboundRows.length, outbound: outboundRows.length, deleted: false };

      return this.transaction(async (tx) => {
        await tx.deleteInboundRows(inboundRows);
        await tx.deleteOutboundRows(outboundRows);
        return { inbound: inboundRows.length, outbound: outboundRows.length, deleted: true };
      });
    }
  };
}

function createHarness(nowValue = Date.parse('2026-07-17T10:00:00Z')) {
  const repository = createMemoryRepository();
  const service = createWhatsappIdempotencyService({
    repository,
    config: { whatsapp: { idempotency: { staleMs: 1000, retentionDays: 30 } } },
    loggerInstance: { info() {}, warn() {}, error() {} },
    now: () => nowValue
  });
  return { repository, service };
}

test('two concurrent inbound claims: only one wins', async () => {
  const { service } = createHarness();
  const claims = await Promise.all([
    service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm1', correlationId: 'c1' }),
    service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm1', correlationId: 'c1' })
  ]);

  assert.equal(claims.filter((claim) => claim.claimed).length, 1);
});

test('same external_message_id in different companies both process', async () => {
  const { service } = createHarness();

  assert.equal((await service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm1' })).claimed, true);
  assert.equal((await service.claimInbound({ empresaId: 6, provider: 'baileys', externalMessageId: 'm1' })).claimed, true);
});

test('COMPLETED duplicate is skipped and FAILED can retry', async () => {
  const { service } = createHarness();

  await service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm1' });
  await service.completeInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm1' });
  assert.deepEqual(
    await service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm1' }),
    { claimed: false, duplicate: true, status: 'COMPLETED' }
  );

  await service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm2' });
  await service.failInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm2', error: Object.assign(new Error('x'), { code: 'ETEMP' }) });
  assert.equal((await service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm2' })).claimed, true);
});

test('recent PROCESSING is not duplicated and stale PROCESSING is recovered', async () => {
  const { repository, service } = createHarness(Date.parse('2026-07-17T10:00:00Z'));

  await service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm1' });
  assert.equal((await service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm1' })).claimed, false);
  repository.inbound.get('5:baileys:m1').processing_started_at = '2026-07-17T09:59:58.000Z';

  const later = createWhatsappIdempotencyService({
    repository,
    config: { whatsapp: { idempotency: { staleMs: 1000, retentionDays: 30 } } },
    loggerInstance: { info() {}, warn() {}, error() {} },
    now: () => Date.parse('2026-07-17T10:00:02Z')
  });
  const recovered = await later.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm1' });
  assert.equal(recovered.claimed, true);
  assert.equal(recovered.recovered, true);
});

test('outbound idempotency key is stable and two concurrent claims allow one send', async () => {
  const { service } = createHarness();
  const job = { empresaId: 5, provider: 'baileys', correlationId: 'reply-5-m1', messageId: 'x', type: 'text', text: 'hola' };
  const key = createOutboundIdempotencyKey(job);
  const hash = createOutboundPayloadHash(job);

  assert.equal(key, createOutboundIdempotencyKey({ ...job }));
  assert.equal(hash, createOutboundPayloadHash({ ...job }));

  const claims = await Promise.all([
    service.claimOutbound({ empresaId: 5, provider: 'baileys', idempotencyKey: key, correlationId: job.correlationId, payloadHash: hash }),
    service.claimOutbound({ empresaId: 5, provider: 'baileys', idempotencyKey: key, correlationId: job.correlationId, payloadHash: hash })
  ]);

  assert.equal(claims.filter((claim) => claim.claimed).length, 1);
});

test('SENT outbound does not send again and provider failure can retry', async () => {
  const { service } = createHarness();
  const key = 'reply-5-m1';

  await service.claimOutbound({ empresaId: 5, provider: 'baileys', idempotencyKey: key, correlationId: key, payloadHash: 'abc' });
  await service.completeOutbound({ empresaId: 5, provider: 'baileys', idempotencyKey: key, providerMessageId: 'provider-1' });
  const duplicate = await service.claimOutbound({ empresaId: 5, provider: 'baileys', idempotencyKey: key, correlationId: key, payloadHash: 'abc' });
  assert.equal(duplicate.sent, true);

  await service.claimOutbound({ empresaId: 5, provider: 'baileys', idempotencyKey: 'retry', correlationId: 'retry', payloadHash: 'def' });
  await service.failOutbound({ empresaId: 5, provider: 'baileys', idempotencyKey: 'retry', error: Object.assign(new Error('temporary'), { code: 'ETEMP' }) });
  assert.equal((await service.claimOutbound({ empresaId: 5, provider: 'baileys', idempotencyKey: 'retry', correlationId: 'retry', payloadHash: 'def' })).claimed, true);
});

test('cleanup dry-run does not delete and execute only deletes expired completed/sent rows', async () => {
  const { repository, service } = createHarness();
  await service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'old' });
  await service.completeInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'old' });
  repository.inbound.get('5:baileys:old').completed_at = '2026-01-01 00:00:00';
  await service.claimOutbound({ empresaId: 5, provider: 'baileys', idempotencyKey: 'old', correlationId: 'old', payloadHash: 'abc' });
  await service.completeOutbound({ empresaId: 5, provider: 'baileys', idempotencyKey: 'old' });
  repository.outbound.get('5:baileys:old').sent_at = '2026-01-01 00:00:00';

  assert.deepEqual(await service.cleanup({ retentionDays: 30, execute: false }), { inbound: 1, outbound: 1, deleted: false });
  assert.equal(repository.inbound.size, 1);
  assert.deepEqual(await service.cleanup({ retentionDays: 30, execute: true }), { inbound: 1, outbound: 1, deleted: true });
  assert.equal(repository.inbound.size, 0);
  assert.equal(repository.outbound.size, 0);
});

test('transaction rollback prevents partial inbound claim persistence', async () => {
  const { repository, service } = createHarness();
  repository.failNextCommit();

  await assert.rejects(
    () => service.claimInbound({ empresaId: 5, provider: 'baileys', externalMessageId: 'm1' }),
    /commit failed/
  );
  assert.equal(repository.inbound.size, 0);
});
