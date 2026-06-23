const MXN_FORMATTER = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0
});

const SERVICE_RULES = [
  {
    key: 'lona',
    label: 'impresion de lona',
    aliases: ['lona', 'lonas', 'impresion de lona'],
    pricingType: 'M2',
    priceM2: 390,
    includes: 'Incluye diseno',
    excludes: 'no incluye instalacion'
  },
  {
    key: 'vinil_impreso',
    label: 'vinil impreso',
    aliases: ['vinil impreso'],
    pricingType: 'M2',
    priceM2: 390,
    includes: 'Incluye diseno',
    excludes: 'no incluye instalacion'
  },
  {
    key: 'vinil_rotulacion',
    label: 'vinil de rotulacion de color',
    aliases: ['vinil de rotulacion', 'rotulacion de color', 'vinil rotulacion'],
    pricingType: 'M2',
    priceM2: 400,
    includes: 'Incluye depilado y transfer',
    excludes: 'no incluye instalacion'
  },
  {
    key: 'vinil_reflejante',
    label: 'vinil reflejante',
    aliases: ['vinil reflejante', 'reflejante'],
    pricingType: 'M2',
    priceM2: 800,
    includes: 'Incluye depilado y transfer',
    excludes: 'no incluye instalacion'
  },
  {
    key: 'tarjetas',
    label: 'tarjetas de presentacion',
    aliases: ['tarjeta', 'tarjetas', 'tarjetas digitales', 'tarjetas de presentacion', 'presentacion'],
    pricingType: 'QUANTITY',
    fixedQuantities: new Map([[100, 297]]),
    advisorAbove: 500
  },
  {
    key: 'instalacion',
    label: 'instalacion',
    aliases: ['instalacion', 'instalar', 'con instalacion'],
    pricingType: 'ADVISOR',
    advisorReason: 'depende de ubicacion, superficie, medidas, material y complejidad de instalacion'
  },
  {
    key: 'logotipo',
    label: 'diseno de logotipo',
    aliases: ['logotipo', 'logotipos', 'logo', 'logos'],
    pricingType: 'ADVISOR',
    advisorReason: 'se revisa segun las necesidades de marca'
  },
  {
    key: 'identidad',
    label: 'identidad e imagen corporativa',
    aliases: ['identidad', 'imagen corporativa', 'identidad corporativa'],
    pricingType: 'ADVISOR',
    advisorReason: 'requiere revision personalizada con asesor'
  },
  {
    key: 'diseno_web',
    label: 'diseno web',
    aliases: ['diseno web', 'pagina web', 'web', 'sitio web'],
    pricingType: 'ADVISOR',
    advisorReason: 'se cotiza segun secciones y funciones'
  },
  {
    key: 'marketing',
    label: 'marketing digital',
    aliases: ['marketing digital', 'marketing', 'campana', 'campanas'],
    pricingType: 'ADVISOR',
    advisorReason: 'depende del objetivo, campana y presupuesto'
  },
  {
    key: 'senaletica',
    label: 'senaletica',
    aliases: ['senaletica', 'senalizacion', 'trovicel'],
    pricingType: 'ADVISOR',
    advisorReason: 'se maneja en distintos materiales y se cotiza con asesor'
  },
  {
    key: 'impresion_textil',
    label: 'impresion textil',
    aliases: ['impresion textil', 'serigrafia', 'dtf', 'vinil textil', 'textil'],
    pricingType: 'ADVISOR',
    advisorReason: 'se maneja serigrafia, DTF y vinil textil'
  },
  {
    key: 'promocionales',
    label: 'promocionales',
    aliases: ['promocionales', 'promocional', 'corte de vinil'],
    pricingType: 'ADVISOR',
    advisorReason: 'se manejan con serigrafia, DTF y corte de vinil'
  },
  {
    key: 'banner_arana',
    label: 'banner arana',
    aliases: ['banner arana', 'banner', 'arana', '60x160', '80x180'],
    pricingType: 'ADVISOR',
    advisorReason: 'hay medidas .60x1.60m y .80x1.80m, con lona o sin lona'
  }
];

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNumber(value) {
  return Number(value).toLocaleString('es-MX', {
    maximumFractionDigits: 2
  });
}

export function formatMoney(value) {
  return MXN_FORMATTER.format(Number(value));
}

export function detectServiceRule(message, fallbackKey = null) {
  const normalized = normalizeText(message);
  const matches = SERVICE_RULES
    .flatMap((rule) => rule.aliases.map((alias) => ({ rule, alias: normalizeText(alias) })))
    .filter(({ alias }) => normalized.includes(alias))
    .sort((left, right) => right.alias.length - left.alias.length);

  return matches[0]?.rule
    ?? SERVICE_RULES.find((rule) => rule.key === fallbackKey)
    ?? null;
}

export function getServiceRuleByKey(key) {
  return SERVICE_RULES.find((rule) => rule.key === key) ?? null;
}

export function extractMeasurement(message) {
  const normalized = normalizeText(message).replace(/,/g, '.');
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(cm|centimetros|centimetro|m|metros|metro)?\s*(?:x|por)\s*(\d+(?:\.\d+)?)\s*(cm|centimetros|centimetro|m|metros|metro)?/i);

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

  const areaM2 = width * height;

  return {
    width,
    height,
    areaM2,
    label: `${formatNumber(width)} x ${formatNumber(height)} m`
  };
}

export function extractQuantity(message) {
  const normalized = normalizeText(message);
  const match = normalized.match(/\b(\d{1,5})\s*(?:piezas|pieza|pzs|pz|tarjetas)?\b/);

  if (!match) {
    return null;
  }

  const quantity = Number(match[1]);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

export function buildServiceResponse({ rule, message, fallbackKey = null }) {
  const selectedRule = rule ?? detectServiceRule(message, fallbackKey);

  if (!selectedRule) {
    return null;
  }

  if (selectedRule.pricingType === 'M2') {
    const measurement = extractMeasurement(message);

    if (!measurement) {
      return {
        response: `Si, manejamos ${selectedRule.label}. ${selectedRule.includes} y cuesta ${formatMoney(selectedRule.priceM2)} por m2. ${capitalize(selectedRule.excludes)}. Que medida necesitas?`,
        serviceContext: { key: selectedRule.key, label: selectedRule.label, pricingType: selectedRule.pricingType }
      };
    }

    const total = measurement.areaM2 * selectedRule.priceM2;

    return {
      response: `Claro. ${capitalizeArticle(selectedRule.label)} de ${measurement.label} equivale a ${formatNumber(measurement.areaM2)} m2. El costo aproximado seria ${formatMoney(total)}. ${selectedRule.includes} y ${selectedRule.excludes}. Quieres que te comunique con un asesor para confirmar detalles?`,
      serviceContext: {
        key: selectedRule.key,
        label: selectedRule.label,
        pricingType: selectedRule.pricingType,
        measurement
      }
    };
  }

  if (selectedRule.pricingType === 'QUANTITY') {
    const quantity = extractQuantity(message);

    if (!quantity) {
      return {
        response: `Si, manejamos ${selectedRule.label}. 100 piezas cuestan ${formatMoney(297)}. Cuantas piezas necesitas?`,
        serviceContext: { key: selectedRule.key, label: selectedRule.label, pricingType: selectedRule.pricingType }
      };
    }

    if (quantity > selectedRule.advisorAbove) {
      return {
        response: `Para ${quantity} tarjetas conviene revisar la cotizacion con asesor, porque arriba de ${selectedRule.advisorAbove} piezas cambia segun cantidad y acabados. Te comunico con un asesor?`,
        serviceContext: { key: selectedRule.key, label: selectedRule.label, pricingType: selectedRule.pricingType, quantity }
      };
    }

    if (selectedRule.fixedQuantities.has(quantity)) {
      return {
        response: `${quantity} tarjetas cuestan ${formatMoney(selectedRule.fixedQuantities.get(quantity))}. Quieres que te comunique con un asesor para confirmar el pedido?`,
        serviceContext: { key: selectedRule.key, label: selectedRule.label, pricingType: selectedRule.pricingType, quantity }
      };
    }

    return {
      response: `Para ${quantity} tarjetas necesito que un asesor confirme precio segun cantidad y acabado. Te comunico con un asesor?`,
      serviceContext: { key: selectedRule.key, label: selectedRule.label, pricingType: selectedRule.pricingType, quantity }
    };
  }

  return {
    response: `Si, manejamos ${selectedRule.label}. Requiere cotizacion con asesor porque ${selectedRule.advisorReason}. Te comunico con un asesor?`,
    serviceContext: { key: selectedRule.key, label: selectedRule.label, pricingType: selectedRule.pricingType }
  };
}

function convertToMeters(value, unit) {
  const normalizedUnit = normalizeText(unit);
  return normalizedUnit.startsWith('cm') || normalizedUnit.startsWith('centimetro')
    ? value / 100
    : value;
}

function capitalize(value) {
  return `${String(value).charAt(0).toUpperCase()}${String(value).slice(1)}`;
}

function capitalizeArticle(label) {
  return label.startsWith('impresion') ? `una ${label}` : `un ${label}`;
}
