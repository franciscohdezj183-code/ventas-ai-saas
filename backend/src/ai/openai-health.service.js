import OpenAI from 'openai';
import { env } from '../config/env.js';

const healthState = {
  configured: Boolean(env.openai.apiKey),
  validated: false,
  status: env.openai.apiKey ? 'unknown' : 'missing_key',
  lastCheckedAt: null,
  lastError: null
};

function sanitizedMessage(status) {
  const messages = {
    invalid_api_key: 'La clave de OpenAI fue rechazada. Se requiere una clave activa y reiniciar el proceso.',
    forbidden: 'OpenAI rechazó el acceso para esta cuenta o proyecto.',
    rate_limited: 'OpenAI limitó temporalmente las solicitudes.',
    timeout: 'OpenAI no respondió dentro del tiempo configurado.',
    server_error: 'OpenAI presentó un error temporal de servidor.',
    unknown_error: 'No fue posible validar la conexión con OpenAI.'
  };

  return messages[status] ?? null;
}

export function classifyOpenAIError(error) {
  const httpStatus = Number(error?.status ?? error?.statusCode ?? 0) || null;
  const code = String(error?.code ?? '').toLowerCase();
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
    code === 'etimedout'
    || code === 'econnaborted'
    || name.includes('timeout')
    || message.includes('timeout')
    || message.includes('timed out')
  ) {
    status = 'timeout';
    retryable = true;
  } else if (httpStatus && httpStatus >= 500) {
    status = 'server_error';
    retryable = true;
  }

  return {
    status,
    httpStatus,
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
      lastError: null
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
  return classified;
}

export function recordOpenAISuccess() {
  healthState.configured = Boolean(env.openai.apiKey);
  healthState.validated = healthState.configured;
  healthState.status = healthState.configured ? 'ok' : 'missing_key';
  healthState.lastCheckedAt = new Date().toISOString();
  healthState.lastError = null;
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
}
