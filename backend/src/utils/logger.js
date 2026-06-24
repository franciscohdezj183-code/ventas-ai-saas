const SENSITIVE_KEY_PATTERN = /(^|[_-])(authorization|cookie|password|passwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token|jwt|qr|code|session)($|[_-])/i;
const SENSITIVE_VALUE_PATTERN = /(bearer\s+)[a-z0-9._~+/=-]+|((?:token|password|secret|api[_-]?key|code)=)[^&\s]+|(sk-(?:proj-)?)[a-z0-9_-]{12,}/gi;

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

  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
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
