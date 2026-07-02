import { normalizeForNcie } from '../message-normalizer.js';
import { COMMERCIAL_PLANNER_STAGES } from './commercial-state.schema.js';
import { parseDimensions } from './dimensions.parser.js';

export function extractDimensionsFromText(value) {
  const dimensions = parseDimensions(value);
  return dimensions?.area ? dimensions : null;
}

export function detectWebType(value) {
  const text = normalizeForNcie(value);
  if (/\b(pedido|pedidos|ordenes|comprar|ventas|tienda|ecommerce|carrito)\b/.test(text)) return 'pedidos';
  if (/\b(catalogo|productos|servicios)\b/.test(text)) return 'catalogo';
  if (/\b(informativa|informacion|presentacion|landing)\b/.test(text)) return 'informativa';
  return null;
}

export function detectDesignPreference(value) {
  const text = normalizeForNcie(value);
  if (/\b(con diseno|con el diseno|tambien con el diseno|tambien diseno|tambien el diseno|apoyo con el diseno|ayuda con el diseno|quiero diseno|quiero un diseno|necesito diseno|necesito un diseno|no tengo diseno|no tengo el diseno|no tengo un diseno)\b/.test(text)) return true;
  if (/\b(sin diseno|sin el diseno|no quiero diseno|no necesito diseno|ya tengo diseno|ya tengo el diseno|ya tengo un diseno|tengo diseno|tengo el diseno|tengo un diseno|yo tengo el diseno|yo tengo un diseno)\b/.test(text)) return false;
  return null;
}

export function detectInstallationPreference(value) {
  const text = normalizeForNcie(value);
  if (/\b(solo impresion|solo la impresion|sin instalacion|no instalacion|no necesito instalacion|no quiero instalacion)\b/.test(text)) return false;
  if (/\b(con instalacion|necesito instalacion|quiero instalacion|tambien instalacion)\b/.test(text)) return true;
  return null;
}

function serviceNeedsMeasurements(service = null) {
  const priceType = normalizeForNcie(service?.tipo_precio);
  const unit = normalizeForNcie(service?.unidad_medida);
  return Boolean(service?.requiere_medidas) || priceType.includes('m2') || unit.includes('m2') || priceType.includes('por_m2');
}

function serviceNeedsQuantity(service = null) {
  return Boolean(service?.requiere_cantidad);
}

function serviceNeedsBudget(service = null) {
  return normalizeForNcie(service?.tipo_precio) === 'cotizacion';
}

function detectBudget(value, { hasDimensions = false } = {}) {
  if (hasDimensions) return null;
  const text = normalizeForNcie(value);
  const match = text.match(/\$?\s*(\d{2,7}(?:[.,]\d{1,2})?)\s*(?:pesos|mxn)?\b/);
  if (!match) return null;
  const budget = Number(match[1].replace(',', '.'));
  return Number.isFinite(budget) && budget > 0 ? budget : null;
}

function serviceLooksLikeWeb(service = null) {
  if (service?.explicitServiceName === 'Diseno web') return true;
  const name = normalizeForNcie(service?.nombre ?? service?.selectedServiceName ?? '');
  if (/\b(marketing digital|publicidad digital|redes sociales|campanas digitales)\b/.test(name)) return false;
  const text = normalizeForNcie(`${service?.nombre ?? ''} ${service?.descripcion ?? ''} ${service?.categoria ?? ''}`);
  return /\b(web|pagina|sitio|landing|ecommerce|tienda en linea)\b/.test(text);
}

function sameService(flow = null, service = null) {
  if (!flow || !service) return true;
  if (flow.selectedServiceId && service.id) return String(flow.selectedServiceId) === String(service.id);
  if (flow.selectedServiceName && service.nombre) {
    return normalizeForNcie(flow.selectedServiceName) === normalizeForNcie(service.nombre);
  }
  return true;
}

export function detectMissingInformation({ flow = null, selectedService = null, normalizedMessage = null, resetEntities = false, allowInstallationPreference = true, interpretedEntities = null } = {}) {
  const service = selectedService ?? {
    id: flow?.selectedServiceId,
    nombre: flow?.selectedServiceName,
    categoria: flow?.selectedCategory,
    tipo_precio: flow?.servicePriceType,
    requiere_medidas: flow?.requiresMeasurements,
    requiere_cantidad: flow?.requiresQuantity
  };
  const entities = !resetEntities && sameService(flow, service) ? { ...(flow?.entities ?? {}) } : {};
  const messageText = normalizedMessage?.original ?? normalizedMessage?.raw ?? normalizedMessage?.normalized ?? '';
  const detectedDimensions = extractDimensionsFromText(messageText);
  const detectedWebType = detectWebType(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '');
  const detectedDesignPreference = detectDesignPreference(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '');
  const detectedInstallationPreference = allowInstallationPreference
    ? detectInstallationPreference(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '')
    : null;
  const detectedBudget = detectBudget(messageText, { hasDimensions: Boolean(detectedDimensions) });
  const webService = serviceLooksLikeWeb(service);

  if (detectedDimensions) entities.dimensions = detectedDimensions;
  if (detectedWebType && webService) entities.webType = detectedWebType;
  if (detectedDesignPreference !== null) {
    entities.design = detectedDesignPreference;
    entities.designSupport = detectedDesignPreference;
  }
  if (detectedInstallationPreference !== null) entities.installation = detectedInstallationPreference;
  if (detectedBudget !== null) entities.budget = detectedBudget;
  if (interpretedEntities && typeof interpretedEntities === 'object') {
    Object.assign(entities, interpretedEntities);
  }
  if (!serviceNeedsMeasurements(service) && !detectedDimensions) delete entities.dimensions;
  if (!webService) delete entities.webType;

  const missing = [];
  if (serviceNeedsMeasurements(service) && (!entities.dimensions || entities.dimensions?.incomplete)) missing.push('medidas');
  if (serviceNeedsQuantity(service) && !entities.quantity) missing.push('cantidad');
  if (serviceNeedsBudget(service) && !serviceNeedsMeasurements(service) && !entities.budget) missing.push('presupuesto');
  if (webService && !entities.webType) missing.push('tipo_web');

  const stage = missing.includes('medidas')
    ? COMMERCIAL_PLANNER_STAGES.WAITING_MEASUREMENTS
    : missing.includes('cantidad')
      ? COMMERCIAL_PLANNER_STAGES.WAITING_QUANTITY
    : missing.includes('presupuesto')
      ? COMMERCIAL_PLANNER_STAGES.WAITING_BUDGET
    : missing.includes('tipo_web')
      ? COMMERCIAL_PLANNER_STAGES.WAITING_WEB_TYPE
      : service?.id || service?.nombre
        ? COMMERCIAL_PLANNER_STAGES.COLLECTING_REQUIREMENTS
        : COMMERCIAL_PLANNER_STAGES.EXPLORING;

  return {
    entities,
    missing,
    stage,
    detectedDimensions,
    detectedWebType: webService ? detectedWebType : null,
    detectedDesignPreference,
    detectedInstallationPreference,
    detectedBudget
  };
}
