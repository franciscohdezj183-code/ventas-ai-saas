const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const ADDRESS_PATTERN = /\b(?:calle|av\.?|avenida|col\.?|colonia|cp|c\.p\.|numero|num\.?|no\.?|interior|int\.?)\s+[a-z0-9\s#.,-]{3,80}/gi;
const NAME_INTRO_PATTERN = /\b(me llamo|mi nombre es|soy|atiende a|a nombre de)\s+\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+){0,3}/giu;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;

export function anonymizeText(value) {
  if (value === null || value === undefined) return value;

  return String(value)
    .replace(EMAIL_PATTERN, '[email]')
    .replace(PHONE_PATTERN, '[telefono]')
    .replace(ADDRESS_PATTERN, '[direccion]')
    .replace(NAME_INTRO_PATTERN, (match, intro) => `${intro} [nombre]`)
    .replace(CARD_PATTERN, '[dato_personal]');
}

export function anonymizeEvaluation(row) {
  return {
    id: row.id,
    empresa_id: row.empresa_id,
    conversacion_id: row.conversacion_id,
    mensaje_cliente: anonymizeText(row.mensaje_cliente),
    respuesta_legacy: anonymizeText(row.respuesta_legacy),
    respuesta_ncie: anonymizeText(row.respuesta_ncie),
    intent_ncie: row.intent_ncie,
    confidence_ncie: Number(row.confidence_ncie ?? 0),
    retrieval_score: Number(row.retrieval_score ?? 0),
    decision_ncie: row.decision_ncie,
    tiempo_ncie_ms: Number(row.tiempo_ncie_ms ?? 0),
    legacy_dijo_no_contamos: Boolean(row.legacy_dijo_no_contamos),
    ncie_hizo_pregunta: Boolean(row.ncie_hizo_pregunta),
    ncie_encontro_opciones: Boolean(row.ncie_encontro_opciones),
    posible_mejora: Boolean(row.posible_mejora),
    posible_riesgo: Boolean(row.posible_riesgo),
    created_at: row.created_at
  };
}
