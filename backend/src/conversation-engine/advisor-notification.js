import { createHash } from 'node:crypto';
import { NCIE_ACTIONS } from './conversation-engine.types.js';

function money(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function textFromMessage(normalizedMessage = null) {
  return String(
    normalizedMessage?.original
      ?? normalizedMessage?.raw
      ?? normalizedMessage?.normalized
      ?? normalizedMessage
      ?? ''
  ).trim();
}

function selectedServiceFrom({ plannerDecision, responsePlan, state }) {
  return plannerDecision?.selectedServiceItem
    ?? responsePlan?.selected
    ?? plannerDecision?.selectedService
    ?? state?.lastService
    ?? null;
}

function activeFlowFrom(plannerDecision) {
  return plannerDecision?.activeFlow
    ?? (plannerDecision?.stateUpdatePreview?.activeFlowId
      ? (plannerDecision.stateUpdatePreview.flows ?? []).find((flow) => flow.id === plannerDecision.stateUpdatePreview.activeFlowId)
      : null)
    ?? null;
}

function quoteContextFrom({ plannerDecision, responsePlan, state }) {
  const flow = activeFlowFrom(plannerDecision);
  return responsePlan?.quoteContext
    ?? flow?.quotationDraft
    ?? state?.commercial?.lastQuoteContext
    ?? null;
}

function entityValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? null;
}

function dimensionText(dimensions = null) {
  if (!dimensions) return null;
  if (dimensions.text) return dimensions.text;
  const width = dimensions.width ?? dimensions.ancho;
  const height = dimensions.height ?? dimensions.alto;
  if (width && height) return `${width}x${height}`;
  return null;
}

function designStatus(value) {
  if (value === false) return 'ya tiene diseno';
  if (value === true) return 'requiere o incluye diseno';
  return 'pendiente';
}

function installationStatus(value) {
  if (value === true) return 'pendiente con asesor';
  if (value === false) return 'solo impresion / sin instalacion';
  return 'pendiente';
}

function compactDesignStatus(value) {
  if (value === false) return 'ya tiene';
  if (value === true) return 'requiere apoyo';
  return 'pendiente';
}

function compactInstallationStatus(value) {
  if (value === true) return 'revisar';
  if (value === false) return 'no';
  return 'pendiente';
}

function notificationText(payload) {
  return [
    'Nueva solicitud de cliente',
    '',
    `Cliente: ${payload.customer}`,
    `Servicio: ${payload.selectedService ?? 'pendiente'}`,
    `Categoria: ${payload.selectedCategory ?? 'pendiente'}`,
    `Medidas/cantidad: ${payload.dimensionsOrQuantity ?? 'pendiente'}`,
    `Diseno: ${payload.designStatus ?? 'pendiente'}`,
    `Instalacion: ${payload.installationStatus ?? 'pendiente'}`,
    `Objetivo: ${payload.objective ?? 'pendiente'}`,
    `Presupuesto: ${payload.budget ?? 'pendiente'}`,
    `Estimado: ${payload.currentEstimate ?? 'pendiente'}`,
    `Mensaje original: ${payload.lastUserMessage ?? ''}`,
    '',
    'Accion sugerida:',
    'Contactar al cliente para confirmar detalles, tiempos y precio final.'
  ].join('\n');
}

function compactSummary(payload) {
  return [
    payload.selectedService ? `Servicio ${payload.selectedService}` : null,
    payload.dimensionsOrQuantity ? `medidas/cantidad ${payload.dimensionsOrQuantity}` : null,
    payload.designStatus && payload.designStatus !== 'pendiente' ? `diseno ${payload.designStatus}` : null,
    payload.installationStatus && payload.installationStatus !== 'pendiente' ? `instalacion ${payload.installationStatus}` : null,
    payload.budget ? `presupuesto ${payload.budget}` : null,
    payload.currentEstimate ? `estimado ${payload.currentEstimate}` : null
  ].filter(Boolean).join(', ');
}

function handoffSummary(payload) {
  const summary = compactSummary(payload) || 'Cliente solicita seguimiento comercial';
  return [
    `Solicitud: cotizacion`,
    `Cliente: ${payload.customer}`,
    payload.phone ? `Telefono: ${payload.phone}` : null,
    `Resumen: ${summary}`,
    `Mensaje: ${payload.lastUserMessage ?? ''}`
  ].filter(Boolean).join(' | ');
}

export function buildAdvisorNotificationPayload({
  phone,
  conversationId = null,
  contactName = null,
  normalizedMessage = null,
  state = {},
  nlu = {},
  plannerDecision = null,
  responsePlan = null,
  reason
}) {
  const service = selectedServiceFrom({ plannerDecision, responsePlan, state });
  const flow = activeFlowFrom(plannerDecision);
  const quoteContext = quoteContextFrom({ plannerDecision, responsePlan, state });
  const entities = {
    ...(flow?.entities ?? {}),
    ...(plannerDecision?.stateUpdatePreview?.collectedEntities ?? {}),
    ...(nlu?.entities ?? {})
  };
  const estimate = flow?.currentEstimate ?? plannerDecision?.activeFlow?.currentEstimate ?? null;
  const dimensions = quoteContext?.dimensions ?? estimate?.dimensions ?? entities.dimensions ?? null;
  const quantity = entityValue(entities.quantity, entities.cantidad, quoteContext?.quantity);
  const budget = entityValue(entities.budget, state?.collectedData?.budget);
  const objective = entityValue(
    plannerDecision?.detectedMarketingGoal,
    entities.marketingGoal,
    state?.commercial?.customerGoal,
    state?.needSummary
  );
  const design = entityValue(responsePlan?.quoteContext?.designSupport, entities.designSupport, entities.design, state?.commercial?.lastQuoteContext?.design_support);
  const installation = entityValue(responsePlan?.installation, entities.installation, state?.commercial?.lastQuoteContext?.installation);
  const currentEstimate = money(entityValue(responsePlan?.quoteContext?.total, responsePlan?.total, estimate?.total, quoteContext?.total));
  const dimensionsOrQuantity = dimensionText(dimensions) ?? quantity;
  const customer = String(contactName ?? '').trim() || phone;

  const payload = {
    conversationId: conversationId ?? state?.commercial?.plannerState?.conversationId ?? phone ?? null,
    customer,
    phone,
    selectedService: service?.nombre ?? service?.selectedServiceName ?? null,
    selectedServiceId: service?.id ?? service?.selectedServiceId ?? null,
    selectedCategory: service?.categoria ?? service?.selectedCategory ?? state?.commercial?.activeDomain ?? null,
    dimensions: dimensionText(dimensions),
    quantity,
    dimensionsOrQuantity,
    designStatus: designStatus(design),
    ownerDesignStatus: compactDesignStatus(design),
    installationStatus: installationStatus(installation),
    ownerInstallationStatus: compactInstallationStatus(installation),
    objective,
    budget: budget ? String(budget) : null,
    currentEstimate,
    currentEstimateRaw: entityValue(responsePlan?.quoteContext?.total, responsePlan?.total, estimate?.total, quoteContext?.total),
    lastUserMessage: textFromMessage(normalizedMessage),
    reason
  };

  return {
    ...payload,
    message: notificationText(payload),
    handoffSummary: handoffSummary(payload)
  };
}

export function advisorNotificationHash(payload, reason) {
  const relevant = {
    conversationId: payload?.conversationId ?? payload?.phone ?? null,
    reason,
    selectedServiceId: payload?.selectedServiceId ?? null,
    selectedService: payload?.selectedService ?? null,
    dimensions: payload?.dimensions ?? null,
    quantity: payload?.quantity ?? null,
    installationStatus: payload?.installationStatus ?? null,
    budget: payload?.budget ?? null,
    currentEstimateRaw: payload?.currentEstimateRaw ?? null
  };
  return createHash('sha256').update(JSON.stringify(relevant)).digest('hex');
}

export function planAdvisorNotification({
  phone,
  conversationId = null,
  contactName = null,
  normalizedMessage = null,
  state = {},
  nlu = {},
  decision = {},
  plannerDecision = null,
  responsePlan = null
}) {
  const explicitHandoff = decision?.action === NCIE_ACTIONS.ESCALATE_HUMAN || nlu?.intent === 'HABLAR_ASESOR';

  if (!explicitHandoff) {
    return {
      advisorNotificationRequired: false,
      notificationReason: null,
      notificationPayload: null,
      notificationHash: null,
      skippedDuplicate: false
    };
  }

  const reason = 'handoff_explicit';
  const payload = buildAdvisorNotificationPayload({
    phone,
    conversationId,
    contactName,
    normalizedMessage,
    state,
    nlu,
    plannerDecision,
    responsePlan,
    reason
  });
  const hash = advisorNotificationHash(payload, reason);

  return {
    advisorNotificationRequired: true,
    notificationReason: reason,
    notificationPayload: payload,
    notificationHash: hash,
    skippedDuplicate: false
  };
}

export async function executeAdvisorNotification({
  empresaId,
  phone,
  whatsappChatId = null,
  conversationId = null,
  response = null,
  advisorNotification = null,
  handoffManager
}) {
  if (!advisorNotification?.advisorNotificationRequired || !advisorNotification.notificationPayload) {
    return null;
  }

  return handoffManager.request({
    empresa_id: empresaId,
    conversation_id: conversationId,
    telefono_cliente: phone,
    whatsapp_chat_id: whatsappChatId,
    mensaje_cliente: advisorNotification.notificationPayload.lastUserMessage ?? advisorNotification.notificationPayload.message,
    resumen_solicitud: advisorNotification.notificationPayload.handoffSummary ?? advisorNotification.notificationPayload.message,
    owner_notification_payload: advisorNotification.notificationPayload,
    respuesta_bot: advisorNotification.notificationReason === 'handoff_explicit' ? response : null,
    atendido_por_bot: advisorNotification.notificationReason !== 'handoff_explicit',
    motivo: advisorNotification.notificationReason === 'handoff_explicit' ? 'HABLAR_ASESOR' : 'INTENCION_COMPRA'
  });
}
