import { classifyOpenAIError } from '../ai/openai-health.service.js';

function cleanString(value, maxLength = 2000) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.replace(/sk-(?:proj-)?[a-z0-9_-]{12,}/gi, 'sk-[REDACTED]').slice(0, maxLength);
}

export function isMysqlError(error) {
  const code = String(error?.code ?? '');
  return Boolean(
    code.startsWith('ER_') ||
    error?.sqlState ||
    error?.sqlMessage ||
    error?.sql
  );
}

function isValidationError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  return status === 400 || error?.name === 'ValidationError';
}

function isWhatsAppError(error) {
  const name = String(error?.name ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  return (
    name.includes('whatsapp') ||
    message.includes('whatsapp') ||
    message.includes('puppeteer') ||
    message.includes('target closed') ||
    message.includes('client.initialize')
  );
}

export function classifyAppError(error) {
  if (isMysqlError(error)) {
    return {
      category: 'mysql',
      status: 'mysql_error',
      retryable: false,
      safeMessage: 'Tuvimos un problema tecnico al procesar tu mensaje. Ya quedo registrado para revision.',
      mysql: {
        errorCode: cleanString(error?.code, 120),
        errno: error?.errno ?? null,
        sqlState: cleanString(error?.sqlState, 120),
        sqlMessage: cleanString(error?.sqlMessage ?? error?.message, 1000),
        sql: cleanString(error?.sql, 4000),
        stack: cleanString(error?.stack, 4000)
      }
    };
  }

  const openai = classifyOpenAIError(error);
  const hasOpenAIShape = Boolean(openai.httpStatus || openai.errorCode || openai.errorType);

  if (hasOpenAIShape) {
    return {
      category: 'openai',
      status: openai.status,
      retryable: openai.retryable,
      safeMessage: openai.message ?? 'Tuvimos un problema temporal con la respuesta automatica.',
      openai
    };
  }

  if (isWhatsAppError(error)) {
    return {
      category: 'whatsapp',
      status: 'whatsapp_error',
      retryable: true,
      safeMessage: 'Tuvimos un problema tecnico al procesar tu mensaje. Ya quedo registrado para revision.'
    };
  }

  if (isValidationError(error)) {
    return {
      category: 'validation',
      status: 'validation_error',
      retryable: false,
      safeMessage: 'No pude procesar ese mensaje. Puedes intentarlo de nuevo con mas detalle.'
    };
  }

  return {
    category: 'internal',
    status: 'internal_error',
    retryable: false,
    safeMessage: 'Tuvimos un problema tecnico al procesar tu mensaje. Ya quedo registrado para revision.'
  };
}
