import { EXECUTION_ACTIONS } from './conversation-contracts.js';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function ensurePlannerAuthorityPreserved({ before, after }) {
  if (before.nextState !== after.nextState) {
    throw new Error('Executor cannot change planner nextState');
  }
  if (JSON.stringify(before.selectedService ?? null) !== JSON.stringify(after.selectedService ?? null)) {
    throw new Error('Executor cannot change planner selectedService');
  }
}

function hasAction(plan, action) {
  return (plan.actions ?? []).includes(action);
}

async function executeRetrieval({ executionPlan, retrievalAdapter, logs }) {
  const retrievalPlan = executionPlan.retrievalPlan ?? { needed: false };
  if (!retrievalPlan.needed) {
    logs.push({ event: 'executor_retrieval_skipped', reason: 'not_requested' });
    return null;
  }
  if (typeof retrievalAdapter !== 'function') {
    logs.push({ event: 'executor_retrieval_skipped', reason: 'missing_adapter' });
    return null;
  }
  const result = await retrievalAdapter(retrievalPlan);
  logs.push({ event: 'executor_retrieval_executed', queries: retrievalPlan.queries ?? [] });
  return result ?? null;
}

async function executeMcp({ executionPlan, mcpAdapter, logs }) {
  const mcpPlan = executionPlan.mcpPlan ?? { needed: false };
  if (!mcpPlan.needed) {
    logs.push({ event: 'executor_mcp_skipped', reason: 'not_requested' });
    return null;
  }
  if (typeof mcpAdapter !== 'function') {
    logs.push({ event: 'executor_mcp_skipped', reason: 'missing_adapter' });
    return null;
  }
  const result = await mcpAdapter(mcpPlan);
  logs.push({ event: 'executor_mcp_executed', tools: mcpPlan.tools ?? [] });
  return result ?? null;
}

async function executeHandoff({ executionPlan, handoffAdapter, logs }) {
  const handoffPlan = executionPlan.handoffPlan ?? { needed: false };
  if (!handoffPlan.needed && !hasAction(executionPlan, EXECUTION_ACTIONS.CREATE_HANDOFF)) {
    logs.push({ event: 'executor_handoff_skipped', reason: 'not_requested' });
    return [];
  }
  const notification = typeof handoffAdapter === 'function'
    ? await handoffAdapter(handoffPlan)
    : {
      type: 'handoff',
      reason: handoffPlan.reason ?? 'handoff_requested',
      payload: handoffPlan.payload ?? {}
    };
  logs.push({ event: 'executor_handoff_executed', reason: handoffPlan.reason ?? null });
  return [notification];
}

async function executePersistence({ executionPlan, persistenceAdapter, logs }) {
  const plan = executionPlan.persistencePlan ?? { saveState: false };
  const stateToPersist = plan.saveState ? clone(plan.stateAfter ?? executionPlan.stateAfter) : null;
  if (plan.saveState && typeof persistenceAdapter === 'function') {
    await persistenceAdapter({ ...plan, stateAfter: stateToPersist });
    logs.push({ event: 'executor_persistence_executed' });
  } else if (plan.saveState) {
    logs.push({ event: 'executor_persistence_prepared' });
  } else {
    logs.push({ event: 'executor_persistence_skipped', reason: 'not_requested' });
  }
  return stateToPersist;
}

function serviceName(service) {
  return service?.nombre ?? service?.name ?? 'servicio';
}

function linesForServices(services = []) {
  return services.map((service, index) => {
    const category = service?.categoria ? ` - ${service.categoria}` : '';
    const price = Number(service?.precio);
    const priceText = Number.isFinite(price) && price > 0 ? ` desde ${price.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}` : '';
    return `${index + 1}. ${serviceName(service)}${category}${priceText}`;
  });
}

function emojiFor(mode, key) {
  if (mode === 'none') return '';
  const professional = {
    catalog: '📋',
    quote: '✅',
    advisor: '🤝',
    recommendation: '💡',
    summary: '🧾'
  };
  const friendly = {
    catalog: '📋',
    quote: '✅',
    advisor: '🤝',
    recommendation: '💡',
    summary: '🧾'
  };
  if (mode === 'friendly') return `${friendly[key] ?? ''} `;
  return `${professional[key] ?? ''} `;
}

function stripEmojiTokens(text) {
  return String(text ?? '').replace(/\[(catalog|ok|advisor|idea|summary)\]\s*/g, '');
}

function applyEmojiMode(text, mode) {
  if (mode === 'none') return stripEmojiTokens(text);
  if (mode === 'friendly') {
    return String(text ?? '')
      .replace(/\[catalog\]/g, '📋')
      .replace(/\[ok\]/g, '✅')
      .replace(/\[advisor\]/g, '🤝')
      .replace(/\[idea\]/g, '💡')
      .replace(/\[summary\]/g, '🧾');
  }
  return String(text ?? '')
    .replace(/\[catalog\]/g, '📋')
    .replace(/\[ok\]/g, '✅')
    .replace(/\[advisor\]/g, '🤝')
    .replace(/\[idea\]/g, '💡')
    .replace(/\[summary\]/g, '🧾');
}

function renderQuoteSummary(summary = {}, question = null) {
  return [
    '[summary] Resumen:',
    `Servicio: ${summary.service ?? 'Pendiente'}`,
    `Medidas/cantidad: ${summary.measurementsOrQuantity ?? 'Pendiente'}`,
    `Presupuesto: ${summary.budget ?? 'Pendiente'}`,
    `Diseno: ${summary.design ?? 'Pendiente'}`,
    `Instalacion: ${summary.installation ?? 'Pendiente'}`,
    `Estimado: ${summary.estimate ?? 'Pendiente con asesor'}`,
    `Siguiente paso: ${summary.nextStep ?? 'Confirmar detalles con asesor'}`,
    '',
    question ?? 'Quieres que te comunique con un asesor para confirmar precio y tiempos?'
  ].join('\n');
}

function renderRecommendations(plan) {
  const recommendations = plan.recommendations ?? [];
  const objective = plan.objective ? `Objetivo: ${plan.objective}` : null;
  const businessType = plan.businessType ? `Giro: ${plan.businessType}` : null;
  const budget = plan.budget ? `Presupuesto: ${Number(plan.budget).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}` : null;
  const lines = recommendations.map((entry, index) => `${index + 1}. ${serviceName(entry.service)}: ${entry.reason}`);
  return [
    '[idea] Con lo que me cuentas, revisaria estas opciones:',
    businessType,
    objective,
    budget,
    '',
    ...lines,
    '',
    'Si quieres, te ayudo a cotizar una de estas opciones o paso el resumen con un asesor.'
  ].filter((line) => line !== null).join('\n');
}

function renderDefaultResponse({ executionPlan, retrievalResult = null, mcpResult = null }) {
  const plan = executionPlan.responsePlan ?? {};
  const emojiMode = plan.emojiMode ?? 'professional';
  const services = plan.services ?? retrievalResult?.services ?? [];
  const categories = plan.categories ?? retrievalResult?.categories ?? [];
  let response = '';

  if (plan.type === 'catalog_listing') {
    const serviceLines = linesForServices(services);
    const categoryLines = (categories ?? []).map((category) => category?.nombre ?? category?.name ?? category).filter(Boolean);
    const body = serviceLines.length
      ? serviceLines.join('\n')
      : categoryLines.length
        ? categoryLines.join('\n')
        : 'No tengo opciones disponibles en este momento.';
    response = `${emojiFor(emojiMode, 'catalog')}Claro, estos son los servicios disponibles:\n\n${body}\n\n${plan.question ?? ''}`.trim();
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'category_listing') {
    const serviceLines = linesForServices(services);
    const category = plan.selectedCategory ?? executionPlan.selectedCategory ?? 'esta categoria';
    const body = serviceLines.length ? serviceLines.join('\n') : 'No encontre opciones activas en esta categoria.';
    response = `${emojiFor(emojiMode, 'catalog')}En ${category} tengo estas opciones:\n\n${body}\n\n${plan.question ?? ''}`.trim();
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'service_quote_start') {
    const service = plan.selectedService ?? executionPlan.selectedService;
    response = plan.availabilityConfirmation
      ? `Sí, manejamos ${serviceName(service)}. ${plan.question ?? ''}`.trim()
      : `${emojiFor(emojiMode, 'quote')}${serviceName(service)}. ${plan.question ?? ''}`.trim();
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'quote_followup') {
    response = `${emojiFor(emojiMode, 'quote')}${plan.question ?? 'Continuamos con la cotizacion.'}`;
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'quote_summary') {
    response = renderQuoteSummary(plan.quoteSummary, plan.question);
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'budget_currency_confirmation') {
    response = plan.question ?? 'Perfecto, lo tomo como presupuesto aproximado en euros. Para confirmar bien, ¿quieres que lo usemos solo como referencia o manejas el presupuesto en pesos MXN?';
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'budget_amount_confirmation') {
    response = plan.question ?? `Solo para confirmar, ¿tu presupuesto aproximado es ${plan.formattedBudget ?? 'ese monto'} MXN?`;
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'handoff') {
    response = `${emojiFor(emojiMode, 'advisor')}Claro, te comunico con un asesor. Ya le comparti el resumen de tu solicitud para que te confirme precio y tiempos.`;
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'advisor_pending') {
    response = `${emojiFor(emojiMode, 'advisor')}El asesor ya tiene tu solicitud y te contactara en cuanto pueda. Mientras tanto, puedo seguir ayudandote por aqui si quieres ajustar algun detalle.`;
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'quote_declined') {
    const service = plan.selectedService ?? executionPlan.selectedService;
    response = service
      ? `Perfecto, dejo pendiente ${serviceName(service)}. Cuando quieras lo retomamos.`
      : 'Perfecto, lo dejamos pendiente. Cuando quieras lo retomamos.';
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'recommendation_options') {
    response = renderRecommendations(plan);
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'recommendation_question') {
    if (mcpResult?.text) return mcpResult.text;
    response = `${emojiFor(emojiMode, 'recommendation')}${plan.question ?? 'Para recomendarte algo util, que quieres lograr?'}`;
    return applyEmojiMode(response, emojiMode);
  }

  if (plan.type === 'neutral_message' || plan.type === 'clarify_need') {
    response = plan.question ?? 'Que necesitas revisar?';
    return applyEmojiMode(response, emojiMode);
  }

  response = plan.question ?? plan.summary ?? '';
  return applyEmojiMode(response, emojiMode);
}

async function renderResponse({ executionPlan, retrievalResult, mcpResult, responseAdapter, logs }) {
  if (!hasAction(executionPlan, EXECUTION_ACTIONS.RENDER_RESPONSE)) {
    logs.push({ event: 'executor_response_skipped', reason: 'not_requested' });
    return '';
  }
  const responseText = typeof responseAdapter === 'function'
    ? await responseAdapter({ executionPlan, retrievalResult, mcpResult })
    : renderDefaultResponse({ executionPlan, retrievalResult, mcpResult });
  logs.push({ event: 'executor_response_rendered', responsePlanType: executionPlan.responsePlan?.type ?? null });
  return responseText;
}

export async function executeExecutionPlan({
  executionPlan,
  retrievalAdapter = null,
  mcpAdapter = null,
  handoffAdapter = null,
  persistenceAdapter = null,
  responseAdapter = null
} = {}) {
  if (!executionPlan || executionPlan.schema !== 'ExecutionPlan') {
    throw new Error('executeExecutionPlan requires an ExecutionPlan');
  }

  const authorityBefore = {
    nextState: executionPlan.nextState,
    selectedService: clone(executionPlan.selectedService ?? null)
  };
  const logs = [{ event: 'executor_started', decisionId: executionPlan.decisionId ?? null }];

  const retrievalResult = await executeRetrieval({ executionPlan, retrievalAdapter, logs });
  const mcpResult = await executeMcp({ executionPlan, mcpAdapter, logs });
  const notifications = await executeHandoff({ executionPlan, handoffAdapter, logs });
  const stateToPersist = await executePersistence({ executionPlan, persistenceAdapter, logs });
  const responseText = await renderResponse({
    executionPlan,
    retrievalResult,
    mcpResult,
    responseAdapter,
    logs
  });

  const authorityAfter = {
    nextState: executionPlan.nextState,
    selectedService: clone(executionPlan.selectedService ?? null)
  };
  ensurePlannerAuthorityPreserved({ before: authorityBefore, after: authorityAfter });
  logs.push({ event: 'executor_completed', nextState: executionPlan.nextState });

  return {
    responseText,
    stateToPersist,
    notifications,
    leadActions: [],
    logs
  };
}
