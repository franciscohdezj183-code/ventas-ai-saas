import OpenAI from 'openai';
import { env } from '../config/env.js';

const healthState = {
  configured: Boolean(env.openai.apiKey),
  validated: false,
  status: env.openai.apiKey ? 'unknown' : 'missing_key',
  lastCheckedAt: null,
  lastError: null,
  lastErrorCode: null,
  lastErrorType: null
};

function sanitizedMessage(status) {
  const messages = {
    invalid_api_key: 'La clave de OpenAI fue rechazada. Se requiere una clave activa y reiniciar el proceso.',
    forbidden: 'OpenAI rechazo el acceso para esta cuenta o proyecto.',
    rate_limited: 'OpenAI limito temporalmente las solicitudes.',
    timeout: 'OpenAI no respondio dentro del tiempo configurado.',
    server_error: 'OpenAI presento un error temporal de servidor.',
    network_error: 'El servidor no pudo conectarse con OpenAI.',
    model_error: 'El modelo configurado de OpenAI no esta disponible para esta cuenta o proyecto.',
    request_error: 'OpenAI rechazo la solicitud enviada por la aplicacion.',
    unknown_error: 'No fue posible validar la conexion con OpenAI.'
  };

  return messages[status] ?? null;
}

function safeString(value, maxLength = 120) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.replace(/sk-(?:proj-)?[a-z0-9_-]{12,}/gi, 'sk-[REDACTED]').slice(0, maxLength);
}

export function classifyOpenAIError(error) {
  const httpStatus = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? 0) || null;
  const errorCode = safeString(error?.code ?? error?.error?.code);
  const errorType = safeString(error?.type ?? error?.error?.type);
  const code = String(errorCode ?? '').toLowerCase();
  const type = String(errorType ?? '').toLowerCase();
  const name = String(error?.name ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  let status = 'unknown_error';
  let retryable = false;

  if (httpStatus === 401 || code === 'invalid_api_key') {
    status = 'invalid_api_key';
  } else if (httpStatus === 403) {
    status = 'forbidden';
  } else if (httpStatus === 429 || code === 'rate_limit_exceeded') {
    status = 'rate_limited';
    retryable = true;
  } else if (
    code === 'insufficient_quota'
    || type === 'insufficient_quota'
    || message.includes('insufficient quota')
    || message.includes('exceeded your current quota')
  ) {
    status = 'rate_limited';
    retryable = false;
  } else if (
    code === 'etimedout'
    || code === 'econnaborted'
    || code === 'und_err_connect_timeout'
    || name.includes('timeout')
    || message.includes('timeout')
    || message.includes('timed out')
  ) {
    status = 'timeout';
    retryable = true;
  } else if (
    ['enotfound', 'eai_again', 'econnreset', 'econnrefused', 'network_error'].includes(code)
    || message.includes('fetch failed')
    || message.includes('network')
    || message.includes('getaddrinfo')
  ) {
    status = 'network_error';
    retryable = true;
  } else if (
    code === 'model_not_found'
    || (message.includes('model')
      && (message.includes('does not exist') || message.includes('do not have access') || message.includes('not found')))
  ) {
    status = 'model_error';
  } else if (httpStatus === 400 || httpStatus === 404) {
    status = 'request_error';
  } else if (httpStatus && httpStatus >= 500) {
    status = 'server_error';
    retryable = true;
  }

  return {
    status,
    httpStatus,
    errorCode,
    errorType,
    errorName: safeString(error?.name, 80),
    retryable,
    message: sanitizedMessage(status)
  };
}

export function getOpenAIHealthSnapshot() {
  const configured = Boolean(env.openai.apiKey);

  if (!configured) {
    return {
      configured: false,
      validated: false,
      status: 'missing_key',
      lastCheckedAt: healthState.lastCheckedAt,
      lastError: null,
      lastErrorCode: null,
      lastErrorType: null
    };
  }

  return {
    ...healthState,
    configured: true
  };
}

export function recordOpenAIError(error) {
  const classified = classifyOpenAIError(error);
  healthState.configured = Boolean(env.openai.apiKey);
  healthState.validated = false;
  healthState.status = classified.status;
  healthState.lastCheckedAt = new Date().toISOString();
  healthState.lastError = classified.message;
  healthState.lastErrorCode = classified.errorCode;
  healthState.lastErrorType = classified.errorType;
  return classified;
}

export function recordOpenAISuccess() {
  healthState.configured = Boolean(env.openai.apiKey);
  healthState.validated = healthState.configured;
  healthState.status = healthState.configured ? 'ok' : 'missing_key';
  healthState.lastCheckedAt = new Date().toISOString();
  healthState.lastError = null;
  healthState.lastErrorCode = null;
  healthState.lastErrorType = null;
  return getOpenAIHealthSnapshot();
}

export async function validateOpenAIKey({
  client = null
} = {}) {
  if (!env.openai.apiKey) {
    healthState.configured = false;
    healthState.validated = false;
    healthState.status = 'missing_key';
    healthState.lastCheckedAt = new Date().toISOString();
    healthState.lastError = null;
    healthState.lastErrorCode = null;
    healthState.lastErrorType = null;
    return getOpenAIHealthSnapshot();
  }

  const openai = client ?? new OpenAI({
    apiKey: env.openai.apiKey,
    timeout: env.openai.timeoutMs,
    maxRetries: 0
  });

  try {
    await openai.models.list();
    return recordOpenAISuccess();
  } catch (error) {
    recordOpenAIError(error);
    return getOpenAIHealthSnapshot();
  }
}

export function resetOpenAIHealthForTests() {
  healthState.configured = Boolean(env.openai.apiKey);
  healthState.validated = false;
  healthState.status = env.openai.apiKey ? 'unknown' : 'missing_key';
  healthState.lastCheckedAt = null;
  healthState.lastError = null;
  healthState.lastErrorCode = null;
  healthState.lastErrorType = null;
}
