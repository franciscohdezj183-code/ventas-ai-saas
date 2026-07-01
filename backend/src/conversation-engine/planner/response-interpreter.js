import { normalizeForNcie } from '../message-normalizer.js';
import { activeFlow, waitingFieldFromMissing } from './commercial-state.schema.js';
import {
  detectDesignPreference,
  detectInstallationPreference,
  detectWebType
} from './missing-information.detector.js';
import { parseDimensions } from './dimensions.parser.js';

const AMBIGUOUS_CONFIRMATIONS = new Set(['si', 'no', 'tal vez', 'depende']);
const POSITIVE_CONFIRMATIONS = new Set(['si', 'claro', 'por favor', 'adelante']);
const NEGATIVE_CONFIRMATIONS = new Set(['no', 'todavia no', 'aun no', 'por ahora no']);

export function currentWaitingField(plannerState = null) {
  const flow = activeFlow(plannerState);
  return flow?.waitingField ?? plannerState?.waitingField ?? waitingFieldFromMissing(flow?.missing ?? plannerState?.missingEntities ?? []);
}

function numericQuantity(text) {
  const match = text.match(/^\s*(\d+)\s*(?:piezas|pzs|unidades|uds)?\s*$/);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function dimensionsFromText(rawText, text, existingDimensions = null) {
  const dimensions = parseDimensions(rawText);
  const existingLength = Number(existingDimensions?.length ?? existingDimensions?.width ?? existingDimensions?.ancho);
  if (
    dimensions?.incomplete &&
    existingDimensions?.incomplete &&
    Number.isFinite(existingLength) &&
    existingLength > 0 &&
    /\b(alto|altura|de alto)\b/.test(text)
  ) {
    const height = Number(dimensions.length ?? dimensions.height ?? dimensions.alto);
    if (Number.isFinite(height) && height > 0) {
      return {
        width: existingLength,
        height,
        area: Number((existingLength * height).toFixed(2)),
        unit: 'm',
        text: `${existingLength} x ${height} m`
      };
    }
  }
  if (dimensions) return dimensions;

  const linearMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(metros?|m)\b/);
  if (!linearMatch) return null;

  const length = Number(linearMatch[1].replace(',', '.'));
  if (!Number.isFinite(length) || length <= 0) return null;
  if (
    existingDimensions?.incomplete &&
    Number.isFinite(existingLength) &&
    existingLength > 0 &&
    /\b(alto|altura|de alto)\b/.test(text)
  ) {
    return {
      width: existingLength,
      height: length,
      area: Number((existingLength * length).toFixed(2)),
      unit: 'm',
      text: `${existingLength} x ${length} m`
    };
  }

  return {
    length,
    unit: 'm',
    text: `${linearMatch[1]} metros`
  };
}

function budgetFromText(text) {
  const match = text.match(/\$?\s*(\d{2,7}(?:[.,]\d{1,2})?)\s*(?:pesos|mxn)?\b/);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function materialFromText(text) {
  const match = text.match(/\b(lona|vinil|acrilico|pvc|coroplast|estireno|aluminio|madera)\b/);
  return match?.[1] ?? null;
}

function finishFromText(text) {
  const match = text.match(/\b(mate|brillante|satinado|laminado|barniz|uv)\b/);
  return match?.[1] ?? null;
}

function isAmbiguousChoice({ text, waitingField, pendingOptions = [] }) {
  return AMBIGUOUS_CONFIRMATIONS.has(text) &&
    !['design', 'installation', 'advisor_confirmation'].includes(waitingField) &&
    pendingOptions.length > 1;
}

function catalogSelectionFromText(text, pendingOptions = []) {
  const options = (pendingOptions ?? []).filter((option) => option && typeof option === 'object');
  if (options.length === 0) return null;

  const numeric = text.match(/^\s*(\d{1,3})\s*$/);
  if (numeric) {
    const index = Number(numeric[1]) - 1;
    const item = options[index] ?? null;
    if (!item) return null;
    return item.tipo === 'producto' || item.stock !== undefined
      ? { selectedProduct: item }
      : { selectedService: item };
  }

  const textTokens = normalizeForNcie(text)
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (textTokens.length === 0) return null;

  const scored = options
    .map((item) => {
      const haystack = normalizeForNcie(`${item.nombre ?? ''} ${item.categoria ?? ''}`);
      const score = textTokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!scored[0]) return null;
  const item = scored[0].item;
  return item.tipo === 'producto' || item.stock !== undefined
    ? { selectedProduct: item }
    : { selectedService: item };
}

export function interpretResponseForWaitingField({
  waitingField,
  normalizedMessage,
  plannerState = null,
  pendingOptions = []
} = {}) {
  const rawText = normalizedMessage?.original ?? normalizedMessage?.raw ?? normalizedMessage?.normalized ?? '';
  const text = normalizeForNcie(rawText);
  if (!waitingField || !text) return { handled: false, entities: {}, confidence: 0 };

  if (isAmbiguousChoice({ text, waitingField, pendingOptions })) {
    return {
      handled: true,
      ambiguous: true,
      waitingField,
      entities: {},
      confidence: 0.2,
      reason: 'ambiguous_short_answer_with_multiple_options'
    };
  }

  if (waitingField === 'quantity') {
    const quantity = numericQuantity(text);
    if (quantity !== null) return { handled: true, waitingField, entities: { quantity }, confidence: 0.98 };
  }

  if (waitingField === 'catalog_selection') {
    const selection = catalogSelectionFromText(text, pendingOptions);
    if (selection) return { handled: true, waitingField, entities: { catalogSelection: selection }, confidence: 0.94 };
    if (AMBIGUOUS_CONFIRMATIONS.has(text)) {
      return {
        handled: true,
        ambiguous: true,
        waitingField,
        entities: {},
        confidence: 0.2,
        reason: 'catalog_confirmation_without_selection'
      };
    }
  }

  if (waitingField === 'dimensions') {
    const flow = activeFlow(plannerState);
    const dimensions = dimensionsFromText(rawText, text, flow?.entities?.dimensions ?? null);
    if (dimensions) return { handled: true, waitingField, entities: { dimensions }, confidence: 0.95 };
  }

  if (waitingField === 'budget') {
    const budget = budgetFromText(text);
    if (budget !== null) return { handled: true, waitingField, entities: { budget }, confidence: 0.95 };
  }

  if (waitingField === 'design') {
    const design = detectDesignPreference(text);
    if (design !== null) {
      return {
        handled: true,
        waitingField,
        entities: { design, designSupport: design },
        confidence: 0.95
      };
    }
    if (text === 'si') return { handled: true, waitingField, entities: { design: true, designSupport: true }, confidence: 0.9 };
    if (text === 'no') return { handled: true, waitingField, entities: { design: false, designSupport: false }, confidence: 0.9 };
  }

  if (waitingField === 'installation') {
    const installation = detectInstallationPreference(text);
    if (installation !== null) return { handled: true, waitingField, entities: { installation }, confidence: 0.95 };
    if (text === 'instalacion') return { handled: true, waitingField, entities: { installation: true }, confidence: 0.9 };
    if (text === 'si') return { handled: true, waitingField, entities: { installation: true }, confidence: 0.9 };
    if (text === 'no') return { handled: true, waitingField, entities: { installation: false }, confidence: 0.9 };
  }

  if (waitingField === 'advisor_confirmation') {
    const installation = detectInstallationPreference(text);
    if (installation === false) return { handled: true, waitingField, entities: { installation: false }, confidence: 0.95 };
    if (POSITIVE_CONFIRMATIONS.has(text)) {
      return {
        handled: true,
        waitingField,
        entities: { advisorConfirmation: true, handoffRequested: true },
        confidence: 0.98
      };
    }
    if (NEGATIVE_CONFIRMATIONS.has(text)) {
      return {
        handled: true,
        waitingField,
        entities: { advisorConfirmation: false },
        confidence: 0.98
      };
    }
  }

  if (waitingField === 'webType') {
    const webType = detectWebType(text);
    if (webType) return { handled: true, waitingField, entities: { webType }, confidence: 0.92 };
  }

  if (waitingField === 'finish') {
    const finish = finishFromText(text);
    if (finish) return { handled: true, waitingField, entities: { finish }, confidence: 0.9 };
  }

  if (waitingField === 'material') {
    const material = materialFromText(text);
    if (material) return { handled: true, waitingField, entities: { material }, confidence: 0.9 };
  }

  return { handled: false, waitingField, entities: {}, confidence: 0 };
}
