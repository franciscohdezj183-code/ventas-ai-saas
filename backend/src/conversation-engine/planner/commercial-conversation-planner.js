import { logger } from '../../utils/logger.js';
import { normalizeForNcie } from '../message-normalizer.js';
import {
  activeFlow,
  COMMERCIAL_NEXT_ACTIONS,
  COMMERCIAL_PLANNER_GOALS,
  COMMERCIAL_PLANNER_STAGES,
  emptyPlannerState,
  flowSummary,
  normalizePlannerState
} from './commercial-state.schema.js';
import { detectCommercialGoal } from './commercial-goal.detector.js';
import { detectMissingInformation } from './missing-information.detector.js';
import { detectTopicSwitch } from './topic-switch.detector.js';
import { planRetrievalPolicy } from './retrieval-policy.js';

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(String(value).trim().toLowerCase());
}

export function isConversationPlannerShadowEnabled() {
  return booleanEnv('NCIE_CONVERSATION_PLANNER_ENABLED', false) &&
    booleanEnv('NCIE_CONVERSATION_PLANNER_SHADOW', false);
}

export function isConversationPlannerAuthorityEnabled() {
  return booleanEnv('NCIE_CONVERSATION_PLANNER_ENABLED', false) &&
    !booleanEnv('NCIE_CONVERSATION_PLANNER_SHADOW', false);
}

function flowIdForService(service) {
  return `flow_service_${service?.id ?? String(service?.nombre ?? 'unknown').toLowerCase().replace(/\s+/g, '_')}`;
}

function selectedServiceFrom({ flow = null, retrieval = null } = {}) {
  const top = retrieval?.services?.[0] ?? null;
  if (top && Number(top.score ?? 0) > 0) return top;
  if (flow?.selectedServiceId || flow?.selectedServiceName) {
    return {
      id: flow.selectedServiceId,
      nombre: flow.selectedServiceName,
      categoria: flow.selectedCategory,
      tipo_precio: flow.servicePriceType,
      precio: flow.servicePrice,
      unidad_medida: flow.unitMeasure,
      requiere_medidas: flow.requiresMeasurements,
      requiere_cantidad: flow.requiresQuantity,
      incluye: flow.includes,
      no_incluye: flow.excludes
    };
  }
  return null;
}

function withExplicitServiceName(service = null, explicitServiceName = null) {
  if (!service || !explicitServiceName) return service;
  return { ...service, explicitServiceName };
}

function textFromMessage(normalizedMessage = null) {
  return normalizeForNcie(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '');
}

function rawTextFromMessage(normalizedMessage = null) {
  return String(normalizedMessage?.original ?? normalizedMessage?.raw ?? normalizedMessage?.normalized ?? '').trim().toLowerCase();
}

function serviceMatchesText(flow = null, normalizedMessage = null) {
  if (!flow) return false;
  const text = textFromMessage(normalizedMessage);
  const haystack = normalizeForNcie(flow.selectedServiceName ?? '');
  const tokens = text
    .split(/\s+/)
    .filter((token) => token.length > 3 && !['quiero', 'gustaria', 'interesa', 'tambien', 'hacen', 'manejan', 'tienen'].includes(token));
  return tokens.some((token) => haystack.includes(token));
}

function isFreshServiceRequest(normalizedMessage = null, currentFlow = null) {
  if (!currentFlow || !serviceMatchesText(currentFlow, normalizedMessage)) return false;
  const text = textFromMessage(normalizedMessage);
  return /\b(me interesa|quiero|me gustaria|cotizar|cotizacion|precio)\b/.test(text);
}

function hasSpecificTopicTokens(normalizedMessage = null) {
  const generic = new Set([
    'quiero',
    'gustaria',
    'interesa',
    'interes',
    'tambien',
    'hacen',
    'manejan',
    'tienen',
    'pueden',
    'ayudas',
    'ayudar',
    'cotizar',
    'cotizacion',
    'precio',
    'producto',
    'productos',
    'servicio',
    'servicios',
    'revisar'
  ]);
  return textFromMessage(normalizedMessage)
    .split(/\s+/)
    .some((token) => token.length > 3 && !generic.has(token));
}

function isResumeRequest(normalizedMessage = null) {
  return /\b(continuemos|continuamos|sigamos|retomemos|volvamos)\b/.test(textFromMessage(normalizedMessage));
}

function isDimensionOnly(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  return /^\s*\d+(?:[.,]\d+)?\s*(?:x|por|\*)\s*\d+(?:[.,]\d+)?\s*$/.test(text);
}

function containsDimensionValue(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  return /\b\d+(?:[.,]\d+)?\s*(?:x|por|\*)\s*\d+(?:[.,]\d+)?\b/.test(text);
}

function isConsultativeGuidanceRequest(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  return /\b(que me recomiendas|que recomiendas|recomiendame|me recomiendas|alguna recomendacion|algo economico|opcion economica|mas economico)\b/.test(text);
}

function isEconomicOptionRequest(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  return /\b(algo economico|opcion economica|mas economico|poco presupuesto|presupuesto limitado|no tengo mucho presupuesto)\b/.test(text);
}

function isGenericPriceRequest(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  return /^(precios|precio|costo|costos)$/.test(text) ||
    /\b(necesito precios|quiero precios|me das precios|dame precios|cuanto cuesta|cuanto sale|cotizar precios)\b/.test(text);
}

function isConsultativeDiagnosisRequest(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  return /\b(no se que necesito|no se que me conviene|que me recomiendas|que recomiendas|recomiendame|me recomiendas|quiero vender mas|quiero atraer clientes|atraer clientes|atraer mas clientes|presencia en redes|quiero mejorar mi presencia|quiero mejorar mi negocio|necesito publicidad|quiero publicidad|quiero promocionar mi negocio|quiero anunciar mi negocio|promocionar mi negocio|anunciar mi negocio)\b/.test(text);
}

function isLowSignalUnknownRequest({ normalizedMessage = null, nlu = null } = {}) {
  const text = textFromMessage(normalizedMessage);
  if (nlu?.intent !== 'MENSAJE_GENERAL' || nlu?.type !== 'unknown') return false;
  if (Number(nlu?.confidence ?? 0) > 0.4) return false;
  if (!text || isGreetingRequest(normalizedMessage) || isResumeRequest(normalizedMessage) || containsDimensionValue(normalizedMessage)) return false;
  if (explicitServiceMention(normalizedMessage)) return false;
  if (looksLikeDesignModifier(normalizedMessage) || looksLikeInstallationModifier(normalizedMessage)) return false;
  if (/\b(tambien|tambien hacen|tambien manejan|hacen|manejan)\b/.test(text) && hasSpecificTopicTokens(normalizedMessage)) return false;
  return true;
}

function isGreetingRequest(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  return /^(hola|buen dia|buenos dias|buenas tardes|buenas noches|hey|hello|que tal|buenas)$/.test(text);
}

function neutralMessageType(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  const rawText = rawTextFromMessage(normalizedMessage);
  if (isGreetingRequest(normalizedMessage)) return 'greeting';
  if (/^(gracias|muchas gracias|ok gracias|perfecto gracias|sale gracias)$/.test(text)) return 'thanks';
  if (rawText === '?' || /^(estas ahi|sigues ahi|sigue ahi|hay alguien|me lees|estas disponible)$/.test(text)) return 'ping';
  if (/^(ok|okay|va|sale|listo|perfecto|de acuerdo)$/.test(text)) return 'ack';
  return null;
}

function lastQuestionText({ plannerState, state, currentFlow }) {
  return normalizeForNcie(plannerState?.lastBotQuestion ?? state?.commercial?.lastBotQuestion ?? currentFlow?.lastQuestion ?? '');
}

function isDesignQuestion(question) {
  return /\b(diseno|dise)/.test(question);
}

function isInstallationQuestion(question) {
  return /\b(instalacion|instalaci)/.test(question);
}

function isWebTypeQuestion(question) {
  return /\b(pagina|web|catalogo|pedidos|cotizaciones)\b/.test(question);
}

function flowLooksLikeWeb(flow = null) {
  const name = normalizeForNcie(flow?.selectedServiceName ?? '');
  if (/\b(marketing digital|publicidad digital|redes sociales|campanas digitales)\b/.test(name)) return false;
  const text = normalizeForNcie(`${flow?.selectedServiceName ?? ''} ${flow?.selectedCategory ?? ''}`);
  return /\b(web|pagina|sitio|landing|ecommerce|tienda en linea)\b/.test(text);
}

function flowLooksLikeMarketing(flow = null) {
  const text = normalizeForNcie(`${flow?.selectedServiceName ?? ''} ${flow?.selectedCategory ?? ''}`);
  return /\b(marketing|redes|publicidad digital|campanas digitales|digital)\b/.test(text);
}

function marketingGoalFromMessage(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  if (/\b(presencia en redes|mejorar presencia|mejorar mi presencia|redes sociales)\b/.test(text)) return 'mejorar_presencia_redes';
  if (/\b(atraer clientes|atraer mas clientes|captar clientes)\b/.test(text)) return 'atraer_clientes';
  if (/\b(vender mas|mas ventas|incrementar ventas)\b/.test(text)) return 'vender_mas';
  return null;
}

function isDiagnosisQuestion(question) {
  return /\b(tipo de negocio|atraer clientes|vender mas|mejorar tu imagen|promocionar algo|local fisico|vendes por internet|dos formas|estrategia mas completa|economico para empezar|presencia en redes|objetivo quieres lograr|quieres lograr primero)\b/.test(question);
}

function isDiagnosisFollowupAnswer({ normalizedMessage = null, currentQuestion = '' } = {}) {
  if (!isDiagnosisQuestion(currentQuestion)) return false;
  const text = textFromMessage(normalizedMessage);
  return /\b(solo por internet|por internet|internet|redes|redes sociales|presencia en redes|local fisico|ambas|dos formas|atraer clientes|vender mas|mejorar imagen|economico|estrategia completa)\b/.test(text);
}

function serviceSupportsInstallation(serviceOrFlow = null) {
  const text = normalizeForNcie([
    serviceOrFlow?.nombre,
    serviceOrFlow?.selectedServiceName,
    serviceOrFlow?.descripcion,
    serviceOrFlow?.selectedCategory,
    serviceOrFlow?.categoria,
    serviceOrFlow?.incluye,
    serviceOrFlow?.includes,
    serviceOrFlow?.no_incluye,
    serviceOrFlow?.excludes
  ].filter(Boolean).join(' '));
  return /\b(lona|vinil|viniles|senal[eé]tica|senaletica|banner|arana|rotulacion|impresion gran formato)\b/.test(text);
}

function looksLikeDesignModifier(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  return /\b(con diseno|sin diseno|tambien diseno|apoyo con el diseno|ayuda con el diseno|ya tengo diseno|ya tengo el diseno|tengo diseno|no necesito diseno|quiero diseno|necesito diseno)\b/.test(text);
}

function looksLikeInstallationModifier(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  return /\b(sin instalacion|con instalacion|no necesito instalacion|no quiero instalacion|quiero instalacion|necesito instalacion)\b/.test(text);
}

function explicitServiceMention(normalizedMessage = null) {
  const text = textFromMessage(normalizedMessage);
  if (/\b(marketing digital|redes sociales|publicidad digital|campanas digitales|anuncios digitales)\b/.test(text)) return 'Marketing digital';
  if (/\b(pagina web|paginas web|sitio web|web|landing|ecommerce|tienda en linea)\b/.test(text)) return 'Diseno web';
  if (/\b(lona|lonas|impresion de lona)\b/.test(text)) return 'Impresion de lona';
  if (/\b(tarjeta|tarjetas|tarjetas digitales)\b/.test(text)) return 'Tarjetas digitales';
  return null;
}

function textMatchesServiceName(text, serviceName) {
  if (!serviceName) return false;
  const normalizedText = normalizeForNcie(text);
  const normalizedService = normalizeForNcie(serviceName);
  return normalizedText === normalizedService || normalizedService.includes(normalizedText);
}

function answersLastQuestion({ normalizedMessage, plannerState, state, currentFlow }) {
  const text = textFromMessage(normalizedMessage);
  const question = lastQuestionText({ plannerState, state, currentFlow });
  if (!question) return false;
  if (containsDimensionValue(normalizedMessage) && currentFlow?.requiresMeasurements) return true;
  if (looksLikeDesignModifier(normalizedMessage)) return isDesignQuestion(question);
  if (looksLikeInstallationModifier(normalizedMessage)) {
    return isInstallationQuestion(question) || serviceSupportsInstallation(currentFlow);
  }
  if (/\b(pedido|pedidos|ordenes|comprar|ventas|tienda|ecommerce|carrito|catalogo|informativa|landing)\b/.test(text) &&
    isWebTypeQuestion(question)) return true;
  if (flowLooksLikeMarketing(currentFlow) && marketingGoalFromMessage(normalizedMessage) && isDiagnosisQuestion(question)) return true;
  if (isDiagnosisFollowupAnswer({ normalizedMessage, currentQuestion: question })) return true;
  if (isDesignQuestion(question) &&
    /^(si|no)$/.test(text)) return true;
  if (isInstallationQuestion(question) &&
    /^(si|no)$/.test(text)) return true;
  return false;
}

function inferShortAnswerFromLastQuestion({ normalizedMessage, plannerState, state, currentFlow }) {
  const text = textFromMessage(normalizedMessage);
  const question = normalizeForNcie(plannerState?.lastBotQuestion ?? state?.commercial?.lastBotQuestion ?? currentFlow?.lastQuestion ?? '');
  const result = {};
  if (/\b(diseno|diseño)\b/.test(question)) {
    if (/^si$/.test(text)) result.detectedDesignPreference = true;
    if (/^no$/.test(text)) result.detectedDesignPreference = false;
  }
  if (/\b(instalacion|instalación)\b/.test(question)) {
    if (/^si$/.test(text)) result.detectedInstallationPreference = true;
    if (/^no$/.test(text)) result.detectedInstallationPreference = false;
  }
  return result;
}

function inferContextualAnswerFromLastQuestion({ normalizedMessage, plannerState, state, currentFlow }) {
  const text = textFromMessage(normalizedMessage);
  const question = lastQuestionText({ plannerState, state, currentFlow });
  const result = inferShortAnswerFromLastQuestion({ normalizedMessage, plannerState, state, currentFlow });

  if (isDesignQuestion(question)) {
    if (/^si$/.test(text) || /\b(con diseno|tambien diseno|si necesito diseno|apoyo con el diseno|ayuda con el diseno|quiero diseno|necesito diseno)\b/.test(text)) {
      result.detectedDesignPreference = true;
    }
    if (/^no$/.test(text) || /\b(sin diseno|ya tengo diseno|ya tengo el diseno|tengo diseno|tengo el diseno|no quiero diseno|no necesito diseno)\b/.test(text)) {
      result.detectedDesignPreference = false;
    }
  }

  if (isInstallationQuestion(question) || serviceSupportsInstallation(currentFlow)) {
    if (/^si$/.test(text) || /\b(con instalacion|necesito instalacion|quiero instalacion|tambien instalacion)\b/.test(text)) {
      result.detectedInstallationPreference = true;
    }
    if (/^no$/.test(text) || /\b(sin instalacion|no instalacion|no necesito instalacion|no quiero instalacion)\b/.test(text)) {
      result.detectedInstallationPreference = false;
    }
  }

  if (isWebTypeQuestion(question)) {
    if (/\b(catalogo)\b/.test(text)) result.detectedWebType = 'catalogo';
    if (/\b(pedido|pedidos|ordenes|comprar|ventas|tienda|ecommerce|carrito)\b/.test(text)) result.detectedWebType = 'pedidos';
    if (/\b(informativa|informacion|presentacion|landing)\b/.test(text)) result.detectedWebType = 'informativa';
  }

  if (flowLooksLikeMarketing(currentFlow) && isDiagnosisQuestion(question)) {
    const marketingGoal = marketingGoalFromMessage(normalizedMessage);
    if (marketingGoal) result.detectedMarketingGoal = marketingGoal;
  }

  return result;
}

function isExplicitTopicChange({ goal, nlu, normalizedMessage, currentFlow, plannerState, state }) {
  if (!currentFlow) return false;
  if (isResumeRequest(normalizedMessage)) return false;
  if (answersLastQuestion({ normalizedMessage, plannerState, state, currentFlow })) return false;
  if (isDimensionOnly(normalizedMessage)) return false;
  if (isCatalogGoal(goal)) return false;
  if (looksLikeInstallationModifier(normalizedMessage) && !serviceSupportsInstallation(currentFlow)) return false;
  const mentionedService = explicitServiceMention(normalizedMessage);
  if (mentionedService && !textMatchesServiceName(mentionedService, currentFlow.selectedServiceName)) return true;
  if (nlu?.type === 'product' || ['BUSCAR_PRODUCTO', 'LISTAR_PRODUCTOS'].includes(nlu?.intent)) return true;
  if (goal === COMMERCIAL_PLANNER_GOALS.INCREASE_SALES || goal === COMMERCIAL_PLANNER_GOALS.IMPROVE_BUSINESS) return true;
  if (nlu?.type === 'service' && hasSpecificTopicTokens(normalizedMessage) && !serviceMatchesText(currentFlow, normalizedMessage)) return true;
  return false;
}

function isCatalogGoal(goal) {
  return goal === COMMERCIAL_PLANNER_GOALS.FOLLOW_UP_CATALOG ||
    goal === COMMERCIAL_PLANNER_GOALS.EXPLORE_COMPANY ||
    goal === COMMERCIAL_PLANNER_GOALS.KNOW_COMPANY;
}

function shouldDeferToCurrentNcie({ goal, nlu }) {
  if (nlu?.type === 'product' || ['BUSCAR_PRODUCTO', 'LISTAR_PRODUCTOS'].includes(nlu?.intent)) return true;
  return goal === COMMERCIAL_PLANNER_GOALS.INCREASE_SALES ||
    goal === COMMERCIAL_PLANNER_GOALS.IMPROVE_BUSINESS;
}

function responsePlanTypeFor({ goal, selectedService, missing, nextAction, topicSwitch, deferToNcie, explicitTopicChange }) {
  if (deferToNcie) return 'defer_to_ncie';
  if (isCatalogGoal(goal)) return 'business_summary';
  if (topicSwitch?.resumeFlow) return 'resume_flow';
  if (selectedService && missing.includes('medidas')) return 'ask_measurements';
  if (selectedService && missing.includes('tipo_web')) return 'ask_web_type';
  if (topicSwitch?.newService || (explicitTopicChange && selectedService)) return 'topic_switch_service';
  if (selectedService) return 'service_explanation';
  return 'clarify_or_retrieve';
}

function markFlowPaused(flow) {
  return flow ? { ...flow, status: 'paused' } : flow;
}

function previewStateUpdate({ plannerState, goal, stage, selectedService, missing, entities, topicSwitch, normalizedMessage, suspendActiveFlow = false, resetEntities = false }) {
  const next = {
    ...(plannerState ?? emptyPlannerState()),
    flows: [...(plannerState?.flows ?? [])]
  };

  if (topicSwitch?.resumeFlow) {
    next.flows = next.flows.map((flow) => flow.id === topicSwitch.resumeFlow.id ? { ...flow, status: 'active' } : markFlowPaused(flow));
    next.activeFlowId = topicSwitch.resumeFlow.id;
    return next;
  }

  if (!selectedService) {
    if (suspendActiveFlow && next.activeFlowId) {
      next.flows = next.flows.map((flow) => flow.id === next.activeFlowId ? markFlowPaused(flow) : flow);
      next.activeFlowId = null;
    }
    return {
      ...next,
      lastBotQuestion: plannerState?.lastBotQuestion ?? null
    };
  }

  const id = flowIdForService(selectedService);
  const existingIndex = next.flows.findIndex((flow) => flow.id === id);
  const foundPrevious = existingIndex >= 0 ? next.flows[existingIndex] : {};
  const previousServiceName = normalizeForNcie(foundPrevious.selectedServiceName ?? '');
  const nextServiceName = normalizeForNcie(selectedService.nombre ?? '');
  const samePreviousService = previousServiceName && nextServiceName
    ? previousServiceName === nextServiceName
    : String(foundPrevious.selectedServiceId ?? '') === String(selectedService.id ?? '');
  const previous = samePreviousService ? foundPrevious : {};
  if (next.activeFlowId && next.activeFlowId !== id) {
    next.flows = next.flows.map((flow) => flow.id === next.activeFlowId ? markFlowPaused(flow) : flow);
  }
  const flow = {
    ...previous,
    id,
    goal,
    stage,
    selectedServiceId: selectedService.id ?? previous.selectedServiceId ?? null,
    selectedServiceName: selectedService.nombre ?? previous.selectedServiceName ?? null,
    selectedCategory: selectedService.categoria ?? previous.selectedCategory ?? null,
    servicePriceType: selectedService.tipo_precio ?? previous.servicePriceType ?? null,
    servicePrice: selectedService.precio ?? previous.servicePrice ?? null,
    unitMeasure: selectedService.unidad_medida ?? previous.unitMeasure ?? null,
    requiresMeasurements: selectedService.requiere_medidas ?? previous.requiresMeasurements ?? null,
    requiresQuantity: selectedService.requiere_cantidad ?? previous.requiresQuantity ?? null,
    includes: selectedService.incluye ?? previous.includes ?? null,
    excludes: selectedService.no_incluye ?? previous.excludes ?? null,
    quoteNotes: selectedService.notas_cotizacion ?? previous.quoteNotes ?? null,
    minimumPrice: selectedService.precio_minimo ?? previous.minimumPrice ?? null,
    entities: {
      ...(resetEntities ? {} : previous.entities ?? {}),
      ...(entities ?? {})
    },
    missing,
    lastUserMessage: normalizedMessage?.raw ?? null,
    status: 'active'
  };

  if (existingIndex >= 0) {
    next.flows[existingIndex] = flow;
  } else {
    next.flows.push(flow);
  }
  next.activeFlowId = id;
  return next;
}

export function planCommercialConversation({
  empresaId,
  conversationId = null,
  normalizedMessage,
  nlu,
  state,
  retrieval = null,
  phase = 'pre_retrieval'
} = {}) {
  const plannerState = normalizePlannerState({ state, empresaId, conversationId });
  const currentFlow = activeFlow(plannerState);
  const goal = detectCommercialGoal({ normalizedMessage, nlu, state, plannerState });
  const catalogGoal = isCatalogGoal(goal);
  const directAnswer = answersLastQuestion({ normalizedMessage, plannerState, state, currentFlow });
  const genericPriceRequest = !directAnswer && isGenericPriceRequest(normalizedMessage);
  const diagnosisFollowup = directAnswer && isDiagnosisFollowupAnswer({
    normalizedMessage,
    currentQuestion: lastQuestionText({ plannerState, state, currentFlow })
  });
  const consultativeDiagnosis = !directAnswer && !genericPriceRequest && isConsultativeDiagnosisRequest(normalizedMessage);
  const consultativeGuidance = isConsultativeGuidanceRequest(normalizedMessage);
  const neutralType = directAnswer ? null : neutralMessageType(normalizedMessage);
  const neutralMessage = Boolean(neutralType);
  const freshServiceRequest = !directAnswer && isFreshServiceRequest(normalizedMessage, currentFlow);
  const explicitlyMentionedService = explicitServiceMention(normalizedMessage);
  const explicitTopicChange = isExplicitTopicChange({ goal, nlu, normalizedMessage, currentFlow, plannerState, state });
  const lowSignalUnknown = !directAnswer &&
    !catalogGoal &&
    !genericPriceRequest &&
    !consultativeDiagnosis &&
    !consultativeGuidance &&
    !neutralMessage &&
    !explicitTopicChange &&
    isLowSignalUnknownRequest({ normalizedMessage, nlu });
  const deferToNcie = !consultativeDiagnosis && !directAnswer && !catalogGoal && !genericPriceRequest && shouldDeferToCurrentNcie({ goal, nlu });
  const suspendActiveFlow = Boolean(currentFlow && (catalogGoal || deferToNcie || explicitTopicChange || consultativeGuidance || consultativeDiagnosis || lowSignalUnknown));
  const flowForPlanning = deferToNcie || explicitTopicChange || consultativeGuidance || consultativeDiagnosis || neutralMessage || lowSignalUnknown ? null : currentFlow;
  const currentQuestion = lastQuestionText({ plannerState, state, currentFlow });
  const allowPreliminaryInstallation = isInstallationQuestion(currentQuestion) || serviceSupportsInstallation(flowForPlanning);
  const rejectedInstallationContext = looksLikeInstallationModifier(normalizedMessage) && !allowPreliminaryInstallation;
  const preliminaryMissing = detectMissingInformation({
    flow: flowForPlanning,
    normalizedMessage,
    resetEntities: freshServiceRequest,
    allowInstallationPreference: allowPreliminaryInstallation
  });
  const policy = directAnswer
    ? {
      retrievalNeeded: false,
      reason: 'direct_answer_to_last_question',
      nextAction: COMMERCIAL_NEXT_ACTIONS.ANSWER_FROM_CONTEXT
    }
    : consultativeDiagnosis
      ? {
        retrievalNeeded: false,
        reason: 'consultative_diagnosis_before_retrieval',
        nextAction: COMMERCIAL_NEXT_ACTIONS.ANSWER_FROM_CONTEXT
      }
    : consultativeGuidance
      ? {
        retrievalNeeded: false,
        reason: 'consultative_guidance_before_selection',
        nextAction: COMMERCIAL_NEXT_ACTIONS.ANSWER_FROM_CONTEXT
      }
    : neutralMessage
      ? {
        retrievalNeeded: false,
        reason: 'neutral_message_without_service_selection',
        nextAction: COMMERCIAL_NEXT_ACTIONS.ANSWER_FROM_CONTEXT
      }
    : genericPriceRequest
      ? {
        retrievalNeeded: false,
        reason: 'generic_price_request_requires_subject_or_active_context',
        nextAction: COMMERCIAL_NEXT_ACTIONS.ANSWER_FROM_CONTEXT
      }
    : lowSignalUnknown
      ? {
        retrievalNeeded: false,
        reason: 'low_signal_unknown_without_service_selection',
        nextAction: COMMERCIAL_NEXT_ACTIONS.ANSWER_FROM_CONTEXT
      }
    : deferToNcie || explicitTopicChange
      ? {
      retrievalNeeded: true,
      reason: deferToNcie ? 'planner_deferred_to_current_ncie' : 'explicit_topic_change_requires_retrieval',
      nextAction: COMMERCIAL_NEXT_ACTIONS.RETRIEVE_OPTIONS
    }
      : planRetrievalPolicy({ goal, activeFlow: flowForPlanning, missing: preliminaryMissing.missing, nlu, normalizedMessage });
  const selectedService = catalogGoal || deferToNcie || consultativeGuidance || consultativeDiagnosis || neutralMessage || lowSignalUnknown
    ? null
    : selectedServiceFrom({ flow: flowForPlanning, retrieval });
  const topicSwitch = retrieval && !catalogGoal && !deferToNcie && !consultativeGuidance && !consultativeDiagnosis && !neutralMessage && !lowSignalUnknown && !genericPriceRequest
    ? detectTopicSwitch({ normalizedMessage, plannerState, retrieval })
    : { changed: false, resumeFlow: null, newService: null };
  const baseEffectiveService = topicSwitch?.resumeFlow
    ? {
      id: topicSwitch.resumeFlow.selectedServiceId,
      nombre: topicSwitch.resumeFlow.selectedServiceName,
      categoria: topicSwitch.resumeFlow.selectedCategory,
      tipo_precio: topicSwitch.resumeFlow.servicePriceType,
      precio: topicSwitch.resumeFlow.servicePrice,
      unidad_medida: topicSwitch.resumeFlow.unitMeasure,
      requiere_medidas: topicSwitch.resumeFlow.requiresMeasurements,
      requiere_cantidad: topicSwitch.resumeFlow.requiresQuantity,
      incluye: topicSwitch.resumeFlow.includes,
      no_incluye: topicSwitch.resumeFlow.excludes,
      notas_cotizacion: topicSwitch.resumeFlow.quoteNotes,
      precio_minimo: topicSwitch.resumeFlow.minimumPrice
    }
    : topicSwitch?.newService ?? selectedService;
  const effectiveService = withExplicitServiceName(baseEffectiveService, explicitlyMentionedService);
  const allowEffectiveInstallation = isInstallationQuestion(currentQuestion) || serviceSupportsInstallation(effectiveService);
  const missingInfo = detectMissingInformation({
    flow: topicSwitch?.resumeFlow ?? (topicSwitch?.newService ? null : flowForPlanning),
    selectedService: effectiveService,
    normalizedMessage,
    resetEntities: freshServiceRequest || Boolean(topicSwitch?.newService),
    allowInstallationPreference: allowEffectiveInstallation
  });
  const inferredAnswer = inferContextualAnswerFromLastQuestion({ normalizedMessage, plannerState, state, currentFlow });
  const detectedWebType = missingInfo.detectedWebType ?? inferredAnswer.detectedWebType;
  const detectedDesignPreference = missingInfo.detectedDesignPreference ?? inferredAnswer.detectedDesignPreference;
  const detectedInstallationPreference = missingInfo.detectedInstallationPreference ?? inferredAnswer.detectedInstallationPreference;
  const detectedMarketingGoal = inferredAnswer.detectedMarketingGoal ?? null;
  const entities = {
    ...missingInfo.entities,
    ...(detectedWebType ? { webType: detectedWebType } : {}),
    ...(detectedMarketingGoal ? { marketingGoal: detectedMarketingGoal } : {}),
    ...(detectedDesignPreference !== null && detectedDesignPreference !== undefined ? { design: detectedDesignPreference, designSupport: detectedDesignPreference } : {}),
    ...(detectedInstallationPreference !== null && detectedInstallationPreference !== undefined ? { installation: detectedInstallationPreference } : {})
  };
  const stage = goal === COMMERCIAL_PLANNER_GOALS.FOLLOW_UP_CATALOG
    ? COMMERCIAL_PLANNER_STAGES.FOLLOW_UP
    : missingInfo.stage;
  const nextAction = catalogGoal
    ? COMMERCIAL_NEXT_ACTIONS.FOLLOW_UP_CATALOG
    : deferToNcie
      ? policy.nextAction
    : topicSwitch?.resumeFlow
    ? COMMERCIAL_NEXT_ACTIONS.RESUME_FLOW
    : topicSwitch?.newService
      ? COMMERCIAL_NEXT_ACTIONS.SWITCH_TOPIC
      : missingInfo.missing.length > 0 && effectiveService
        ? COMMERCIAL_NEXT_ACTIONS.ASK_MISSING_INFO
        : policy.nextAction;
  const retrievalNeeded = phase === 'pre_retrieval'
    ? policy.retrievalNeeded
    : Boolean(policy.retrievalNeeded && !effectiveService);
  const responsePlanType = neutralMessage
    ? 'neutral_message'
    : detectedMarketingGoal && effectiveService
      ? 'marketing_goal_followup'
    : genericPriceRequest && !effectiveService
      ? 'generic_price_question'
    : isEconomicOptionRequest(normalizedMessage)
      ? 'economic_category_question'
      : consultativeDiagnosis || diagnosisFollowup
        ? 'consultative_diagnosis'
        : responsePlanTypeFor({
    goal,
    selectedService: effectiveService,
    missing: missingInfo.missing,
    nextAction,
    topicSwitch,
    deferToNcie,
    explicitTopicChange
  });
  const statePreview = previewStateUpdate({
    plannerState,
    goal,
    stage,
    selectedService: effectiveService,
    missing: missingInfo.missing,
    entities,
    topicSwitch,
    normalizedMessage,
    suspendActiveFlow,
    resetEntities: freshServiceRequest || Boolean(topicSwitch?.newService)
  });

  if (directAnswer) {
    logger.info('ncie_planner_last_question_matched', {
      empresaId,
      phase,
      question: currentQuestion,
      customerMessage: normalizedMessage?.normalized ?? normalizedMessage?.raw ?? null,
      activeFlow: flowSummary(currentFlow)
    });
  }
  if (neutralMessage) {
    logger.info('ncie_planner_neutral_message_detected', {
      empresaId,
      phase,
      neutralMessageType: neutralType,
      customerMessage: normalizedMessage?.normalized ?? normalizedMessage?.raw ?? null
    });
    if (currentFlow) {
      logger.info('ncie_planner_active_flow_ignored_for_neutral', {
        empresaId,
        phase,
        neutralMessageType: neutralType,
        activeFlow: flowSummary(currentFlow)
      });
    }
    if (neutralType === 'ping' && currentFlow) {
      logger.info('ncie_planner_safe_context_resume', {
        empresaId,
        phase,
        activeService: currentFlow.selectedServiceName ?? null,
        activeFlow: flowSummary(currentFlow)
      });
    }
  }
  if (consultativeDiagnosis) {
    logger.info('ncie_consultative_diagnosis_detected', {
      empresaId,
      phase,
      customerMessage: normalizedMessage?.normalized ?? normalizedMessage?.raw ?? null,
      activeFlow: flowSummary(currentFlow)
    });
    logger.info('ncie_recommendation_context_required', {
      empresaId,
      phase,
      reason: 'diagnosis_message_requires_business_objective_before_catalog'
    });
  }
  if (
    detectedWebType ||
    detectedMarketingGoal ||
    detectedDesignPreference !== null && detectedDesignPreference !== undefined ||
    detectedInstallationPreference !== null && detectedInstallationPreference !== undefined
  ) {
    logger.info('ncie_planner_short_answer_resolved', {
      empresaId,
      phase,
      question: currentQuestion,
      detectedWebType,
      detectedMarketingGoal,
      detectedDesignPreference,
      detectedInstallationPreference,
      selectedService: effectiveService?.nombre ?? null
    });
  }
  if (rejectedInstallationContext) {
    logger.info('ncie_planner_context_rejected', {
      empresaId,
      phase,
      reason: 'installation_answer_not_applicable_to_active_service',
      activeFlow: flowSummary(currentFlow),
      customerMessage: normalizedMessage?.normalized ?? normalizedMessage?.raw ?? null
    });
  }
  if (explicitTopicChange) {
    logger.info('ncie_planner_explicit_topic_change_detected', {
      empresaId,
      phase,
      goal,
      activeFlow: flowSummary(currentFlow),
      customerMessage: normalizedMessage?.normalized ?? normalizedMessage?.raw ?? null
    });
  }
  if (suspendActiveFlow) {
    logger.info('ncie_planner_flow_suspended', {
      empresaId,
      phase,
      activeFlow: flowSummary(currentFlow),
      reason: catalogGoal ? 'catalog_goal' : deferToNcie ? 'defer_to_ncie' : 'explicit_topic_change'
    });
  }
  if (topicSwitch?.newService || topicSwitch?.resumeFlow) {
    logger.info('ncie_planner_flow_switched', {
      empresaId,
      phase,
      from: flowSummary(currentFlow),
      to: flowSummary(activeFlow(statePreview)),
      mode: topicSwitch?.resumeFlow ? 'resume_flow' : 'new_service'
    });
  }
  if (effectiveService) {
    logger.info('ncie_planner_entity_isolation_verified', {
      empresaId,
      phase,
      selectedService: effectiveService.nombre ?? null,
      hasDimensions: Boolean(entities?.dimensions),
      hasWebType: Boolean(entities?.webType)
    });
    logger.info('ncie_planner_flow_entity_isolation_committed', {
      empresaId,
      phase,
      selectedService: effectiveService.nombre ?? null,
      activeFlow: flowSummary(activeFlow(statePreview))
    });
  }

  return {
    enabled: true,
    shadow: phase.includes('shadow'),
    phase,
    goal,
    stage,
    selectedService: effectiveService
      ? {
        id: effectiveService.id ?? null,
        nombre: effectiveService.nombre ?? null,
        categoria: effectiveService.categoria ?? null
      }
      : null,
    selectedServiceItem: effectiveService ?? null,
    neutralMessageType: neutralType,
    neutralContext: currentFlow
      ? {
        selectedServiceName: currentFlow.selectedServiceName ?? null,
        selectedCategory: currentFlow.selectedCategory ?? null,
        stage: currentFlow.stage ?? null,
        missing: currentFlow.missing ?? [],
        entities: currentFlow.entities ?? {}
      }
      : null,
    missing: missingInfo.missing,
    detectedDimensions: missingInfo.detectedDimensions,
    detectedWebType,
    detectedMarketingGoal,
    detectedDesignPreference,
    detectedInstallationPreference,
    nextAction,
    retrievalNeeded,
    retrievalPolicy: {
      ...policy,
      retrievalNeeded
    },
    responsePlanType,
    explicitTopicChange,
    topicSwitch: {
      changed: Boolean(topicSwitch?.changed),
      resumeFlow: flowSummary(topicSwitch?.resumeFlow),
      newService: topicSwitch?.newService
        ? {
          id: topicSwitch.newService.id ?? null,
          nombre: topicSwitch.newService.nombre ?? null,
          categoria: topicSwitch.newService.categoria ?? null
        }
        : null
    },
    activeFlow: flowSummary(activeFlow(statePreview)),
    stateUpdatePreview: statePreview
  };
}

export function logPlannerAuthorityDecision({ empresaId, decision }) {
  if (!decision) return;
  logger.info('ncie_planner_authority_decision', {
    empresaId,
    phase: decision.phase,
    goal: decision.goal,
    stage: decision.stage,
    selectedService: decision.selectedService?.nombre ?? null,
    missing: decision.missing,
    nextAction: decision.nextAction,
    retrievalNeeded: decision.retrievalNeeded,
    responsePlanType: decision.responsePlanType
  });
}

export function logPlannerShadowDecision({ empresaId, decision }) {
  if (!decision) return;
  logger.info('ncie_planner_shadow_decision', {
    empresaId,
    phase: decision.phase,
    goal: decision.goal,
    stage: decision.stage,
    selectedService: decision.selectedService?.nombre ?? null,
    missing: decision.missing,
    nextAction: decision.nextAction,
    retrievalNeeded: decision.retrievalNeeded,
    responsePlanType: decision.responsePlanType
  });
  logger.info('ncie_planner_retrieval_policy', {
    empresaId,
    phase: decision.phase,
    retrievalNeeded: decision.retrievalNeeded,
    reason: decision.retrievalPolicy?.reason ?? null,
    nextAction: decision.retrievalPolicy?.nextAction ?? null
  });
  logger.info('ncie_planner_state_update_preview', {
    empresaId,
    phase: decision.phase,
    activeFlow: decision.activeFlow,
    flows: (decision.stateUpdatePreview?.flows ?? []).map(flowSummary)
  });
}
