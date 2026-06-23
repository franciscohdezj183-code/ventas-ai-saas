const MXN_FORMATTER = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2
});

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNumber(value) {
  return Number(value).toLocaleString('es-MX', {
    maximumFractionDigits: 2
  });
}

export function formatMoney(value) {
  return MXN_FORMATTER.format(Number(value ?? 0));
}

function convertToMeters(value, unit) {
  const normalizedUnit = normalizeText(unit);
  return normalizedUnit.startsWith('cm') || normalizedUnit.startsWith('centimetro')
    ? value / 100
    : value;
}

export function extractMeasurement(message) {
  const normalized = normalizeText(message);
  const match = normalized.match(/(\d*\.?\d+)\s*(cm|centimetros|centimetro|m|metros|metro)?\s*(?:x|por)\s*(\d*\.?\d+)\s*(cm|centimetros|centimetro|m|metros|metro)?/i);

  if (!match) {
    return null;
  }

  const firstUnit = match[2] ?? match[4] ?? 'm';
  const secondUnit = match[4] ?? match[2] ?? 'm';
  const width = convertToMeters(Number(match[1]), firstUnit);
  const height = convertToMeters(Number(match[3]), secondUnit);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width,
    height,
    areaM2: width * height,
    label: `${formatNumber(width)} x ${formatNumber(height)} m`
  };
}

export function extractQuantity(message) {
  const normalized = normalizeText(message);
  const match = normalized.match(/\b(\d{1,6})\s*(?:piezas|pieza|pzs|pz|unidades|unidad|tarjetas)?\b/);

  if (!match) {
    return null;
  }

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function sentence(value) {
  const text = String(value ?? '').trim().replace(/\.$/, '');
  return text ? `${text}.` : '';
}

function includesText(service) {
  return sentence(service?.incluye ? `Incluye ${service.incluye}` : '');
}

function excludesText(service) {
  return sentence(service?.no_incluye ? `No incluye ${service.no_incluye}` : '');
}

function quoteDataPrompt(service) {
  const needs = [
    service?.requiere_medidas ? 'ancho y alto' : null,
    service?.requiere_cantidad ? 'cantidad' : null
  ].filter(Boolean);

  if (needs.length) {
    return ` Para cotizarlo necesito ${needs.join(' y ')}.`;
  }

  if (service?.notas_cotizacion) {
    return ` ${service.notas_cotizacion}`;
  }

  return ' Para cotizarlo necesito revisar los detalles del proyecto.';
}

function serviceLabel(service) {
  return String(service?.nombre ?? 'este servicio').trim();
}

function quantityAdvisorThreshold(service) {
  const notes = normalizeText(service?.notas_cotizacion);
  const match = notes.match(/(?:mas de|mayor(?:es)? a)\s*(\d{1,6})\s*(?:piezas|pieza|pzs|pz|unidades|unidad)?.*asesor/);
  return match ? Number(match[1]) : null;
}

function packageQuantity(service) {
  const source = normalizeText(`${service?.nombre ?? ''} ${service?.notas_cotizacion ?? ''}`);
  const match = source.match(/\b(\d{1,6})\s*(?:piezas|pieza|pzs|pz)\b/);
  return match ? Number(match[1]) : null;
}

export function buildCatalogServiceResponse({ service, message }) {
  if (!service) {
    return null;
  }

  const type = String(service.tipo_precio ?? 'FIJO').toUpperCase();
  const name = serviceLabel(service);
  const measurement = extractMeasurement(message);
  const quantity = extractQuantity(message);
  const includes = includesText(service);
  const excludes = excludesText(service);
  const details = [includes, excludes].filter(Boolean).join(' ');

  if (type === 'COTIZACION') {
    return [
      `Si, manejamos ${name}. Este servicio se cotiza con asesor segun los requerimientos.`,
      quoteDataPrompt(service).trim(),
      details,
      'Quieres que te contacte un asesor?'
    ].filter(Boolean).join(' ');
  }

  if (type === 'POR_M2' || service.requiere_medidas) {
    if (!measurement) {
      return [
        `Si, manejamos ${name} por m2.`,
        service.precio !== null && service.precio !== undefined ? `El precio es ${formatMoney(service.precio)} por m2.` : '',
        details,
        'Para cotizarlo necesito ancho y alto.'
      ].filter(Boolean).join(' ');
    }

    const area = measurement.areaM2;
    const total = area * Number(service.precio ?? 0);

    return [
      `Claro. La medida ${measurement.label} equivale a ${formatNumber(area)} m2.`,
      `El costo aproximado es ${formatMoney(total)}.`,
      details,
      'Quieres que te pase con un asesor para confirmar detalles?'
    ].filter(Boolean).join(' ');
  }

  if (type === 'DESDE') {
    return [
      `Si, manejamos ${name}. El precio va desde ${formatMoney(service.precio)}.`,
      'Puede cambiar segun detalles del servicio.',
      details,
      'Quieres que te pase con un asesor para confirmar detalles?'
    ].filter(Boolean).join(' ');
  }

  if (service.requiere_cantidad && !quantity) {
    return [
      `Si, manejamos ${name}. El precio es ${formatMoney(service.precio)}.`,
      details,
      'Para orientarte mejor, cuantas piezas o unidades necesitas?'
    ].filter(Boolean).join(' ');
  }

  if (service.requiere_cantidad && quantity) {
    const advisorThreshold = quantityAdvisorThreshold(service);

    if (advisorThreshold && quantity > advisorThreshold) {
      return [
        `Para ${quantity} piezas de ${name} se requiere una cotizacion con asesor.`,
        service.notas_cotizacion,
        'Quieres que te contacte un asesor?'
      ].filter(Boolean).join(' ');
    }

    const packageSize = packageQuantity(service);

    if (type === 'FIJO' && packageSize) {
      const packageCount = Math.ceil(quantity / packageSize);
      const total = packageCount * Number(service.precio ?? 0);
      const packageWord = packageCount === 1 ? 'paquete' : 'paquetes';

      return [
        `Para ${quantity} piezas necesitas ${packageCount} ${packageWord} de ${packageSize} piezas.`,
        `El costo aproximado es ${formatMoney(total)}.`,
        details,
        'Quieres que te pase con un asesor para confirmar detalles?'
      ].filter(Boolean).join(' ');
    }
  }

  const unit = type === 'POR_HORA'
    ? ' por hora'
    : type === 'POR_UNIDAD'
      ? ' por unidad'
      : '';
  const quantityText = quantity ? ` de ${quantity} piezas` : '';

  return [
    `${name}${quantityText} cuesta ${formatMoney(service.precio)}${unit}.`,
    details,
    'Quieres que te pase con un asesor para confirmar detalles?'
  ].filter(Boolean).join(' ');
}
