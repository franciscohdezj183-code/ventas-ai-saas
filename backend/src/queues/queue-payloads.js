import { randomUUID } from 'node:crypto';
import { createHttpError } from '../utils/http-error.js';

export const WHATSAPP_COMMANDS = ['START_SESSION', 'DISCONNECT_SESSION', 'RESTART_SESSION', 'GET_STATUS'];
export const WHATSAPP_INBOUND_MESSAGE_TYPES = ['text', 'image', 'audio', 'video', 'document', 'unknown'];
export const WHATSAPP_OUTBOUND_TYPES = ['text', 'image', 'media'];
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_TEXT_LENGTH = 8000;

export class QueuePayloadValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QueuePayloadValidationError';
    this.code = 'QUEUE_PAYLOAD_INVALID';
    this.statusCode = 400;
  }
}

function validationError(message) {
  return new QueuePayloadValidationError(message);
}

function assertPlainSerializable(value, path = 'payload', seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw validationError(`${path} must be JSON serializable`);
  }

  if (Buffer.isBuffer(value)) {
    throw validationError(`${path} must not contain Buffer values`);
  }

  if (typeof value !== 'object') {
    return;
  }

  if (seen.has(value)) {
    throw validationError(`${path} must not contain circular references`);
  }

  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPlainSerializable(item, `${path}[${index}]`, seen));
    return;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw validationError(`${path} must contain plain objects only`);
  }

  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw validationError(`${path} contains unsafe key "${key}"`);
    }

    assertPlainSerializable(value[key], `${path}.${key}`, seen);
  }
}

function requirePositiveInteger(value, fieldName) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw validationError(`${fieldName} must be a positive integer`);
  }

  return numberValue;
}

function requireNonEmptyString(value, fieldName, { maxLength = 255 } = {}) {
  const stringValue = String(value ?? '').trim();

  if (!stringValue) {
    throw validationError(`${fieldName} is required`);
  }

  if (stringValue.length > maxLength) {
    throw validationError(`${fieldName} is too long`);
  }

  return stringValue;
}

function optionalString(value, fieldName, { maxLength = 255 } = {}) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return requireNonEmptyString(value, fieldName, { maxLength });
}

function requireDate(value, fieldName) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    throw validationError(`${fieldName} must be a valid date`);
  }

  return date.toISOString();
}

function optionalObject(value, fieldName) {
  const objectValue = value ?? {};
  assertPlainSerializable(objectValue, fieldName);
  return objectValue;
}

export function validateWhatsappCommandJob(payload = {}) {
  assertPlainSerializable(payload, 'WhatsAppCommandJob');
  const command = requireNonEmptyString(payload.command, 'command');

  if (!WHATSAPP_COMMANDS.includes(command)) {
    throw validationError(`command must be one of: ${WHATSAPP_COMMANDS.join(', ')}`);
  }

  return {
    jobId: optionalString(payload.jobId, 'jobId') ?? `whatsapp-command:${command}:${payload.empresaId}`,
    command,
    empresaId: requirePositiveInteger(payload.empresaId, 'empresaId'),
    requestedAt: requireDate(payload.requestedAt ?? new Date().toISOString(), 'requestedAt'),
    requestedBy: optionalString(payload.requestedBy, 'requestedBy'),
    payload: optionalObject(payload.payload, 'payload')
  };
}

export function validateWhatsappInboundJob(payload = {}) {
  assertPlainSerializable(payload, 'WhatsAppInboundJob');
  const messageType = optionalString(payload.messageType, 'messageType') ?? 'unknown';

  if (!WHATSAPP_INBOUND_MESSAGE_TYPES.includes(messageType)) {
    throw validationError(`messageType must be one of: ${WHATSAPP_INBOUND_MESSAGE_TYPES.join(', ')}`);
  }

  return {
    eventId: optionalString(payload.eventId, 'eventId') ?? randomUUID(),
    empresaId: requirePositiveInteger(payload.empresaId, 'empresaId'),
    whatsappChatId: requireNonEmptyString(payload.whatsappChatId, 'whatsappChatId'),
    phone: optionalString(payload.phone, 'phone'),
    messageId: requireNonEmptyString(payload.messageId, 'messageId'),
    messageType,
    body: optionalString(payload.body, 'body', { maxLength: MAX_TEXT_LENGTH }),
    receivedAt: requireDate(payload.receivedAt ?? new Date().toISOString(), 'receivedAt'),
    metadata: optionalObject(payload.metadata, 'metadata')
  };
}

export function validateWhatsappOutboundJob(payload = {}) {
  assertPlainSerializable(payload, 'WhatsAppOutboundJob');
  const type = optionalString(payload.type, 'type') ?? 'text';

  if (!WHATSAPP_OUTBOUND_TYPES.includes(type)) {
    throw validationError(`type must be one of: ${WHATSAPP_OUTBOUND_TYPES.join(', ')}`);
  }

  return {
    messageId: optionalString(payload.messageId, 'messageId') ?? randomUUID(),
    empresaId: requirePositiveInteger(payload.empresaId, 'empresaId'),
    whatsappChatId: optionalString(payload.whatsappChatId, 'whatsappChatId'),
    phone: optionalString(payload.phone, 'phone'),
    type,
    text: optionalString(payload.text, 'text', { maxLength: MAX_TEXT_LENGTH }),
    media: payload.media === undefined ? null : optionalObject(payload.media, 'media'),
    createdAt: requireDate(payload.createdAt ?? new Date().toISOString(), 'createdAt'),
    correlationId: optionalString(payload.correlationId, 'correlationId')
  };
}

export function createQueueDisabledError(queueName) {
  const error = createHttpError(503, `Queue "${queueName}" is disabled`);
  error.code = 'QUEUE_DISABLED';
  return error;
}
