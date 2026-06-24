function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function titleCaseListItem(value) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function splitNeedItems(value) {
  return cleanText(value)
    .split(/\s*,\s*|\s+y\s+/i)
    .map(titleCaseListItem)
    .filter(Boolean);
}

export function parseRequestSummary(summary) {
  const text = cleanText(summary);

  if (!text || !text.includes(':')) {
    return {};
  }

  const fields = {};
  const segments = text.split(/\s*\|\s*/);

  for (const segment of segments) {
    const separatorIndex = segment.indexOf(':');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizeKey(segment.slice(0, separatorIndex));
    const value = cleanText(segment.slice(separatorIndex + 1));

    if (key && value) {
      fields[key] = value;
    }
  }

  return fields;
}

export function buildReadableOwnerNotification({
  title = 'Nuevo cliente requiere seguimiento',
  customerPhone,
  companyName,
  requestSummary,
  customerMessage,
  botResponse = null,
  botStatus = null,
  includeDecisionPrompt = false,
  footer = null,
  date = null
}) {
  const fields = parseRequestSummary(requestSummary);
  const clientName = fields.cliente || fields.nombre || null;
  const phone = fields.telefono || fields.telefono_cliente || customerPhone || null;
  const business = fields.negocio_del_cliente || fields.negocio || fields.empresa_del_cliente || null;
  const requestType = fields.solicitud || fields.tipo_solicitud || null;
  const summary = fields.resumen || null;
  const originalMessage = fields.mensaje || customerMessage || null;
  const rawNeed = fields.necesita || fields.interes || null;
  const needItems = splitNeedItems(rawNeed || requestSummary);
  const hasStructuredFields = Object.keys(fields).length > 0;

  const lines = [
    title,
    '',
    `Empresa: ${companyName || '-'}`,
    clientName ? `Cliente: ${clientName}` : `Cliente: ${phone || '-'}`,
    clientName && phone ? `Telefono: ${phone}` : null,
    business ? `Negocio del cliente: ${business}` : null,
    requestType ? `Tipo de solicitud: ${requestType}` : null,
    ''
  ];

  if (needItems.length > 0) {
    lines.push('Que necesita:');
    for (const item of needItems) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  } else if (requestSummary) {
    lines.push('Solicitud:');
    lines.push(requestSummary);
    lines.push('');
  }

  if (summary) {
    lines.push('Resumen para seguimiento:');
    lines.push(summary);
    lines.push('');
  } else if (!hasStructuredFields && requestSummary && requestSummary !== customerMessage) {
    lines.push('Resumen para seguimiento:');
    lines.push(requestSummary);
    lines.push('');
  }

  if (originalMessage) {
    lines.push('Mensaje original del cliente:');
    lines.push(`"${originalMessage}"`);
    lines.push('');
  }

  if (botStatus || botResponse) {
    lines.push('Estado del bot:');
    lines.push(botStatus || 'Sin estado registrado');

    if (botResponse) {
      lines.push(`Respuesta enviada: "${botResponse}"`);
    }

    lines.push('');
  }

  if (date) {
    lines.push(`Fecha: ${date}`);
    lines.push('');
  }

  if (includeDecisionPrompt) {
    lines.push('Puedes atenderlo ahora?');
    lines.push('');
    lines.push('Responde:');
    lines.push('1 = Si, yo lo atiendo');
    lines.push('2 = No puedo, que siga el bot');
  } else if (footer) {
    lines.push(footer);
  }

  return lines.filter((line) => line !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
