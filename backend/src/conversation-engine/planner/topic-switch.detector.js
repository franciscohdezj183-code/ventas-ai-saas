import { normalizeForNcie } from '../message-normalizer.js';

function serviceText(service = null) {
  return normalizeForNcie(`${service?.nombre ?? ''} ${service?.descripcion ?? ''} ${service?.categoria ?? ''}`);
}

function scoreServiceAgainstMessage(service, text) {
  const haystack = serviceText(service);
  const tokens = normalizeForNcie(text).split(/\s+/).filter((token) => token.length > 3);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function isResumeRequest(text) {
  return /\b(continuemos|continuamos|sigamos|retomemos|volvamos)\b/.test(text);
}

function flowMatchesMessage(flow, text) {
  const haystack = serviceText({
    nombre: flow?.selectedServiceName,
    categoria: flow?.selectedCategory
  });
  const tokens = normalizeForNcie(text)
    .split(/\s+/)
    .filter((token) => token.length > 3 && !['continuemos', 'continuamos', 'sigamos', 'retomemos', 'volvamos'].includes(token));
  return tokens.some((token) => haystack.includes(token));
}

export function detectTopicSwitch({ normalizedMessage, plannerState, retrieval = null } = {}) {
  const text = normalizeForNcie(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '');
  const active = (plannerState?.flows ?? []).find((flow) => flow.id === plannerState?.activeFlowId) ?? null;

  const resumable = (plannerState?.flows ?? [])
    .filter((flow) => flow.id !== active?.id)
    .find((flow) => flowMatchesMessage(flow, text));

  if (isResumeRequest(text) && resumable) {
    return { changed: true, resumeFlow: resumable, newService: null };
  }

  if (!active) {
    return { changed: false, resumeFlow: null, newService: null };
  }

  const topService = retrieval?.services?.[0] ?? null;
  const activeScore = scoreServiceAgainstMessage({ nombre: active.selectedServiceName }, text);
  const topScore = Number(topService?.score ?? 0);
  const pointsToDifferentService = topService && topService.id !== active.selectedServiceId && topScore > 0 && activeScore === 0;

  return {
    changed: Boolean(pointsToDifferentService),
    resumeFlow: null,
    newService: pointsToDifferentService ? topService : null
  };
}
