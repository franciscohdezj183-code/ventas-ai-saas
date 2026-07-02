import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendUtf8JsonLine,
  writeUtf8JsonToStream
} from './utf8-json-output.js';

const SENSITIVE_KEY_PATTERN = /(^|[_-])(authorization|cookie|password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|jwt|qr|code|session)($|[_-])/i;
const SENSITIVE_VALUE_PATTERN = /(bearer\s+)[a-z0-9._~+/=-]+|((?:token|password|secret|api[_-]?key|code)=)[^&\s]+|(sk-(?:proj-)?)[a-z0-9_-]{12,}/gi;
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_UNIFIED_CANARY_LOG_PATH = path.resolve(BACKEND_ROOT, 'logs', 'unified-canary.jsonl');

function unifiedCanaryLogPath() {
  return process.env.UNIFIED_CANARY_LOG_PATH
    ? path.resolve(process.env.UNIFIED_CANARY_LOG_PATH)
    : DEFAULT_UNIFIED_CANARY_LOG_PATH;
}

function serializeError(error) {
  if (!error) {
    return undefined;
  }

  return {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
    code: error.code,
    statusCode: error.statusCode
  };
}

function redactString(value) {
  return value.replace(SENSITIVE_VALUE_PATTERN, (match, bearerPrefix, keyPrefix, openAIPrefix) => {
    if (bearerPrefix) {
      return `${bearerPrefix}[REDACTED]`;
    }

    if (keyPrefix) {
      return `${keyPrefix}[REDACTED]`;
    }

    return `${openAIPrefix}[REDACTED]`;
  });
}

function sanitizeForLog(value, key = '', seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (SENSITIVE_KEY_PATTERN.test(String(key))) {
    return '[REDACTED]';
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, key, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeForLog(entryValue, entryKey, seen)
    ])
  );
}

function write(level, message, meta = {}) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'ventas-ai-saas-api',
    ...sanitizeForLog(meta)
  };

  writeUnifiedCanaryLog(message, entry);

  if (level === 'error') {
    writeUtf8JsonToStream(process.stderr, entry);
    return;
  }

  writeUtf8JsonToStream(process.stdout, entry);
}

function writeUnifiedCanaryLog(message, entry) {
  if (!String(message ?? '').startsWith('unified_canary_')) return;
  try {
    const logPath = unifiedCanaryLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    appendUtf8JsonLine(logPath, entry);
  } catch {
    // Logging must never break the request path.
  }
}

export const logger = {
  info(message, meta) {
    write('info', message, meta);
  },
  warn(message, meta) {
    write('warn', message, meta);
  },
  error(message, meta) {
    write('error', message, meta);
  }
};
