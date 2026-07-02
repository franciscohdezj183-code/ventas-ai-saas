import { normalizeForNcie } from './message-normalizer.js';

export const SEMANTIC_VERTICALS = [
  {
    key: 'refrigeracion',
    categoryTerms: ['refrigeracion', 'linea blanca', 'tecnico', 'diagnostico'],
    symptoms: ['no enfria', 'no congela', 'tira agua', 'hace ruido', 'falla de enfriamiento'],
    synonyms: ['refrigerador', 'refri', 'nevera', 'congelador'],
    related: ['reparacion', 'mantenimiento', 'servicio tecnico']
  },
  {
    key: 'plomeria',
    categoryTerms: ['plomeria', 'tuberia', 'bano', 'instalacion hidraulica'],
    symptoms: ['fuga', 'gotea', 'tapado', 'debajo del lavabo'],
    synonyms: ['lavabo', 'tarja', 'llave', 'drenaje'],
    related: ['reparacion', 'mantenimiento', 'destape']
  },
  {
    key: 'camaras',
    categoryTerms: ['seguridad', 'cctv', 'videovigilancia'],
    symptoms: ['poner camaras', 'instalar camaras', 'quiero camaras'],
    synonyms: ['camara', 'camaras', 'cctv'],
    related: ['instalacion', 'monitoreo', 'sistema de seguridad']
  },
  {
    key: 'computadoras',
    categoryTerms: ['computadoras', 'soporte tecnico', 'sistemas'],
    symptoms: ['compu lenta', 'computadora lenta', 'se traba', 'virus', 'no prende'],
    synonyms: ['compu', 'computadora', 'laptop', 'pc'],
    related: ['mantenimiento', 'reparacion', 'diagnostico']
  },
  {
    key: 'contabilidad',
    categoryTerms: ['contabilidad', 'fiscal', 'impuestos'],
    symptoms: ['declarar impuestos', 'declaracion', 'sat', 'facturas'],
    synonyms: ['contador', 'impuestos', 'declarar', 'declaracion'],
    related: ['asesoria fiscal', 'servicios contables']
  },
  {
    key: 'dental',
    categoryTerms: ['dental', 'odontologia', 'dentista'],
    symptoms: ['dolor de muela', 'me duele una muela', 'dolor dental', 'encia inflamada'],
    synonyms: ['muela', 'diente', 'dentista', 'consulta dental'],
    related: ['consulta', 'valoracion', 'urgencia dental']
  },
  {
    key: 'instalacion',
    categoryTerms: ['instalacion', 'mantenimiento', 'revision'],
    symptoms: ['revisar mi instalacion', 'vengan a revisar', 'revision tecnica'],
    synonyms: ['instalacion', 'revision', 'mantenimiento'],
    related: ['diagnostico', 'visita', 'tecnico']
  },
  {
    key: 'publicidad',
    categoryTerms: ['publicidad', 'marketing', 'promocionales', 'rotulacion', 'senaletica', 'impresion', 'banners'],
    symptoms: ['anunciar negocio', 'promocionar negocio', 'dar a conocer mi negocio', 'atraer clientes'],
    synonyms: ['anunciar', 'promocionar', 'publicitar', 'negocio', 'marca'],
    related: ['marketing digital', 'logotipo', 'identidad visual']
  }
];

export const CATEGORY_SYNONYMS = {
  regalo: ['detalle', 'obsequio', 'presente'],
  economico: ['barato', 'bajo costo', 'mas economico', 'oferta'],
  comedor: ['comedores', 'mesa comedor', 'antecomedor'],
  envio: ['entrega', 'domicilio', 'paqueteria']
};

function tokenVariants(term) {
  const normalized = normalizeForNcie(term);
  const variants = new Set([normalized]);

  for (const token of normalized.split(/\s+/)) {
    if (token.length > 4 && token.endsWith('es')) variants.add(token.slice(0, -2));
    if (token.length > 3 && token.endsWith('s')) variants.add(token.slice(0, -1));
  }

  return [...variants].filter(Boolean);
}

export function semanticTermsForText(text) {
  const normalized = normalizeForNcie(text);
  const matchedVerticals = SEMANTIC_VERTICALS.filter((vertical) => {
    const candidates = [
      vertical.key,
      ...vertical.categoryTerms,
      ...vertical.symptoms,
      ...vertical.synonyms,
      ...vertical.related
    ];
    return candidates.some((candidate) => normalized.includes(normalizeForNcie(candidate)));
  });
  const terms = new Set(normalized.split(/\s+/).filter((token) => token.length > 2));
  const reasons = [];

  for (const vertical of matchedVerticals) {
    reasons.push(`vertical:${vertical.key}`);
    [
      vertical.key,
      ...vertical.categoryTerms,
      ...vertical.symptoms,
      ...vertical.synonyms,
      ...vertical.related
    ].forEach((term) => tokenVariants(term).forEach((variant) => terms.add(variant)));
  }

  for (const [category, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
    if ([category, ...synonyms].some((term) => normalized.includes(normalizeForNcie(term)))) {
      reasons.push(`categoria:${category}`);
      [category, ...synonyms].forEach((term) => tokenVariants(term).forEach((variant) => terms.add(variant)));
    }
  }

  return {
    terms: [...terms],
    matchedVerticals: matchedVerticals.map((vertical) => vertical.key),
    reasons
  };
}

export function semanticHaystack(item) {
  return normalizeForNcie([
    item?.nombre,
    item?.descripcion,
    item?.categoria,
    item?.tipo,
    item?.sku
  ].filter(Boolean).join(' '));
}
