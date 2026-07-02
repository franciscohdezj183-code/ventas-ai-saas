import { normalizeForNcie } from '../message-normalizer.js';

function toNumber(value) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeUnit(unit = '') {
  const normalized = normalizeForNcie(unit);
  if (/\b(cm|centimetro|centimetros)\b/.test(normalized)) return 'cm';
  if (/\b(m|metro|metros)\b/.test(normalized)) return 'm';
  return null;
}

function convertToMeters(value, unit) {
  if (!Number.isFinite(value)) return null;
  return unit === 'cm' ? value / 100 : value;
}

function round(value, decimals = 4) {
  return Number(Number(value).toFixed(decimals));
}

function dimensionsResult({ width, height, widthUnit = null, heightUnit = null, text }) {
  const resolvedWidthUnit = widthUnit ?? heightUnit ?? null;
  const resolvedHeightUnit = heightUnit ?? widthUnit ?? null;
  const widthMeters = convertToMeters(width, resolvedWidthUnit);
  const heightMeters = convertToMeters(height, resolvedHeightUnit);
  if (!widthMeters || !heightMeters) return null;

  return {
    width: round(widthMeters),
    height: round(heightMeters),
    ancho: round(widthMeters),
    alto: round(heightMeters),
    area: round(widthMeters * heightMeters),
    unit: 'm',
    originalUnit: resolvedWidthUnit === 'cm' || resolvedHeightUnit === 'cm' ? 'cm' : 'm',
    text
  };
}

export function parseDimensions(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const text = normalizeForNcie(raw);
  const normalizedDecimalPair = text.match(/\b0\s+(\d{1,3})\s*(?:x|por|\*)\s*(\d+)\s+(\d{1,3})\s*(cm|centimetros?|m|metros?)?\b/i);
  if (normalizedDecimalPair) {
    const first = toNumber(`0.${normalizedDecimalPair[1]}`);
    const second = toNumber(`${normalizedDecimalPair[2]}.${normalizedDecimalPair[3]}`);
    if (!first || !second) return null;
    const unit = normalizeUnit(normalizedDecimalPair[4]) ?? 'm';
    return dimensionsResult({
      width: first,
      height: second,
      widthUnit: unit,
      heightUnit: unit,
      text: `0.${normalizedDecimalPair[1]} x ${normalizedDecimalPair[2]}.${normalizedDecimalPair[3]} ${unit}`
    });
  }

  const pair = raw.match(/(\d+(?:[.,]\d+)?|\.\d+)\s*(cm|centimetros?|m|metros?)?\s*(?:x|×|por|\*)\s*(\d+(?:[.,]\d+)?|\.\d+)\s*(cm|centimetros?|m|metros?)?/i);
  if (pair) {
    const first = toNumber(pair[1]);
    const second = toNumber(pair[3]);
    if (!first || !second) return null;
    const firstUnit = normalizeUnit(pair[2]);
    const secondUnit = normalizeUnit(pair[4]);
    const inferredUnit = firstUnit ?? secondUnit ?? null;
    return dimensionsResult({
      width: first,
      height: second,
      widthUnit: inferredUnit,
      heightUnit: inferredUnit,
      text: `${pair[1]} x ${pair[3]}${inferredUnit ? ` ${inferredUnit}` : ' m'}`
    });
  }

  const numbers = [...raw.matchAll(/(\d+(?:[.,]\d+)?|\.\d+)\s*(cm|centimetros?|m|metros?)/gi)];
  if (numbers.length >= 2 && /\b(por|x)\b|×|\*/i.test(raw)) {
    const first = toNumber(numbers[0][1]);
    const second = toNumber(numbers[1][1]);
    if (!first || !second) return null;
    const firstUnit = normalizeUnit(numbers[0][2]);
    const secondUnit = normalizeUnit(numbers[1][2]);
    return dimensionsResult({
      width: first,
      height: second,
      widthUnit: firstUnit,
      heightUnit: secondUnit,
      text: `${numbers[0][1]} x ${numbers[1][1]} ${secondUnit ?? firstUnit ?? 'm'}`
    });
  }

  const linear = raw.match(/(?:de\s*)?(\d+(?:[.,]\d+)?|\.\d+)\s*(cm|centimetros?|m|metros?)\b/i);
  if (linear) {
    const length = toNumber(linear[1]);
    const unit = normalizeUnit(linear[2]) ?? 'm';
    if (!length) return null;
    return {
      length: round(convertToMeters(length, unit)),
      unit: 'm',
      originalUnit: unit,
      incomplete: true,
      missing: 'height',
      text: `${linear[1]} ${unit}`
    };
  }

  if (/^\d+(?:[.,]\d+)?$/.test(text)) {
    const length = toNumber(text);
    if (!length) return null;
    return {
      length,
      unit: 'm',
      incomplete: true,
      missing: 'height',
      text: `${text} m`
    };
  }

  return null;
}
