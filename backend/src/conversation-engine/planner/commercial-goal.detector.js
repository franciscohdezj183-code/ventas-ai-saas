import { normalizeForNcie } from '../message-normalizer.js';
import { COMMERCIAL_PLANNER_GOALS } from './commercial-state.schema.js';

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function looksLikeDimensionAnswer(text) {
  return /\b\d+(?:[.,]\d+)?\s*(?:x|por|\*)\s*\d+(?:[.,]\d+)?\b/.test(text);
}

function looksLikeLowContentReply(text) {
  return wordCount(text) <= 3 && includesAny(text, [
    'si',
    'no',
    'ok',
    'okay',
    'va',
    'sale',
    'claro',
    'perfecto',
    'listo',
    'de acuerdo'
  ]);
}

function asksServiceAvailability(text) {
  return includesAny(text, ['tambien hacen', 'tambien manejan', 'tambien tienen', 'manejan', 'hacen']);
}

function isGreeting(text) {
  return /^(hola|buen dia|buenos dias|buenas tardes|buenas noches|hey|hello|que tal|buenas)$/.test(text);
}

function isNeutralMessage(text, rawText = text) {
  return isGreeting(text) ||
    /^(gracias|muchas gracias|ok gracias|perfecto gracias|sale gracias)$/.test(text) ||
    rawText === '?' ||
    /^(estas ahi|sigues ahi|sigue ahi|hay alguien|me lees|estas disponible)$/.test(text) ||
    /^(ok|okay|va|sale|listo|perfecto|de acuerdo)$/.test(text);
}

export function detectCommercialGoal({ normalizedMessage, nlu, state, plannerState } = {}) {
  const text = normalizeForNcie(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '');
  const rawText = String(normalizedMessage?.original ?? normalizedMessage?.raw ?? normalizedMessage?.normalized ?? '').trim().toLowerCase();
  const lastQuestion = normalizeForNcie(plannerState?.lastBotQuestion ?? state?.commercial?.lastBotQuestion ?? '');
  const active = (plannerState?.flows ?? []).find((flow) => flow.id === plannerState?.activeFlowId) ?? null;

  if (!text) return COMMERCIAL_PLANNER_GOALS.GENERAL;

  if (isNeutralMessage(text, rawText)) return COMMERCIAL_PLANNER_GOALS.GENERAL;

  if (
    active &&
    /\b(pagina|web|catalogo|pedidos|cotizaciones)\b/.test(lastQuestion) &&
    /\b(para catalogo|catalogo|pedido|pedidos|ordenes|informativa|landing)\b/.test(text)
  ) {
    return active.goal ?? COMMERCIAL_PLANNER_GOALS.QUOTE;
  }

  if (includesAny(text, ['continuemos', 'continuamos', 'sigamos', 'retomemos', 'volvamos'])) {
    return COMMERCIAL_PLANNER_GOALS.CONTINUE_FLOW;
  }

  if (includesAny(text, ['unicos servicios', 'otros servicios', 'que mas servicios', 'mas servicios', 'todo lo que manejan'])) {
    return COMMERCIAL_PLANNER_GOALS.FOLLOW_UP_CATALOG;
  }

  if (['LISTAR_SERVICIOS', 'LISTAR_PRODUCTOS', 'LISTAR_CATALOGO'].includes(nlu?.intent)) {
    return COMMERCIAL_PLANNER_GOALS.LIST_CATALOG;
  }

  if (
    nlu?.intent === 'LISTAR_PRODUCTOS' ||
    includesAny(text, ['manejan productos', 'tienen productos', 'que productos', 'productos tienen', 'tambien hacen servicios', 'hacen servicios'])
  ) {
    return COMMERCIAL_PLANNER_GOALS.EXPLORE_COMPANY;
  }

  if (
    nlu?.intent === 'CONSULTAR_PRECIO' ||
    nlu?.intent === 'INTENCION_COMPRA' ||
    includesAny(text, ['cotizar', 'cotizacion', 'cuanto cuesta', 'cuanto sale', 'precio', 'me interesa', 'me gustaria', 'quiero una', 'quiero un'])
  ) {
    return COMMERCIAL_PLANNER_GOALS.QUOTE;
  }

  if (looksLikeDimensionAnswer(text) && (active?.selectedServiceId || state?.commercial?.activeServiceId || state?.lastServiceId)) {
    return COMMERCIAL_PLANNER_GOALS.QUOTE;
  }

  if (asksServiceAvailability(text) && nlu?.type === 'service') {
    return COMMERCIAL_PLANNER_GOALS.QUOTE;
  }

  if (includesAny(text, ['anunciar mi negocio', 'promocionar mi negocio', 'atraer clientes', 'vender mas', 'publicitar'])) {
    return COMMERCIAL_PLANNER_GOALS.INCREASE_SALES;
  }

  if (includesAny(text, ['tengo una', 'tengo un negocio', 'mi negocio es', 'tengo cafeteria', 'tengo restaurante'])) {
    return COMMERCIAL_PLANNER_GOALS.IMPROVE_BUSINESS;
  }

  if (includesAny(text, ['que servicios', 'servicios tienen', 'que manejan', 'hacen servicios']) || text === 'servicios') {
    return COMMERCIAL_PLANNER_GOALS.EXPLORE_COMPANY;
  }

  if (includesAny(text, ['informes', 'informacion', 'conocer', 'solo quiero informacion'])) {
    return COMMERCIAL_PLANNER_GOALS.KNOW_COMPANY;
  }

  if (lastQuestion && active && looksLikeLowContentReply(text)) {
    return active.goal ?? COMMERCIAL_PLANNER_GOALS.CONTINUE_FLOW;
  }

  return active?.goal ?? COMMERCIAL_PLANNER_GOALS.GENERAL;
}
