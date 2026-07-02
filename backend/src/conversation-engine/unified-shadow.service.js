import { logger } from '../utils/logger.js';
import {
  CONVERSATION_STATES,
  createConversationSnapshot,
  createConversationState
} from './conversation-contracts.js';
import { extractEntities } from './entity-extractor.js';
import { executeExecutionPlan } from './execution-plan.executor.js';
import { loadFullServiceCatalog } from './retrieval.service.js';
import { planConversation } from './unified-conversation-planner.js';

export function isUnifiedPlannerShadowEnabled() {
  return ['1', 'true', 'yes', 'on', 'si'].includes(String(process.env.UNIFIED_PLANNER_SHADOW ?? '').trim().toLowerCase());
}

function canonicalStateFromLegacy(state = {}) {
  const plannerState = state?.commercial?.plannerState ?? null;
  const activeFlow = (plannerState?.flows ?? []).find((flow) => flow.id === plannerState?.activeFlowId)
    ?? (plannerState?.flows ?? []).find((flow) => flow.status === 'active')
    ?? null;
  const selectedService = plannerState?.selectedService ?? state?.lastService ?? (
    activeFlow?.selectedServiceName || activeFlow?.selectedServiceId
      ? {
        id: activeFlow.selectedServiceId ?? null,
        nombre: activeFlow.selectedServiceName ?? null,
        categoria: activeFlow.selectedCategory ?? null,
        tipo_precio: activeFlow.servicePriceType ?? null,
        precio: activeFlow.servicePrice ?? null,
        unidad_medida: activeFlow.unitMeasure ?? null,
        requiere_medidas: activeFlow.requiresMeasurements ?? null,
        requiere_cantidad: activeFlow.requiresQuantity ?? null
      }
      : null
  );
  const status = mapPlannerStateToUnifiedStatus(plannerState?.waitingField ?? activeFlow?.waitingField, plannerState?.currentStage ?? activeFlow?.stage);
  return createConversationState({
    status,
    selectedService,
    selectedCategory: plannerState?.selectedCategory ?? selectedService?.categoria ?? state?.commercial?.lastCategory ?? null,
    activeFlow: activeFlow
      ? {
        id: activeFlow.id,
        status: activeFlow.status ?? 'active',
        selectedService,
        selectedCategory: activeFlow.selectedCategory ?? selectedService?.categoria ?? null,
        collectedEntities: activeFlow.entities ?? {}
      }
      : null,
    collectedEntities: plannerState?.collectedEntities ?? activeFlow?.entities ?? state?.collectedData ?? {},
    lastQuestionId: plannerState?.lastQuestionId ?? null,
    lastQuestionText: plannerState?.lastBotQuestion ?? activeFlow?.lastQuestion ?? state?.commercial?.lastBotQuestion ?? state?.lastBotQuestion ?? null,
    questionHistory: plannerState?.questionHistory ?? [],
    history: plannerState?.contextHistory ?? []
  });
}

function mapPlannerStateToUnifiedStatus(waitingField = null, stage = null) {
  if (waitingField === 'dimensions') return CONVERSATION_STATES.ESPERANDO_MEDIDAS;
  if (waitingField === 'quantity') return CONVERSATION_STATES.ESPERANDO_CANTIDAD;
  if (waitingField === 'budget') return CONVERSATION_STATES.ESPERANDO_PRESUPUESTO;
  if (waitingField === 'design') return CONVERSATION_STATES.ESPERANDO_DISENO;
  if (waitingField === 'installation') return CONVERSATION_STATES.ESPERANDO_INSTALACION;
  if (waitingField === 'advisor_confirmation') return CONVERSATION_STATES.RESUMEN;
  if (waitingField === 'catalog_selection' || stage === 'viendo_catalogo') return CONVERSATION_STATES.CATALOGO;
  return CONVERSATION_STATES.INIT;
}

function selectedServiceName(value = null) {
  return value?.nombre ?? value?.name ?? value?.selectedServiceName ?? null;
}

function oldSelectedService(oldResult = {}) {
  return selectedServiceName(oldResult?.ncie?.plannerAuthorityDecision?.selectedService)
    ?? selectedServiceName(oldResult?.ncie?.plannerAuthorityDecision?.selectedServiceItem)
    ?? selectedServiceName(oldResult?.ncie?.responsePlan?.selected)
    ?? oldResult?.ncie?.plannerAuthorityDecision?.activeFlow?.selectedServiceName
    ?? null;
}

function oldNextState(oldResult = {}) {
  return oldResult?.ncie?.plannerAuthorityDecision?.stage
    ?? oldResult?.ncie?.responsePlan?.type
    ?? oldResult?.ncie?.decision?.funnelStage
    ?? null;
}

function oldHandoff(oldResult = {}) {
  return Boolean(oldResult?.ncie?.advisorNotificationRequired || oldResult?.ncie?.decision?.action === 'escalate_human');
}

function mismatchReasons({ oldEngineResponse, unifiedResponse, oldService, unifiedService, oldState, unifiedState, oldHandoffValue, unifiedHandoffValue }) {
  const reasons = [];
  if (normalize(oldEngineResponse) !== normalize(unifiedResponse)) reasons.push('response_text');
  if (normalize(oldService) !== normalize(unifiedService)) reasons.push('selected_service');
  if (normalize(oldState) !== normalize(unifiedState)) reasons.push('next_state');
  if (oldHandoffValue !== unifiedHandoffValue) reasons.push('handoff');
  return reasons.length ? reasons : ['none'];
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

async function loadCompanyConfig({ empresaId, mcpClient }) {
  try {
    return (await mcpClient.callTool('obtener_configuracion_empresa', { empresa_id: empresaId }))?.empresa ?? null;
  } catch {
    return null;
  }
}

export async function runUnifiedPlannerShadow({
  empresaId,
  conversationId,
  normalizedMessage,
  state,
  oldResult,
  mcpClient
}) {
  const [catalog, companyConfig] = await Promise.all([
    loadFullServiceCatalog({ empresaId, mcpClient }).catch(() => null),
    loadCompanyConfig({ empresaId, mcpClient })
  ]);
  const catalogHints = {
    services: catalog?.services ?? [],
    categories: catalog?.categories ?? []
  };
  const conversationSnapshot = createConversationSnapshot({
    empresaId,
    conversationId,
    state: canonicalStateFromLegacy(state),
    activeMemory: {
      lastServiceConsulted: state?.lastService ?? null,
      lastCategoryConsulted: state?.commercial?.lastCategory ?? null,
      lastBudgetMentioned: state?.collectedData?.budget ?? null,
      lastSummarySent: state?.needSummary ?? null,
      history: state?.commercial?.plannerState?.contextHistory ?? []
    },
    companyConfig,
    catalogSummary: {
      services: catalogHints.services.length,
      categories: catalogHints.categories.length
    }
  });
  const entities = extractEntities({ message: normalizedMessage, catalog: catalogHints });
  const executionPlan = planConversation({
    message: normalizedMessage,
    entities,
    conversationSnapshot,
    catalogHints,
    companyConfig
  });
  const executorResult = await executeExecutionPlan({
    executionPlan,
    retrievalAdapter: async (retrievalPlan) => ({
      services: catalogHints.services.filter((service) => {
        const queries = retrievalPlan.queries ?? [];
        if (!queries.length) return true;
        return queries.some((query) => normalize(service?.categoria).includes(normalize(query)) || normalize(service?.nombre).includes(normalize(query)));
      }),
      categories: catalogHints.categories
    }),
    mcpAdapter: async (mcpPlan) => ({
      tools: mcpPlan.tools ?? [],
      text: executionPlan.responsePlan?.question ?? null
    })
  });

  const oldService = oldSelectedService(oldResult);
  const unifiedService = selectedServiceName(executionPlan.selectedService);
  const oldState = oldNextState(oldResult);
  const unifiedState = executionPlan.nextState;
  const oldHandoffValue = oldHandoff(oldResult);
  const unifiedHandoffValue = Boolean(executionPlan.handoffPlan?.needed);
  const comparison = {
    oldEngineResponse: oldResult?.respuesta ?? null,
    unifiedResponse: executorResult.responseText,
    oldIntent: oldResult?.intencion ?? oldResult?.ncie?.nlu?.intent ?? null,
    unifiedIntent: executionPlan.intent,
    oldSelectedService: oldService,
    unifiedSelectedService: unifiedService,
    oldNextState: oldState,
    unifiedNextState: unifiedState,
    oldHandoff: oldHandoffValue,
    unifiedHandoff: unifiedHandoffValue,
    mismatchReason: mismatchReasons({
      oldEngineResponse: oldResult?.respuesta,
      unifiedResponse: executorResult.responseText,
      oldService,
      unifiedService,
      oldState,
      unifiedState,
      oldHandoffValue,
      unifiedHandoffValue
    }),
    executionPlan,
    executorResult
  };

  logger.info('unified_shadow_comparison', {
    empresaId,
    conversationId,
    oldEngineResponse: comparison.oldEngineResponse,
    unifiedResponse: comparison.unifiedResponse,
    oldIntent: comparison.oldIntent,
    unifiedIntent: comparison.unifiedIntent,
    oldSelectedService: comparison.oldSelectedService,
    unifiedSelectedService: comparison.unifiedSelectedService,
    oldNextState: comparison.oldNextState,
    unifiedNextState: comparison.unifiedNextState,
    oldHandoff: comparison.oldHandoff,
    unifiedHandoff: comparison.unifiedHandoff,
    mismatchReason: comparison.mismatchReason,
    executionPlan: {
      intent: executionPlan.intent,
      reason: executionPlan.reason,
      nextState: executionPlan.nextState,
      entities: executionPlan.entities,
      selectedService: executionPlan.selectedService,
      selectedCategory: executionPlan.selectedCategory,
      responsePlan: executionPlan.responsePlan,
      handoffPlan: executionPlan.handoffPlan
    },
    executorResult: {
      responseText: executorResult.responseText,
      notifications: executorResult.notifications,
      logs: executorResult.logs
    }
  });

  return comparison;
}
