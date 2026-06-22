export const BUSINESS_TYPES = {
  PRODUCTS: 'PRODUCTOS',
  SERVICES: 'SERVICIOS',
  MIXED: 'MIXTO'
};

export function normalizeBusinessType(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');

  if (['PRODUCTO', 'PRODUCTOS', 'TIENDA', 'ECOMMERCE'].includes(normalized)) {
    return BUSINESS_TYPES.PRODUCTS;
  }

  if (['SERVICIO', 'SERVICIOS'].includes(normalized)) {
    return BUSINESS_TYPES.SERVICES;
  }

  return BUSINESS_TYPES.MIXED;
}

export function hasProductResults(toolResult) {
  return Boolean(toolResult?.producto) || (toolResult?.productos?.length ?? 0) > 0;
}

export function hasServiceResults(toolResult) {
  return Boolean(toolResult?.servicio) || (toolResult?.servicios?.length ?? 0) > 0;
}

export function asProductSearchIntent(intent) {
  return {
    ...intent,
    intencion: 'BUSCAR_PRODUCTO',
    herramienta_mcp: 'buscar_productos',
    parametros: { ...(intent.parametros ?? {}) }
  };
}

export function asServiceSearchIntent(intent) {
  return {
    ...intent,
    intencion: 'BUSCAR_SERVICIO',
    herramienta_mcp: 'buscar_servicios',
    parametros: { ...(intent.parametros ?? {}) }
  };
}

export function searchTextFromIntent(intent, normalizedMessage, normalizeSearchText = (value) => value) {
  return intent.parametros?.texto
    ? normalizeSearchText(intent.parametros.texto)
    : normalizedMessage;
}
