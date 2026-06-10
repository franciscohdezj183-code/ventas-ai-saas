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

function write(level, message, meta = {}) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'ventas-ai-saas-api',
    ...meta
  };

  if (entry.error instanceof Error) {
    entry.error = serializeError(entry.error);
  }

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
