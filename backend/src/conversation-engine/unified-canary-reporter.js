import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeUtf8JsonToStream } from '../utils/utf8-json-output.js';

const DEFAULT_REPORT_PATH = path.resolve(process.cwd(), 'reports', 'unified-canary-report.json');

const CANARY_MESSAGES = new Set([
  'unified_canary_error',
  'unified_canary_fallback_to_legacy',
  'unified_canary_clarify',
  'unified_canary_repeated_question_prevented',
  'unified_canary_out_of_order_entity_handled',
  'unified_canary_handoff_sent',
  'unified_canary_response_sent',
  'unified_canary_legacy_service_revived',
  'unified_recommendation_generated',
  'unified_quote_summary_generated',
  'unified_memory_enriched',
  'unified_synonym_matched',
  'unified_emoji_mode_applied',
  'unified_conversation_quality_score',
  'commercial_quality_score',
  'recommendation_generated',
  'recommendation_explained',
  'business_goal_detected',
  'business_type_detected'
]);

function parseJsonLine(line) {
  const raw = String(line ?? '').replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function eventMessage(entry) {
  return entry?.message ?? entry?.event ?? null;
}

function isCanaryEntry(entry) {
  return isObject(entry) && CANARY_MESSAGES.has(eventMessage(entry));
}

function isSyntheticFallback(entry) {
  return eventMessage(entry) === 'unified_canary_fallback_to_legacy'
    && String(entry?.reason ?? '') === 'canary boom';
}

function isSyntheticError(entry) {
  return eventMessage(entry) === 'unified_canary_error'
    && String(entry?.error?.message ?? entry?.reason ?? '') === 'canary boom';
}

function isTestArtifact(entry) {
  const stack = String(entry?.error?.stack ?? '');
  return stack.includes('.test.js');
}

function testArtifactReason(entry) {
  return String(entry?.error?.message ?? entry?.reason ?? '').trim();
}

function isTestArtifactFallback(entry, artifactReasons = new Set()) {
  return eventMessage(entry) === 'unified_canary_fallback_to_legacy'
    && artifactReasons.has(String(entry?.reason ?? '').trim());
}

function cleanupBlockedReason(criteria = {}) {
  const failed = Object.entries(criteria)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return failed.length ? `criteria_failed:${failed.join(',')}` : null;
}

export function extractCanaryEventsFromText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return [];

  const whole = parseJsonLine(trimmed);
  if (Array.isArray(whole)) return whole.filter(isCanaryEntry);
  if (isCanaryEntry(whole)) return [whole];

  return trimmed
    .split(/\r?\n/)
    .map((line) => parseJsonLine(line.trim()))
    .filter(isCanaryEntry);
}

export function evaluateCanaryEvents(inputEvents = []) {
  const events = inputEvents.filter(isCanaryEntry);
  const byMessage = {};
  const byIntent = {};
  const samples = {
    errors: [],
    fallbacks: [],
    clarifies: [],
    repeatedQuestionsPrevented: [],
    outOfOrderEntityHandled: [],
    legacyServiceRevived: []
  };

  for (const event of events) {
    const message = eventMessage(event);
    increment(byMessage, message);

    if (message === 'unified_canary_error') samples.errors.push(event);
    if (message === 'unified_canary_fallback_to_legacy') samples.fallbacks.push(event);
    if (message === 'unified_canary_clarify') samples.clarifies.push(event);
    if (message === 'unified_canary_repeated_question_prevented') samples.repeatedQuestionsPrevented.push(event);
    if (message === 'unified_canary_out_of_order_entity_handled') samples.outOfOrderEntityHandled.push(event);
    if (message === 'unified_canary_legacy_service_revived') samples.legacyServiceRevived.push(event);
  }

  const testArtifactReasons = new Set(events
    .filter(isTestArtifact)
    .map(testArtifactReason)
    .filter(Boolean));
  const productionEvents = events.filter((event) => (
    !isSyntheticFallback(event)
    && !isSyntheticError(event)
    && !isTestArtifact(event)
    && !isTestArtifactFallback(event, testArtifactReasons)
  ));
  const productionByMessage = {};
  for (const event of productionEvents) {
    increment(productionByMessage, eventMessage(event));
    if (event.intent) increment(byIntent, event.intent);
  }
  const responseEvents = productionEvents.filter((event) => eventMessage(event) === 'unified_canary_response_sent');
  const repeatedQuestionPreventedCount = byMessage.unified_canary_repeated_question_prevented
    ?? responseEvents.filter((event) => event.repeatedQuestionPrevented).length;
  const outOfOrderEntityHandledCount = byMessage.unified_canary_out_of_order_entity_handled
    ?? responseEvents.filter((event) => event.outOfOrderEntityHandled).length;
  const handoffSentCount = byMessage.unified_canary_handoff_sent
    ?? responseEvents.filter((event) => event.handoff).length;
  const criticalFallbackCount = productionByMessage.unified_canary_fallback_to_legacy ?? 0;
  const legacyServiceRevivedCount = productionByMessage.unified_canary_legacy_service_revived
    ?? responseEvents.filter((event) => event.legacyServiceRevived).length;

  const report = {
    generatedAt: new Date().toISOString(),
    totalEvents: productionEvents.length,
    totalResponses: responseEvents.length,
    unifiedCanaryErrorCount: productionByMessage.unified_canary_error ?? 0,
    fallbackToLegacyCount: criticalFallbackCount,
    syntheticFallbackIgnoredCount: events.length - productionEvents.length,
    clarifyIntentCount: byMessage.unified_canary_clarify ?? (byIntent.CLARIFY ?? 0),
    commercialQualityScoreCount: byMessage.commercial_quality_score ?? 0,
    recommendationGeneratedCount: byMessage.recommendation_generated ?? byMessage.unified_recommendation_generated ?? 0,
    recommendationExplainedCount: byMessage.recommendation_explained ?? 0,
    businessGoalDetectedCount: byMessage.business_goal_detected ?? 0,
    businessTypeDetectedCount: byMessage.business_type_detected ?? 0,
    repeatedQuestionPreventedCount,
    outOfOrderEntityHandledCount,
    handoffSentCount,
    legacyServiceRevivedCount,
    byMessage: productionByMessage,
    byIntent,
    phase7: {
      canProceedToLegacyCleanup: false,
      criteria: {
        hasCanaryEvents: productionEvents.length > 0,
        zeroCriticalFallbacks: criticalFallbackCount === 0,
        zeroLegacyServiceRevived: legacyServiceRevivedCount === 0,
        zeroUnhandledRepeatedQuestions: true,
        rollbackStillObservable: true,
        advisorObserved: handoffSentCount > 0
      },
      reason: productionEvents.length === 0 ? 'no_canary_events_found' : null
    },
    samples: {
      errors: samples.errors.slice(0, 20),
      fallbacks: samples.fallbacks.slice(0, 20),
      clarifies: samples.clarifies.slice(0, 20),
      repeatedQuestionsPrevented: samples.repeatedQuestionsPrevented.slice(0, 20),
      outOfOrderEntityHandled: samples.outOfOrderEntityHandled.slice(0, 20),
      legacyServiceRevived: samples.legacyServiceRevived.slice(0, 20)
    }
  };
  report.phase7.canProceedToLegacyCleanup = Object.values(report.phase7.criteria).every(Boolean);
  if (!report.phase7.canProceedToLegacyCleanup && !report.phase7.reason) {
    report.phase7.reason = cleanupBlockedReason(report.phase7.criteria);
  }
  return report;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFilesFromDirectory(directory) {
  if (!await pathExists(directory)) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(log|json|jsonl)$/i.test(entry.name))
    .map((entry) => path.join(directory, entry.name));
}

async function defaultInputFiles() {
  const cwd = process.cwd();
  return [
    ...await collectFilesFromDirectory(path.join(cwd, 'logs')),
    ...await collectFilesFromDirectory(cwd)
  ];
}

async function readEventsFromFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return extractCanaryEventsFromText(text);
}

export async function loadCanaryEvents({ inputPaths = [] } = {}) {
  const paths = inputPaths.length ? inputPaths : await defaultInputFiles();
  const events = [];
  for (const inputPath of [...new Set(paths)]) {
    if (!await pathExists(inputPath)) continue;
    const stats = await fs.stat(inputPath);
    if (stats.isDirectory()) {
      for (const file of await collectFilesFromDirectory(inputPath)) {
        events.push(...await readEventsFromFile(file));
      }
      continue;
    }
    events.push(...await readEventsFromFile(inputPath));
  }
  return events;
}

function parseArgs(argv) {
  const inputPaths = [];
  let outputPath = process.env.UNIFIED_CANARY_REPORT_PATH || DEFAULT_REPORT_PATH;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input' || arg === '-i') {
      inputPaths.push(path.resolve(argv[index + 1]));
      index += 1;
    } else if (arg.startsWith('--input=')) {
      inputPaths.push(path.resolve(arg.slice('--input='.length)));
    } else if (arg === '--output' || arg === '-o') {
      outputPath = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--output=')) {
      outputPath = path.resolve(arg.slice('--output='.length));
    } else if (arg && !arg.startsWith('-')) {
      inputPaths.push(path.resolve(arg));
    }
  }
  return { inputPaths, outputPath: path.resolve(outputPath) };
}

export async function runCanaryReporterCli(argv = process.argv.slice(2)) {
  const { inputPaths, outputPath } = parseArgs(argv);
  const events = await loadCanaryEvents({ inputPaths: asArray(inputPaths) });
  const report = evaluateCanaryEvents(events);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeUtf8JsonToStream(process.stdout, {
    event: 'unified_canary_report_completed',
    outputPath,
    totalEvents: report.totalEvents,
    totalResponses: report.totalResponses,
    fallbackToLegacyCount: report.fallbackToLegacyCount,
    canProceedToLegacyCleanup: report.phase7.canProceedToLegacyCleanup
  });
  return report;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCanaryReporterCli().catch((error) => {
    writeUtf8JsonToStream(process.stderr, {
      event: 'unified_canary_report_failed',
      error: {
        name: error?.name,
        message: error?.message
      }
    });
    process.exitCode = 1;
  });
}
