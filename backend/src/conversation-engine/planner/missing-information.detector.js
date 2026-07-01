import { normalizeForNcie } from '../message-normalizer.js';
import { COMMERCIAL_PLANNER_STAGES } from './commercial-state.schema.js';

export function extractDimensionsFromText(value) {
  const text = normalizeForNcie(value);
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:x|por|\*)\s*(\d+(?:[.,]\d+)?)/);
  if (!match) return null;

  const first = Number(match[1].replace(',', '.'));
  const second = Number(match[2].replace(',', '.'));
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

  return {
    alto: first,
    ancho: second,
    area: Number((first * second).toFixed(4)),
    text: `${match[1]}x${match[2]}`
  };
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
  if (/\b(sin diseno|sin el diseno|no quiero diseno|no necesito diseno|ya tengo diseno|ya tengo el diseno|tengo diseno|tengo el diseno|yo tengo el diseno)\b/.test(text)) return false;
  if (/\b(con diseno|tambien diseno|tambien el diseno|apoyo con el diseno|ayuda con el diseno|quiero diseno|necesito diseno)\b/.test(text)) return true;
  return null;
}

export function detectInstallationPreference(value) {
  const text = normalizeForNcie(value);
  if (/\b(sin instalacion|no instalacion|no necesito instalacion|no quiero instalacion)\b/.test(text)) return false;
  if (/\b(con instalacion|necesito instalacion|quiero instalacion|tambien instalacion)\b/.test(text)) return true;
  return null;
}

function serviceNeedsMeasurements(service = null) {
  const priceType = normalizeForNcie(service?.tipo_precio);
  const unit = normalizeForNcie(service?.unidad_medida);
  return Boolean(service?.requiere_medidas) || priceType.includes('m2') || unit.includes('m2') || priceType.includes('por_m2');
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

export function detectMissingInformation({ flow = null, selectedService = null, normalizedMessage = null, resetEntities = false, allowInstallationPreference = true } = {}) {
  const service = selectedService ?? {
    id: flow?.selectedServiceId,
    nombre: flow?.selectedServiceName,
    categoria: flow?.selectedCategory,
    tipo_precio: flow?.servicePriceType,
    requiere_medidas: flow?.requiresMeasurements
  };
  const entities = !resetEntities && sameService(flow, service) ? { ...(flow?.entities ?? {}) } : {};
  const detectedDimensions = extractDimensionsFromText(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '');
  const detectedWebType = detectWebType(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '');
  const detectedDesignPreference = detectDesignPreference(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '');
  const detectedInstallationPreference = allowInstallationPreference
    ? detectInstallationPreference(normalizedMessage?.normalized ?? normalizedMessage?.raw ?? '')
    : null;
  const webService = serviceLooksLikeWeb(service);

  if (detectedDimensions) entities.dimensions = detectedDimensions;
  if (detectedWebType && webService) entities.webType = detectedWebType;
  if (detectedDesignPreference !== null) {
    entities.design = detectedDesignPreference;
    entities.designSupport = detectedDesignPreference;
  }
  if (detectedInstallationPreference !== null) entities.installation = detectedInstallationPreference;
  if (!serviceNeedsMeasurements(service) && !detectedDimensions) delete entities.dimensions;
  if (!webService) delete entities.webType;

  const missing = [];
  if (serviceNeedsMeasurements(service) && !entities.dimensions) missing.push('medidas');
  if (webService && !entities.webType) missing.push('tipo_web');

  const stage = missing.includes('medidas')
    ? COMMERCIAL_PLANNER_STAGES.WAITING_MEASUREMENTS
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
    detectedInstallationPreference
  };
}
