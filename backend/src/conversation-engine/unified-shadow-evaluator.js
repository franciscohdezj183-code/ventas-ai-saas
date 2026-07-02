import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_MESSAGE = 'unified_shadow_comparison';
const DEFAULT_REPORT_PATH = path.resolve(process.cwd(), 'reports', 'unified-shadow-report.json');

export const DIFFERENCE_TYPES = Object.freeze({
  INCORRECT_SERVICE: 'Servicio incorrecto',
  INCORRECT_STATE: 'Estado incorrecto',
  INCORRECT_HANDOFF: 'Handoff incorrecto',
  REPEATED_QUESTION: 'Pregunta repetida',
  STALE_MEMORY_REVIVED: 'Revive memoria vieja',
  MISINTERPRETED_NUMBER: 'Interpreta numero mal',
  INCORRECT_CATALOG_OR_CATEGORY: 'Catalogo/categoria incorrecta',
  EMPTY_RESPONSE_OR_ERROR: 'Respuesta vacia o error',
  SERVICE_CHANGED_WITHOUT_EXPLICIT_INTENT: 'Cambio de servicio sin intencion explicita'
});

const NO_RESULTS_PATTERN = /\b(no contamos|no manejamos|no tenemos|no ofrecemos|no encontre|no encontramos|no hay|no pude encontrar)\b/i;
const USEFUL_RESPONSE_PATTERN = /\b(catalogo|servicios|opciones|cotizar|medidas|presupuesto|asesor|textil|lona)\b/i;

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function comparable(value) {
  const normalized = normalize(value);
  return normalized || null;
}

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((Number(numerator ?? 0) / Number(denominator)) * 100).toFixed(2));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function responseLooksEmptyOrError(value) {
  const text = normalize(value);
  return !text || /\b(error|exception|failed|fallo|undefined|null)\b/.test(text);
}

function responseLooksLikeOldFailure(value) {
  return responseLooksEmptyOrError(value) || NO_RESULTS_PATTERN.test(String(value ?? ''));
}

function responseLooksUseful(value) {
  const text = String(value ?? '');
  return !responseLooksEmptyOrError(text) && USEFUL_RESPONSE_PATTERN.test(text);
}

function sameNormalized(left, right) {
  return comparable(left) === comparable(right);
}

function hasServiceEntity(comparison) {
  return Boolean(comparison?.executionPlan?.entities?.service ?? comparison?.entities?.service);
}

function hasAmbiguousNumberEntity(comparison) {
  return Boolean(comparison?.executionPlan?.entities?.ambiguousNumber ?? comparison?.entities?.ambiguousNumber);
}

function plannerIntent(comparison) {
  return comparison?.unifiedIntent
    ?? comparison?.executionPlan?.intent
    ?? comparison?.executionPlan?.decision?.intent
    ?? null;
}

function oldIntent(comparison) {
  return comparison?.oldIntent ?? comparison?.legacyIntent ?? null;
}

function selectedService(value) {
  if (!isObject(value)) return value ?? null;
  return value.nombre ?? value.name ?? value.selectedServiceName ?? null;
}

function unifiedSelectedService(comparison) {
  return selectedService(comparison?.unifiedSelectedService)
    ?? selectedService(comparison?.executionPlan?.selectedService)
    ?? null;
}

function oldSelectedService(comparison) {
  return selectedService(comparison?.oldSelectedService) ?? null;
}

function nextState(value) {
  return value ?? null;
}

function isContinuationIntent(intent) {
  return ['ANSWER_PREVIOUS_QUESTION'].includes(String(intent ?? ''));
}

function isCatalogIntent(intent) {
  return ['SHOW_CATALOG', 'SHOW_CATEGORY'].includes(String(intent ?? ''));
}

function repeatedQuestion(comparison) {
  return Boolean(
    comparison?.executionPlan?.responsePlan?.repeatedQuestion
    || comparison?.responsePlan?.repeatedQuestion
  );
}

function unifiedError(comparison) {
  return Boolean(comparison?.error)
    || responseLooksEmptyOrError(comparison?.unifiedResponse)
    || Boolean(comparison?.executorResult?.error);
}

function oldError(comparison) {
  return responseLooksEmptyOrError(comparison?.oldEngineResponse);
}

function staleMemoryRevived(comparison) {
  const intent = plannerIntent(comparison);
  const unifiedService = unifiedSelectedService(comparison);
  if (!unifiedService || hasServiceEntity(comparison) || isContinuationIntent(intent)) return false;
  return !isCatalogIntent(intent);
}

function serviceChangedWithoutExplicitIntent(comparison) {
  const oldService = oldSelectedService(comparison);
  const unifiedService = unifiedSelectedService(comparison);
  if (!oldService || !unifiedService || sameNormalized(oldService, unifiedService)) return false;
  return !hasServiceEntity(comparison);
}

function ambiguousNumberMisread(comparison) {
  if (!hasAmbiguousNumberEntity(comparison)) return false;
  const intent = plannerIntent(comparison);
  const state = normalize(comparison?.unifiedNextState ?? comparison?.executionPlan?.nextState);
  return intent !== 'CLARIFY' || !['init', 'clarify'].some((token) => state.includes(token));
}

function catalogOrCategoryIncorrect(comparison) {
  const intent = plannerIntent(comparison);
  if (!isCatalogIntent(intent)) return false;
  if (unifiedSelectedService(comparison)) return true;
  return responseLooksEmptyOrError(comparison?.unifiedResponse);
}

export function classifyShadowComparison(comparison) {
  const types = new Set();
  const oldService = oldSelectedService(comparison);
  const unifiedService = unifiedSelectedService(comparison);
  const oldState = nextState(comparison?.oldNextState);
  const unifiedState = nextState(comparison?.unifiedNextState ?? comparison?.executionPlan?.nextState);
  const oldHandoff = Boolean(comparison?.oldHandoff);
  const unifiedHandoff = Boolean(comparison?.unifiedHandoff ?? comparison?.executionPlan?.handoffPlan?.needed);

  if (unifiedError(comparison) || oldError(comparison)) {
    types.add(DIFFERENCE_TYPES.EMPTY_RESPONSE_OR_ERROR);
  }
  if (!sameNormalized(oldService, unifiedService)) {
    types.add(DIFFERENCE_TYPES.INCORRECT_SERVICE);
  }
  if (!sameNormalized(oldState, unifiedState)) {
    types.add(DIFFERENCE_TYPES.INCORRECT_STATE);
  }
  if (oldHandoff !== unifiedHandoff) {
    types.add(DIFFERENCE_TYPES.INCORRECT_HANDOFF);
  }
  if (repeatedQuestion(comparison)) {
    types.add(DIFFERENCE_TYPES.REPEATED_QUESTION);
  }
  if (staleMemoryRevived(comparison)) {
    types.add(DIFFERENCE_TYPES.STALE_MEMORY_REVIVED);
  }
  if (ambiguousNumberMisread(comparison)) {
    types.add(DIFFERENCE_TYPES.MISINTERPRETED_NUMBER);
  }
  if (catalogOrCategoryIncorrect(comparison)) {
    types.add(DIFFERENCE_TYPES.INCORRECT_CATALOG_OR_CATEGORY);
  }
  if (serviceChangedWithoutExplicitIntent(comparison)) {
    types.add(DIFFERENCE_TYPES.SERVICE_CHANGED_WITHOUT_EXPLICIT_INTENT);
  }

  return [...types];
}

function unifiedLooksBetter(comparison, differenceTypes) {
  if (unifiedError(comparison)) return false;
  if (responseLooksLikeOldFailure(comparison?.oldEngineResponse) && responseLooksUseful(comparison?.unifiedResponse)) return true;
  if (
    oldSelectedService(comparison)
    && !unifiedSelectedService(comparison)
    && isCatalogIntent(plannerIntent(comparison))
  ) return true;
  if (hasAmbiguousNumberEntity(comparison) && plannerIntent(comparison) === 'CLARIFY') return true;
  return differenceTypes.length > 0
    && !differenceTypes.some((type) => [
      DIFFERENCE_TYPES.EMPTY_RESPONSE_OR_ERROR,
      DIFFERENCE_TYPES.REPEATED_QUESTION,
      DIFFERENCE_TYPES.STALE_MEMORY_REVIVED,
      DIFFERENCE_TYPES.MISINTERPRETED_NUMBER,
      DIFFERENCE_TYPES.SERVICE_CHANGED_WITHOUT_EXPLICIT_INTENT
    ].includes(type))
    && responseLooksUseful(comparison?.unifiedResponse);
}

function oldLooksBetter(comparison, differenceTypes) {
  return unifiedError(comparison)
    || differenceTypes.includes(DIFFERENCE_TYPES.REPEATED_QUESTION)
    || differenceTypes.includes(DIFFERENCE_TYPES.STALE_MEMORY_REVIVED)
    || differenceTypes.includes(DIFFERENCE_TYPES.MISINTERPRETED_NUMBER)
    || differenceTypes.includes(DIFFERENCE_TYPES.SERVICE_CHANGED_WITHOUT_EXPLICIT_INTENT);
}

function isCriticalForUnified(differenceTypes) {
  return differenceTypes.some((type) => [
    DIFFERENCE_TYPES.EMPTY_RESPONSE_OR_ERROR,
    DIFFERENCE_TYPES.INCORRECT_HANDOFF,
    DIFFERENCE_TYPES.REPEATED_QUESTION,
    DIFFERENCE_TYPES.STALE_MEMORY_REVIVED,
    DIFFERENCE_TYPES.MISINTERPRETED_NUMBER,
    DIFFERENCE_TYPES.INCORRECT_CATALOG_OR_CATEGORY,
    DIFFERENCE_TYPES.SERVICE_CHANGED_WITHOUT_EXPLICIT_INTENT
  ].includes(type));
}

function normalizeComparison(entry) {
  const comparison = entry?.comparison ?? entry;
  return {
    ...comparison,
    oldIntent: oldIntent(comparison),
    unifiedIntent: plannerIntent(comparison),
    oldSelectedService: oldSelectedService(comparison),
    unifiedSelectedService: unifiedSelectedService(comparison),
    oldNextState: comparison?.oldNextState ?? null,
    unifiedNextState: comparison?.unifiedNextState ?? comparison?.executionPlan?.nextState ?? null,
    oldHandoff: Boolean(comparison?.oldHandoff),
    unifiedHandoff: Boolean(comparison?.unifiedHandoff ?? comparison?.executionPlan?.handoffPlan?.needed),
    mismatchReason: asArray(comparison?.mismatchReason)
  };
}

export function evaluateShadowComparisons(inputComparisons = []) {
  const comparisons = inputComparisons.map(normalizeComparison);
  const totals = {
    totalComparisons: comparisons.length,
    sameIntent: 0,
    intentComparable: 0,
    selectedServiceMatches: 0,
    nextStateMatches: 0,
    oldEngineFailureDetected: 0,
    unifiedEngineFailureDetected: 0,
    unifiedBetterCount: 0,
    oldBetterCount: 0,
    criticalMismatchCount: 0
  };
  const differenceCounts = Object.fromEntries(Object.values(DIFFERENCE_TYPES).map((type) => [type, 0]));
  const criticalSamples = [];

  for (const comparison of comparisons) {
    const types = classifyShadowComparison(comparison);
    for (const type of types) differenceCounts[type] += 1;

    if (comparison.oldIntent || comparison.unifiedIntent) {
      totals.intentComparable += 1;
      if (sameNormalized(comparison.oldIntent, comparison.unifiedIntent)) totals.sameIntent += 1;
    }
    if (sameNormalized(comparison.oldSelectedService, comparison.unifiedSelectedService)) {
      totals.selectedServiceMatches += 1;
    }
    if (sameNormalized(comparison.oldNextState, comparison.unifiedNextState)) {
      totals.nextStateMatches += 1;
    }
    if (oldError(comparison) || responseLooksLikeOldFailure(comparison.oldEngineResponse)) {
      totals.oldEngineFailureDetected += 1;
    }
    if (unifiedError(comparison)) {
      totals.unifiedEngineFailureDetected += 1;
    }
    if (unifiedLooksBetter(comparison, types)) totals.unifiedBetterCount += 1;
    if (oldLooksBetter(comparison, types)) totals.oldBetterCount += 1;
    if (isCriticalForUnified(types)) {
      totals.criticalMismatchCount += 1;
      criticalSamples.push({
        oldEngineResponse: comparison.oldEngineResponse ?? null,
        unifiedResponse: comparison.unifiedResponse ?? null,
        oldSelectedService: comparison.oldSelectedService ?? null,
        unifiedSelectedService: comparison.unifiedSelectedService ?? null,
        oldNextState: comparison.oldNextState ?? null,
        unifiedNextState: comparison.unifiedNextState ?? null,
        oldHandoff: comparison.oldHandoff,
        unifiedHandoff: comparison.unifiedHandoff,
        differenceTypes: types
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalComparisons: totals.totalComparisons,
    sameIntentRate: percent(totals.sameIntent, totals.intentComparable || totals.totalComparisons),
    selectedServiceMatchRate: percent(totals.selectedServiceMatches, totals.totalComparisons),
    nextStateMatchRate: percent(totals.nextStateMatches, totals.totalComparisons),
    oldEngineFailureDetected: totals.oldEngineFailureDetected,
    unifiedEngineFailureDetected: totals.unifiedEngineFailureDetected,
    unifiedBetterCount: totals.unifiedBetterCount,
    oldBetterCount: totals.oldBetterCount,
    criticalMismatchCount: totals.criticalMismatchCount,
    differenceCounts,
    phase6B: {
      canProceed: false,
      criteria: {
        zeroCriticalUnifiedErrors: totals.criticalMismatchCount === 0,
        unifiedBeatsOld: totals.unifiedBetterCount > totals.oldBetterCount,
        noStaleMemoryRevival: differenceCounts[DIFFERENCE_TYPES.STALE_MEMORY_REVIVED] === 0,
        noExactRepeatedQuestion: differenceCounts[DIFFERENCE_TYPES.REPEATED_QUESTION] === 0,
        noServiceChangeWithoutExplicitIntent: differenceCounts[DIFFERENCE_TYPES.SERVICE_CHANGED_WITHOUT_EXPLICIT_INTENT] === 0
      }
    },
    samples: {
      criticalMismatches: criticalSamples.slice(0, 20)
    }
  };
  report.phase6B.canProceed = Object.values(report.phase6B.criteria).every(Boolean);
  return report;
}

function parseJsonObjectFromLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

export function extractShadowComparisonsFromText(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return [];

  const parsedWhole = parseJsonObjectFromLine(trimmed);
  if (Array.isArray(parsedWhole)) {
    return parsedWhole
      .filter((entry) => isObject(entry))
      .filter((entry) => entry.message === LOG_MESSAGE || entry.oldEngineResponse || entry.comparison)
      .map((entry) => entry.message === LOG_MESSAGE ? entry : normalizeComparison(entry));
  }
  if (isObject(parsedWhole) && (parsedWhole.message === LOG_MESSAGE || parsedWhole.oldEngineResponse || parsedWhole.comparison)) {
    return [parsedWhole];
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => parseJsonObjectFromLine(line.trim()))
    .filter((entry) => isObject(entry))
    .filter((entry) => entry.message === LOG_MESSAGE || entry.oldEngineResponse || entry.comparison);
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
  const candidates = [
    ...(await collectFilesFromDirectory(path.join(cwd, 'logs'))),
    ...(await collectFilesFromDirectory(cwd))
  ];
  return [...new Set(candidates)];
}

async function readComparisonsFromFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return extractShadowComparisonsFromText(text);
}

export async function loadShadowComparisons({ inputPaths = [] } = {}) {
  const paths = inputPaths.length ? inputPaths : await defaultInputFiles();
  const comparisons = [];
  for (const inputPath of paths) {
    if (!await pathExists(inputPath)) continue;
    const stats = await fs.stat(inputPath);
    if (stats.isDirectory()) {
      const files = await collectFilesFromDirectory(inputPath);
      for (const file of files) comparisons.push(...await readComparisonsFromFile(file));
      continue;
    }
    comparisons.push(...await readComparisonsFromFile(inputPath));
  }
  return comparisons;
}

function parseArgs(argv) {
  const inputPaths = [];
  let outputPath = process.env.UNIFIED_SHADOW_REPORT_PATH || DEFAULT_REPORT_PATH;
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

export async function runShadowEvaluatorCli(argv = process.argv.slice(2)) {
  const { inputPaths, outputPath } = parseArgs(argv);
  const comparisons = await loadShadowComparisons({ inputPaths });
  const report = evaluateShadowComparisons(comparisons);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    event: 'unified_shadow_evaluation_completed',
    outputPath,
    totalComparisons: report.totalComparisons,
    criticalMismatchCount: report.criticalMismatchCount,
    canProceedToPhase6B: report.phase6B.canProceed
  }));
  return report;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runShadowEvaluatorCli().catch((error) => {
    console.error(JSON.stringify({
      event: 'unified_shadow_evaluation_failed',
      error: {
        name: error?.name,
        message: error?.message
      }
    }));
    process.exitCode = 1;
  });
}
