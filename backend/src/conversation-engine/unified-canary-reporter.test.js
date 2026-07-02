import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { logger } from '../utils/logger.js';
import {
  evaluateCanaryEvents,
  extractCanaryEventsFromText,
  loadCanaryEvents,
  runCanaryReporterCli
} from './unified-canary-reporter.js';

describe('Unified Planner Canary reporter phase 7', () => {
  it('extracts canary events from JSONL logs', () => {
    const text = [
      JSON.stringify({ message: 'other_event', value: 1 }),
      JSON.stringify({ message: 'unified_canary_error', empresaId: 5 }),
      `[nodemon] ${JSON.stringify({ message: 'unified_canary_response_sent', intent: 'CLARIFY' })}`
    ].join('\n');

    const events = extractCanaryEventsFromText(text);

    assert.equal(events.length, 2);
    assert.equal(events[0].message, 'unified_canary_error');
    assert.equal(events[1].message, 'unified_canary_response_sent');
  });

  it('counts daily canary stability signals', () => {
    const report = evaluateCanaryEvents([
      { message: 'unified_canary_response_sent', intent: 'SHOW_CATALOG', handoff: false },
      { message: 'unified_canary_clarify', reason: 'ambiguous_number_requires_clarification' },
      { message: 'unified_canary_repeated_question_prevented', questionId: 'quote.design' },
      { message: 'unified_canary_out_of_order_entity_handled', selectedService: 'Impresion de lona' },
      { message: 'unified_canary_handoff_sent', reason: 'customer_requested_advisor' }
    ]);

    assert.equal(report.totalEvents, 5);
    assert.equal(report.unifiedCanaryErrorCount, 0);
    assert.equal(report.fallbackToLegacyCount, 0);
    assert.equal(report.clarifyIntentCount, 1);
    assert.equal(report.repeatedQuestionPreventedCount, 1);
    assert.equal(report.outOfOrderEntityHandledCount, 1);
    assert.equal(report.handoffSentCount, 1);
    assert.equal(report.legacyServiceRevivedCount, 0);
    assert.equal(report.phase7.canProceedToLegacyCleanup, true);
  });

  it('blocks cleanup when fallback or legacy service revival appears', () => {
    const report = evaluateCanaryEvents([
      { message: 'unified_canary_response_sent', intent: 'START_SERVICE_QUOTE' },
      { message: 'unified_canary_fallback_to_legacy', reason: 'boom' },
      { message: 'unified_canary_legacy_service_revived', selectedService: 'Aluminio cepillado' }
    ]);

    assert.equal(report.fallbackToLegacyCount, 1);
    assert.equal(report.legacyServiceRevivedCount, 1);
    assert.equal(report.phase7.canProceedToLegacyCleanup, false);
    assert.match(report.phase7.reason, /zeroCriticalFallbacks/);
    assert.match(report.phase7.reason, /zeroLegacyServiceRevived/);
  });

  it('includes a clear reason whenever cleanup cannot proceed', () => {
    const report = evaluateCanaryEvents([
      { message: 'unified_canary_response_sent', intent: 'SHOW_CATALOG' }
    ]);

    assert.equal(report.fallbackToLegacyCount, 0);
    assert.equal(report.unifiedCanaryErrorCount, 0);
    assert.equal(report.legacyServiceRevivedCount, 0);
    assert.equal(report.phase7.canProceedToLegacyCleanup, false);
    assert.equal(report.phase7.reason, 'criteria_failed:advisorObserved');
  });

  it('records but ignores synthetic canary boom fallback in clean reports', () => {
    const report = evaluateCanaryEvents([
      { message: 'unified_canary_response_sent', intent: 'HANDOFF', handoff: true },
      { message: 'unified_canary_handoff_sent', reason: 'customer_requested_advisor' },
      { message: 'unified_canary_error', error: { message: 'canary boom' } },
      { message: 'unified_canary_fallback_to_legacy', reason: 'canary boom' }
    ]);

    assert.equal(report.fallbackToLegacyCount, 0);
    assert.equal(report.unifiedCanaryErrorCount, 0);
    assert.equal(report.syntheticFallbackIgnoredCount, 2);
    assert.equal(report.samples.fallbacks[0].reason, 'canary boom');
    assert.equal(report.phase7.canProceedToLegacyCleanup, true);
  });

  it('ignores canary fallback artifacts produced by test stacks', () => {
    const report = evaluateCanaryEvents([
      { message: 'unified_canary_response_sent', intent: 'HANDOFF', handoff: true },
      { message: 'unified_canary_handoff_sent', reason: 'customer_requested_advisor' },
      {
        message: 'unified_canary_error',
        error: {
          message: 'semantic classifier should not be called',
          stack: 'Error: semantic classifier should not be called\n    at file:///tmp/unified-canary-mode.test.js:1:1'
        }
      },
      { message: 'unified_canary_fallback_to_legacy', reason: 'semantic classifier should not be called' }
    ]);

    assert.equal(report.fallbackToLegacyCount, 0);
    assert.equal(report.unifiedCanaryErrorCount, 0);
    assert.equal(report.syntheticFallbackIgnoredCount, 2);
    assert.equal(report.phase7.canProceedToLegacyCleanup, true);
  });

  it('blocks cleanup when no canary events were found', () => {
    const report = evaluateCanaryEvents([]);

    assert.equal(report.totalEvents, 0);
    assert.equal(report.phase7.canProceedToLegacyCleanup, false);
    assert.equal(report.phase7.reason, 'no_canary_events_found');
    assert.equal(report.phase7.criteria.hasCanaryEvents, false);
  });

  it('writes and reads selectedService with UTF-8 accents', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unified-canary-utf8-'));
    const logPath = path.join(tempDir, 'unified-canary.jsonl');
    const reportPath = path.join(tempDir, 'unified-canary-report.json');
    const previousLogPath = process.env.UNIFIED_CANARY_LOG_PATH;
    const originalStdoutWrite = process.stdout.write;
    const stdoutChunks = [];

    process.env.UNIFIED_CANARY_LOG_PATH = logPath;
    process.stdout.write = function write(chunk, encoding, callback) {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
      if (typeof callback === 'function') callback();
      return true;
    };

    try {
      logger.info('unified_canary_out_of_order_entity_handled', {
        selectedService: 'Impresión de lona',
        nextState: 'ESPERANDO_DISENO'
      });

      const rawLog = await fs.readFile(logPath);
      assert.equal(rawLog.includes(Buffer.from('Impresión de lona', 'utf8')), true);
      assert.equal(rawLog.includes(Buffer.from('ImpresiÃ³n de lona', 'utf8')), false);

      const [loggedEvent] = rawLog.toString('utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
      assert.equal(loggedEvent.selectedService, 'Impresión de lona');

      const [loadedEvent] = await loadCanaryEvents({ inputPaths: [logPath] });
      assert.equal(loadedEvent.selectedService, 'Impresión de lona');

      await runCanaryReporterCli(['--input', logPath, '--output', reportPath]);
      const rawReport = await fs.readFile(reportPath);
      assert.equal(rawReport.includes(Buffer.from('Impresión de lona', 'utf8')), true);
      const report = JSON.parse(rawReport.toString('utf8'));
      assert.equal(report.samples.outOfOrderEntityHandled[0].selectedService, 'Impresión de lona');

      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      assert.match(stdout, /"selectedService":"Impresión de lona"/);
      assert.doesNotMatch(stdout, /ImpresiÃ³n/);
    } finally {
      process.stdout.write = originalStdoutWrite;
      if (previousLogPath === undefined) {
        delete process.env.UNIFIED_CANARY_LOG_PATH;
      } else {
        process.env.UNIFIED_CANARY_LOG_PATH = previousLogPath;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
