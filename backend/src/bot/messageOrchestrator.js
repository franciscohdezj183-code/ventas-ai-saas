import { FALLBACK_INTENT, interpretIntent, validateIntentJson } from '../ai/intentInterpreter.js';
import {
  findConversationContext,
  saveConversationContext
} from './conversationContext.service.js';
import { notifyOwnerForLead, shouldNotifyOwner } from './notification.service.js';
import {
  hasActiveHandoff,
  requestHandoff
} from './humanHandoffManager.js';
import { getBotResponseProfile } from '../modules/bot-prompts/bot-prompts.service.js';
import { registerAIUsage } from '../modules/ai-usage/ai-usage.service.js';
import { mcpClient as defaultMcpClient } from '../mcp/mcpClient.js';
import { getBusinessStrategy } from './business-types/business-strategy.factory.js';
import {
  buildCatalogServiceResponse,
  formatMoney
} from './business-types/service-pricing.helper.js';
import { normalizeMexicanPhoneNumber } from '../whatsapp/whatsapp-number.helper.js';

function normalizePhone(value) {
  return normalizeMexicanPhoneNumber(value);
}

function configuredSynonymEntries(synonyms) {
  if (!synonyms || typeof synonyms !== 'object' || Array.isArray(synonyms)) {
    return [];
  }

  return Object.entries(synonyms)
    .flatMap(([target, aliases]) => {
      const values = Array.isArray(aliases) ? aliases : [aliases];
      return values.map((alias) => [String(alias ?? '').trim(), String(target ?? '').trim()]);
    })
    .filter(([alias, target]) => alias && target);
}

function normalizarTextoBusqueda(value, synonyms = null) {
  const replacements = new Map([
    ['ke', 'que'],
    ['q', 'que'],
    ['k', 'que'],
    ['kiero', 'quiero'],
    ['kiro', 'quiero'],
    ['qiero', 'quiero'],
    ['komprar', 'comprar'],
    ['conprar', 'comprar'],
    ['presio', 'precio'],
    ['prcio', 'precio'],
    ['presios', 'precios'],
    ['kuanto', 'cuanto'],
    ['cuantoo', 'cuanto'],
    ['tines', 'tienes'],
    ['tenes', 'tienes'],
    ['ay', 'hay'],
    ['envioo', 'envio'],
    ['embio', 'envio'],
    ['asesr', 'asesor'],
    ['asessor', 'asesor'],
    ['sya', 'silla'],
    ['siya', 'silla'],
    ['siyas', 'sillas'],
    ['sillaz', 'sillas'],
    ['sila', 'silla'],
    ['madra', 'madera'],
    ['mdera', 'madera'],
    ['maderaa', 'madera'],
    ['plasticoo', 'plastico'],
    ['plastik', 'plastico'],
    ['mesaz', 'mesas'],
    ['meza', 'mesa'],
    ['mezas', 'mesas']
  ]);

  for (const [alias, target] of configuredSynonymEntries(synonyms)) {
    replacements.set(
      alias.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      target.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
  }

  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:()[\]{}"'`´]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => replacements.get(word) ?? word)
    .join(' ');
}

const SERVICE_SEARCH_STOP_WORDS = new Set([
  'ancho',
  'alto',
  'costo',
  'cotizame',
  'cuanto',
  'cuesta',
  'cuales',
  'de',
  'del',
  'el',
  'en',
  'hola',
  'la',
  'las',
  'los',
  'm',
  'metro',
  'metros',
  'por',
  'precio',
  'que',
  'quiero',
  'sale',
  'servicio',
  'servicios',
  'tienen',
  'una',
  'un',
  'x'
]);

function serviceSearchTokens(value, synonyms = null) {
  return normalizarTextoBusqueda(value, synonyms)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !SERVICE_SEARCH_STOP_WORDS.has(token));
}

function isGenericServiceCatalogRequest(message) {
  const normalized = normalizarTextoBusqueda(message);
  const tokens = serviceSearchTokens(message);

  return tokens.length === 0 && /\b(servicio|servicios|hacen|ofrecen|manejan|tienen)\b/.test(normalized);
}

function rankServicesForMessage(services, message, synonyms = null) {
  if (!Array.isArray(services) || services.length <= 1) {
    return services;
  }

  const tokens = serviceSearchTokens(message, synonyms);

  if (tokens.length === 0) {
    return services;
  }

  return services
    .map((service, index) => {
      const name = normalizarTextoBusqueda(service?.nombre, synonyms);
      const description = normalizarTextoBusqueda(service?.descripcion, synonyms);
      const category = normalizarTextoBusqueda(service?.categoria, synonyms);
      const haystack = `${name} ${description} ${category}`;
      const queryPhrase = tokens.join(' ');
      const phraseScore = queryPhrase && name === queryPhrase
        ? 18
        : queryPhrase && name.startsWith(queryPhrase)
          ? 12
          : queryPhrase && name.includes(queryPhrase)
            ? 6
            : 0;
      const score = phraseScore + tokens.reduce((total, token) => {
        if (name.split(/\s+/).includes(token)) {
          return total + 6;
        }

        if (category.split(/\s+/).includes(token)) {
          return total + 3;
        }

        if (haystack.includes(token)) {
          return total + 1;
        }

        return total;
      }, 0);

      return { service, index, score, nameTokens: name.split(/\s+/).filter(Boolean).length };
    })
    .sort((left, right) => right.score - left.score || left.nameTokens - right.nameTokens || left.index - right.index)
    .map((entry) => entry.service);
}

function prepareServiceToolResult(toolResult, { message, synonyms = null, catalogRequest = false } = {}) {
  if (!toolResult || typeof toolResult !== 'object') {
    return toolResult;
  }

  const nextResult = { ...toolResult };

  if (Array.isArray(nextResult.servicios)) {
    nextResult.servicios = rankServicesForMessage(nextResult.servicios, message, synonyms);
  }

  if (catalogRequest) {
    nextResult.solicitud_catalogo_servicios = true;
  }

  return nextResult;
}

function responseEmoji(profile, key, fallback = '') {
  return profile?.usar_emojis === false ? '' : profile?.emojis?.[key] ?? fallback;
}

function configuredText(profile, key, fallback) {
  const value = String(profile?.[key] ?? '').trim();
  return value || fallback;
}

function normalizeGreetingText(value) {
  const text = String(value ?? '').trim();
  const normalized = normalizarTextoBusqueda(text);

  if (normalized === 'hola mucho gusto') {
    return 'Hola, mucho gusto.';
  }

  return text;
}

function configuredFallback(companyContext = {}) {
  return companyContext.fallback_message || 'Puedo ayudarte con productos, servicios y atencion comercial. Dime que estas buscando.';
}

const BUSINESS_TIME_ZONE = 'America/Mexico_City';
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DAY_ALIASES = new Map([
  ['domingo', 0],
  ['dom', 0],
  ['d', 0],
  ['lunes', 1],
  ['lun', 1],
  ['l', 1],
  ['martes', 2],
  ['mar', 2],
  ['ma', 2],
  ['miercoles', 3],
  ['mier', 3],
  ['mie', 3],
  ['mi', 3],
  ['miércoles', 3],
  ['jueves', 4],
  ['jue', 4],
  ['j', 4],
  ['viernes', 5],
  ['vie', 5],
  ['v', 5],
  ['sabado', 6],
  ['sab', 6],
  ['s', 6],
  ['sábado', 6]
]);

function normalizeScheduleText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function zonedNowParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday] ?? null;

  return {
    weekday,
    minutes: (Number(parts.hour) * 60) + Number(parts.minute)
  };
}

function minutesFromTime(hour, minute = '0', meridiem = '') {
  let nextHour = Number(hour);
  const nextMinute = Number(minute ?? 0);
  const suffix = String(meridiem ?? '').toLowerCase();

  if (!Number.isInteger(nextHour) || !Number.isInteger(nextMinute) || nextHour < 0 || nextHour > 24 || nextMinute < 0 || nextMinute > 59) {
    return null;
  }

  if (suffix === 'pm' && nextHour < 12) {
    nextHour += 12;
  }

  if (suffix === 'am' && nextHour === 12) {
    nextHour = 0;
  }

  if (nextHour === 24 && nextMinute > 0) {
    return null;
  }

  return Math.min((nextHour * 60) + nextMinute, 24 * 60);
}

function dayNumber(value) {
  return DAY_ALIASES.get(normalizeScheduleText(value));
}

function daysBetween(startDay, endDay) {
  if (!Number.isInteger(startDay) || !Number.isInteger(endDay)) {
    return [];
  }

  const days = [];
  let day = startDay;

  for (let index = 0; index < 7; index += 1) {
    days.push(day);

    if (day === endDay) {
      break;
    }

    day = (day + 1) % 7;
  }

  return days;
}

function extractScheduleDays(section) {
  const text = normalizeScheduleText(section);

  if (/\b(diario|todos los dias|toda la semana)\b/.test(text)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  if (/\bl\s*(?:a|-)\s*v\b/.test(text)) {
    return [1, 2, 3, 4, 5];
  }

  if (/\bl\s*(?:a|-)\s*s\b/.test(text)) {
    return [1, 2, 3, 4, 5, 6];
  }

  const dayPattern = '(domingo|dom|lunes|lun|martes|mar|miercoles|mier|mie|jueves|jue|viernes|vie|sabado|sab)';
  const rangeMatch = text.match(new RegExp(`\\b${dayPattern}\\s*(?:a|-)\\s*${dayPattern}\\b`));

  if (rangeMatch) {
    return daysBetween(dayNumber(rangeMatch[1]), dayNumber(rangeMatch[2]));
  }

  const days = [...text.matchAll(new RegExp(`\\b${dayPattern}\\b`, 'g'))]
    .map((match) => dayNumber(match[1]))
    .filter((day) => Number.isInteger(day));

  return [...new Set(days)];
}

function extractScheduleRanges(section) {
  const ranges = [];
  const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:a|-|hasta)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
  let match = timePattern.exec(section);

  while (match) {
    const start = minutesFromTime(match[1], match[2] ?? '0', match[3] ?? '');
    const end = minutesFromTime(match[4], match[5] ?? '0', match[6] ?? match[3] ?? '');

    if (start !== null && end !== null && start !== end) {
      ranges.push({ start, end });
    }

    match = timePattern.exec(section);
  }

  return ranges;
}

function parseBusinessSchedule(value) {
  const text = normalizeScheduleText(value);

  if (!text) {
    return null;
  }

  if (/\b(24\/7|24 horas|siempre abierto)\b/.test(text)) {
    return [{ days: [0, 1, 2, 3, 4, 5, 6], ranges: [{ start: 0, end: 24 * 60 }] }];
  }

  if (/\b(cerrado|sin horario)\b/.test(text) && !/\d/.test(text)) {
    return [];
  }

  const sections = text.split(/(?:;|\n|,\s*(?=(?:dom|lun|mar|mie|jue|vie|sab|domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b))/i);
  const parsedSections = sections
    .map((section) => ({
      days: extractScheduleDays(section),
      ranges: extractScheduleRanges(section)
    }))
    .filter((section) => section.ranges.length > 0);

  if (parsedSections.length === 0) {
    const ranges = extractScheduleRanges(text);

    return ranges.length > 0
      ? [{ days: [1, 2, 3, 4, 5], ranges }]
      : null;
  }

  return parsedSections.map((section) => ({
    days: section.days.length > 0 ? section.days : [1, 2, 3, 4, 5],
    ranges: section.ranges
  }));
}

function isWithinRange(minutes, range) {
  if (range.end > range.start) {
    return minutes >= range.start && minutes < range.end;
  }

  return minutes >= range.start || minutes < range.end;
}

function isWithinBusinessHours(horarioAtencion, date = new Date()) {
  const schedule = parseBusinessSchedule(horarioAtencion);

  if (schedule === null) {
    return true;
  }

  const now = zonedNowParts(date);

  return schedule.some((section) => (
    section.days.includes(now.weekday)
    && section.ranges.some((range) => isWithinRange(now.minutes, range))
  ));
}

function formatMinutesAsTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function nextOpeningDescription(horarioAtencion, date = new Date()) {
  const schedule = parseBusinessSchedule(horarioAtencion);

  if (!schedule || schedule.length === 0) {
    return 'hasta el siguiente dia habil';
  }

  const now = zonedNowParts(date);
  let nextOpening = null;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const weekday = (now.weekday + dayOffset) % 7;

    for (const section of schedule) {
      if (!section.days.includes(weekday)) {
        continue;
      }

      for (const range of section.ranges) {
        if (dayOffset === 0 && range.start <= now.minutes) {
          continue;
        }

        const candidate = {
          dayOffset,
          weekday,
          minutes: range.start
        };

        if (
          !nextOpening
          || candidate.dayOffset < nextOpening.dayOffset
          || (candidate.dayOffset === nextOpening.dayOffset && candidate.minutes < nextOpening.minutes)
        ) {
          nextOpening = candidate;
        }
      }
    }

    if (nextOpening) {
      break;
    }
  }

  if (!nextOpening) {
    return 'hasta el siguiente dia habil';
  }

  const time = formatMinutesAsTime(nextOpening.minutes);

  if (nextOpening.dayOffset === 0) {
    return `hoy a las ${time}`;
  }

  if (nextOpening.dayOffset === 1) {
    return `manana a las ${time}`;
  }

  return `el ${DAY_NAMES[nextOpening.weekday]} a las ${time}`;
}

function buildAfterHoursAdvisorResponse(companyContext = {}, date = new Date()) {
  const configured = String(companyContext.mensaje_fuera_horario ?? '').trim();
  const advisorAvailability = `Un asesor podra atenderte ${nextOpeningDescription(companyContext.horario_atencion, date)}. Mientras tanto puedo seguir ayudandote por aqui.`;

  if (configured) {
    return `${configured}\n${advisorAvailability}`;
  }

  if (companyContext.horario_atencion) {
    return `En este momento estamos fuera de horario. ${advisorAvailability} Nuestro horario de atencion es: ${companyContext.horario_atencion}.`;
  }

  return `En este momento estamos fuera de horario. ${advisorAvailability}`;
}

function parseBlockedTopics(value) {
  return String(value ?? '')
    .split(/[\n,;]+/)
    .map((item) => normalizarTextoBusqueda(item).trim())
    .filter(Boolean);
}

function matchesBlockedTopic(message, blockedTopics) {
  const normalizedMessage = normalizarTextoBusqueda(message);
  return blockedTopics.some((topic) => normalizedMessage.includes(topic));
}

function parseFaqEntries(value) {
  return String(value ?? '')
    .split(/\n{2,}/)
    .map((block) => {
      const inlineMatch = block.match(/^(?:p(?:regunta)?\s*[:.-]\s*)?(.+?)\s*[:?]\s*(?:r(?:espuesta)?\s*[:.-]\s*)?(.+)$/is);

      if (inlineMatch) {
        return {
          question: inlineMatch[1].trim(),
          answer: inlineMatch[2].trim()
        };
      }

      const [question, ...answerParts] = block.split(/\n/);
      return {
        question: String(question ?? '').replace(/^p(regunta)?\s*[:.-]?\s*/i, '').trim(),
        answer: answerParts.join('\n').replace(/^r(espuesta)?\s*[:.-]?\s*/i, '').trim()
      };
    })
    .filter((entry) => entry.question && entry.answer);
}

function findFaqAnswer(message, faqText) {
  const normalizedMessage = normalizarTextoBusqueda(message);
  const messageWords = new Set(normalizedMessage.split(' ').filter((word) => word.length > 3));

  return parseFaqEntries(faqText).find((entry) => {
    const normalizedQuestion = normalizarTextoBusqueda(entry.question);

    if (normalizedMessage.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedMessage)) {
      return true;
    }

    const questionWords = normalizedQuestion.split(' ').filter((word) => word.length > 3);
    const matches = questionWords.filter((word) => messageWords.has(word)).length;

    return questionWords.length > 0 && matches / questionWords.length >= 0.6;
  })?.answer ?? null;
}

function applyResponseTemplate(template, replacements) {
  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value ?? ''),
    template
  );
}

function buildProductResponse(result, profile = {}) {
  const product = result?.producto;
  const products = result?.productos ?? [];

  if (product) {
    const price = Number(product.precio).toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });
    const stock = Number(product.stock) > 0 ? product.stock : 'sin stock disponible';
    const details = [
      `*${product.nombre}*`,
      '',
      `💰 Precio: ${price}`,
      `📦 Disponibles: ${stock}`,
      product.categoria ? `📂 Categoría: ${product.categoria}` : null,
      '',
      'Puedes responder "apartalo" para registrar el apartado, "mas opciones" para seguir viendo productos o "asesor" para atencion personalizada.'
    ].filter(Boolean);

    return details.join('\n');
  }

  if (!products.length) {
    return applyResponseTemplate(
      profile.mensaje_sin_resultados ?? '{emoji_principal} Por ahora no encontre ese producto exacto.\nPuedes escribirme otra categoria, pedir "categorias" o responder "asesor" para que alguien te ayude.',
      { emoji_principal: responseEmoji(profile, 'principal', '') }
    ).trim();
  }

  const productLines = products.map((product, index) => {
    const price = Number(product.precio).toLocaleString('es-MX', {
      style: 'currency',
      currency: 'MXN'
    });
    const stock = Number(product.stock) > 0 ? `${product.stock} disponibles` : 'sin stock disponible';

    return [
      `${index + 1}. ${product.nombre}`,
      `   💰 Precio: ${price}`,
      `   📦 Stock: ${stock}`
    ].join('\n');
  });

  return applyResponseTemplate(
    profile.formato_respuesta ?? '{emoji_principal} Claro, encontre estas opciones para ti:\n\n{items}\n\nResponde con el numero para ver detalle, por ejemplo: 1.\nTambien puedes escribir "mas opciones", "apartalo", "categorias" o "asesor".',
    {
      emoji_principal: responseEmoji(profile, 'principal', ''),
      items: productLines.join('\n\n')
    }
  ).trim();
}

function buildProductMedia(result, caption = '') {
  const products = result?.producto ? [result.producto] : result?.productos ?? [];

  return products
    .filter((product) => product?.imagen)
    .slice(0, 3)
    .map((product) => ({
      type: 'image',
      url: product.imagen,
      caption: caption || product.nombre
    }));
}

function buildServiceResponse(result, profile = {}) {
  const services = result?.servicios ?? [];
  const service = result?.servicio;
  const customerMessage = result?.mensaje_original ?? result?.mensaje_cliente ?? result?.message ?? '';
  const isCatalogRequest = Boolean(result?.solicitud_catalogo_servicios) || isGenericServiceCatalogRequest(customerMessage);

  function buildInstallationResponse(currentService) {
    if (!isInstallationFollowUp(customerMessage)) {
      return null;
    }

    const includes = normalizarTextoBusqueda(currentService?.incluye);
    const excludes = normalizarTextoBusqueda(currentService?.no_incluye);
    const name = String(currentService?.nombre ?? 'este servicio').trim();

    if (excludes.includes('instalacion')) {
      return `No, el precio de ${name} no incluye instalacion. Puedo pasarte con un asesor para cotizarla.`;
    }

    if (includes.includes('instalacion')) {
      return `Si, el precio de ${name} incluye instalacion.`;
    }

    return `La ficha de ${name} no especifica si incluye instalacion. Puedo pasarte con un asesor para confirmarlo.`;
  }

  function formatServicePrice(currentService) {
    const type = String(currentService.tipo_precio ?? 'FIJO').toUpperCase();

    if (type === 'COTIZACION') {
      return 'cotizacion con asesor';
    }

    const price = formatMoney(currentService.precio);

    if (type === 'DESDE') {
      return `desde ${price}`;
    }

    if (type === 'POR_M2') {
      return `${price} por m2`;
    }

    if (type === 'POR_UNIDAD') {
      return `${price} por unidad`;
    }

    if (type === 'POR_HORA') {
      return `${price} por hora`;
    }

    return price;
  }

  if (service) {
    return buildInstallationResponse(service)
      ?? buildCatalogServiceResponse({ service, message: customerMessage });
  }

  if (services.length === 0) {
    return applyResponseTemplate(
      profile.mensaje_sin_resultados ?? '{emoji_principal} Por ahora no encontre ese servicio exacto.\nPuedo revisar una opcion similar o pasarte con un asesor.',
      { emoji_principal: responseEmoji(profile, 'principal', '') }
    ).trim();
  }

  if (!isCatalogRequest) {
    return buildInstallationResponse(services[0])
      ?? buildCatalogServiceResponse({ service: services[0], message: customerMessage });
  }

  const lines = services.map((service) => {
    const price = formatServicePrice(service);
    const duration = service.duracion ? `, duracion ${service.duracion} min` : '';
    const requiredData = [
      service.requiere_medidas ? 'requiere medidas' : null,
      service.requiere_cantidad ? 'requiere cantidad' : null
    ].filter(Boolean);
    const requiredDataText = requiredData.length ? `, ${requiredData.join(' y ')}` : '';
    return `- ${service.nombre}: ${price}${duration}${requiredDataText}`;
  });

  return [
    `${responseEmoji(profile, 'principal', '')} Claro, estos servicios pueden interesarte:`.trim(),
    ...lines,
    'Responde con el servicio que quieres revisar o te paso con un asesor.'
  ].join('\n');
}

function buildCategoriesResponse(result) {
  const categories = result?.categorias ?? [];

  if (categories.length === 0) {
    return 'Por ahora no hay categorias configuradas. Dime el producto que buscas por nombre o responde "asesor" para que alguien te ayude.';
  }

  return `Tenemos estas categorias: ${categories.map((category) => category.nombre).join(', ')}. Dime cual quieres revisar o responde "asesor" para atencion personalizada.`;
}

function buildCompanyInfoResponse(intent, result) {
  const company = result?.empresa;

  if (!company) {
    return 'En este momento no pude consultar la informacion de la empresa. Puedo intentar de nuevo o pasarte con un asesor.';
  }

  if (intent.intencion === 'CONSULTAR_UBICACION') {
    return company.direccion
      ? `Nuestra ubicacion es: ${company.direccion}. Te puedo ayudar con disponibilidad o pasarte con un asesor.`
      : 'Aun no tengo una ubicacion configurada. Te puedo pasar con un asesor para confirmarla.';
  }

  if (intent.intencion === 'CONSULTAR_HORARIO') {
    return company.horario_atencion
      ? `Nuestro horario de atencion es: ${company.horario_atencion}. Te puedo ayudar con productos o pasarte con un asesor.`
      : 'Aun no hay horario configurado. Te puedo pasar con un asesor para confirmar disponibilidad.';
  }

  if (intent.intencion === 'CONSULTAR_METODOS_PAGO') {
    return company.politica_pagos
      ? `Aceptamos estas opciones de pago: ${company.politica_pagos}. Te puedo ayudar a elegir un producto o pasarte con un asesor.`
      : 'Aun no hay metodos de pago configurados. Te puedo pasar con un asesor para confirmarlos.';
  }

  if (intent.intencion === 'CONSULTAR_ENVIOS') {
    return company.politica_entrega
      ? `Sobre entregas y envios: ${company.politica_entrega}. Te puedo confirmar un producto o pasarte con un asesor.`
      : 'Aun no hay politica de envios configurada. Te puedo pasar con un asesor para confirmarla.';
  }

  return `Estas hablando con ${company.nombre_bot ?? company.nombre}. Puedo ayudarte a buscar productos, revisar servicios o pasarte con un asesor.`;
}

function buildLeadResponse(intent, result) {
  if (result?.handoff_duplicate) {
    return 'Ya avise a un asesor. Mientras tanto puedo seguir resolviendo tus dudas.';
  }

  if (intent.intencion === 'HABLAR_ASESOR' || intent.intencion === 'INTENCION_COMPRA') {
    return result?.profile?.mensaje_asesor ?? 'Perfecto, voy a avisarle a un asesor para que te apoye. Mientras tanto puedo seguir resolviendo tus dudas.';
  }

  if (intent.intencion === 'AGENDAR_CITA') {
    return 'Listo, voy a avisarle a un asesor para confirmar el horario. Mientras tanto puedo seguir resolviendo tus dudas.';
  }

  return 'Perfecto, voy a avisarle a un asesor para ayudarte con la compra. Mientras tanto puedo seguir resolviendo tus dudas.';
}

function buildOrderResponse(intent, result) {
  const orderId = result?.pedido_id ? ` #${result.pedido_id}` : '';
  const productName = intent?.parametros?.producto_nombre ?? intent?.parametros?.interes;
  const productText = productName ? ` para *${productName}*` : '';

  return `Listo, tu apartado${productText} quedo registrado${orderId}. Te comparto el folio para seguimiento. Puedes escribir "asesor" si necesitas que alguien lo revise contigo.`;
}

function buildStaticResponse(intent, companyContext = {}) {
  const profile = companyContext.response_profile ?? {};
  const fallback = configuredFallback(companyContext);
  const responses = {
    SALUDO: normalizeGreetingText(configuredText(profile, 'saludo_personalizado', companyContext.mensaje_bienvenida || 'Hola, gracias por escribirnos. Dime que producto o servicio buscas y te ayudo a revisarlo.')),
    DESPEDIDA: configuredText(profile, 'despedida_personalizada', 'Gracias por escribirnos. Cuando necesites algo mas, aqui te ayudamos.'),
    AGRADECIMIENTO: 'Con gusto. Te puedo mostrar mas opciones o pasarte con un asesor.',
    AYUDA: 'Puedo ayudarte a buscar productos, revisar precios, confirmar disponibilidad o pasarte con un asesor.',
    FUERA_DE_TEMA: fallback,
    MENSAJE_GENERAL: fallback
  };

  return responses[intent.intencion] ?? responses.MENSAJE_GENERAL;
}

function buildResponse(intent, toolResult, companyContext = {}) {
  const profile = companyContext.response_profile ?? {};

  if (intent.parametros?.respuesta_sugerida) {
    return intent.parametros.respuesta_sugerida;
  }

  switch (intent.herramienta_mcp) {
    case 'buscar_productos':
    case 'obtener_producto':
      return buildProductResponse(toolResult, profile);
    case 'buscar_servicios':
    case 'obtener_servicio':
      return buildServiceResponse(toolResult, profile);
    case 'obtener_categorias':
      return buildCategoriesResponse(toolResult);
    case 'obtener_promociones':
      return toolResult?.mensaje ?? 'No hay promociones configuradas en este momento.';
    case 'obtener_configuracion_empresa':
      return buildCompanyInfoResponse(intent, toolResult);
    case 'crear_lead':
    case 'registrar_intencion_compra':
      return buildLeadResponse(intent, { ...toolResult, profile });
    case 'crear_pedido':
      return buildOrderResponse(intent, toolResult);
    default:
      return buildStaticResponse(intent, companyContext);
  }
}

function buildMedia(intent, toolResult, response) {
  switch (intent.herramienta_mcp) {
    case 'obtener_producto':
      return buildProductMedia(toolResult, response);
    default:
      return [];
  }
}

function buildToolArgs(toolName, { empresaId, phone, message, normalizedMessage, intent, conversationContext, whatsappChatId = null, contactName = null }) {
  const params = intent.parametros ?? {};
  const searchText = params.texto ? normalizarTextoBusqueda(params.texto, intent.sinonimos) : normalizedMessage;

  switch (toolName) {
    case 'buscar_productos':
      return {
        empresa_id: empresaId,
        texto: searchText,
        categoria: params.categoria,
        color: params.color,
        tamano: params.tamano,
        presupuesto: params.presupuesto,
        precio_min: params.precio_min,
        precio_max: params.precio_max,
        stock_requerido: params.stock_requerido,
        offset: params.offset
      };
    case 'obtener_producto':
      return {
        empresa_id: empresaId,
        producto_id: params.producto_id ?? params.id ?? conversationContext?.ultimo_producto_id
      };
    case 'buscar_servicios':
      return {
        empresa_id: empresaId,
        texto: isGenericServiceCatalogRequest(message) ? '' : searchText
      };
    case 'obtener_servicio':
      return {
        empresa_id: empresaId,
        servicio_id: params.servicio_id ?? params.id ?? conversationContext?.ultimo_servicio_id
      };
    case 'crear_lead':
    case 'registrar_intencion_compra':
      return {
        empresa_id: empresaId,
        telefono: params.telefono ?? phone,
        whatsapp_id: whatsappChatId,
        contact_name: contactName,
        nombre_cliente: params.nombre_cliente,
        interes: params.interes ?? params.texto ?? message,
        producto_id: params.producto_id ?? conversationContext?.ultimo_producto_id,
        servicio_id: params.servicio_id ?? conversationContext?.ultimo_servicio_id
      };
    case 'crear_pedido':
      {
        const selectedProduct = findContextProduct(conversationContext, params.producto_id);
        const productName = params.producto_nombre ?? selectedProduct?.nombre ?? params.interes ?? params.texto;
        const total = params.total ?? selectedProduct?.precio ?? 0;
        const notes = [
          productName ? `Apartado de producto: ${productName}` : 'Apartado de producto',
          params.producto_id || selectedProduct?.id ? `Producto ID: ${params.producto_id ?? selectedProduct?.id}` : null,
          params.notas ?? params.interes ?? params.texto ?? message
        ].filter(Boolean).join('\n');

        intent.parametros.producto_nombre = productName;
        intent.parametros.total = total;

        return {
          empresa_id: empresaId,
          telefono: params.telefono_cliente ?? params.telefono ?? phone,
          cliente_nombre: params.cliente_nombre ?? params.nombre_cliente ?? contactName ?? 'Cliente WhatsApp',
          conversation_id: params.conversation_id,
          total,
          notas: notes
        };
      }
    case 'obtener_categorias':
    case 'obtener_promociones':
    case 'obtener_configuracion_empresa':
      return { empresa_id: empresaId };
    default:
      return { empresa_id: empresaId };
  }
}

function hasProductContext(conversationContext) {
  return Number(conversationContext?.ultimo_producto_id) > 0;
}

function hasServiceContext(conversationContext) {
  return Number(conversationContext?.ultimo_servicio_id) > 0;
}

function getLastShownProducts(conversationContext) {
  const products =
    conversationContext?.datos_json?.ultima_lista_productos ??
    conversationContext?.datos_json?.productos_mostrados;
  return Array.isArray(products) ? products : [];
}

function getLastProductSearch(conversationContext) {
  const search = conversationContext?.datos_json?.ultima_busqueda_productos;
  return search && typeof search === 'object' && !Array.isArray(search) ? search : null;
}

function findContextProduct(conversationContext, productId = null) {
  const normalizedProductId = Number(productId ?? conversationContext?.ultimo_producto_id);
  const currentProduct = conversationContext?.datos_json?.producto;

  if (currentProduct?.id && Number(currentProduct.id) === normalizedProductId) {
    return currentProduct;
  }

  return getLastShownProducts(conversationContext)
    .find((product) => Number(product?.id) === normalizedProductId) ?? null;
}

function extractSelectedOptionNumber(message) {
  const cleanMessage = String(message ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const match = cleanMessage.match(/^(?:el|la)?\s*(?:opcion\s*)?(\d{1,2})$/);
  const selectedNumber = Number(match?.[1]);

  return Number.isInteger(selectedNumber) && selectedNumber > 0 ? selectedNumber : null;
}

function findSelectedProductFromContext(message, conversationContext) {
  const selectedNumber = extractSelectedOptionNumber(message);

  if (!selectedNumber) {
    return null;
  }

  const products = getLastShownProducts(conversationContext);
  return products[selectedNumber - 1] ?? null;
}

function isShortContextualQuestion(message) {
  const tokens = String(message ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  return tokens.length > 0 && tokens.length <= 4;
}

function isPriceFollowUp(message) {
  return /\b(cu[aá]nto cuesta|cuanto cuesta|precio|costo|vale|cu[aá]nto vale)\b/i.test(message);
}

function isPurchaseFollowUp(message) {
  return /\b(me interesa|lo quiero|la quiero|quiero comprar|comprar|apartar|ap[aá]rtamelo|apartamelo|ap[aá]rtalo|apartalo|apartarlo|ap[aá]rtarlo|aparto|ap[aá]rto|como lo aparto|c[oó]mo lo aparto|separar|separamelo|me lo llevo|quiero ese|p[aá]same con asesor|pasame con asesor|quiero informaci[oó]n|quiero informacion|hacer pedido|levantar pedido|finalizar compra|cerrar compra)\b/i.test(message);
}

function isShippingFollowUp(message) {
  return /\b(env[ií]o|envio|entrega|mandan|llevan|domicilio)\b/i.test(message);
}

function isInstallationFollowUp(message) {
  const normalized = normalizarTextoBusqueda(message);
  return /\b(instalacion|instalar|instalado)\b/.test(normalized)
    && /\b(incluye|incluido|incluida|precio|costo)\b/.test(normalized);
}

function isMoreOptionsFollowUp(message) {
  return /\b(m[aá]s|mas|m[aá]s opciones|mas opciones|tienes m[aá]s|tienes mas|otros|ver m[aá]s|ver mas|m[aá]s productos|mas productos)\b/i.test(message);
}

function applyConversationContext(intent, message, conversationContext) {
  const nextIntent = {
    ...intent,
    parametros: { ...(intent.parametros ?? {}) }
  };

  if (!conversationContext && isPurchaseFollowUp(message)) {
    return {
      ...nextIntent,
      intencion: 'INTENCION_COMPRA',
      herramienta_mcp: 'registrar_intencion_compra',
      parametros: {
        ...nextIntent.parametros,
        interes: nextIntent.parametros.interes ?? nextIntent.parametros.texto ?? message
      }
    };
  }

  if (!conversationContext) {
    return nextIntent;
  }

  const lastProductSearch = getLastProductSearch(conversationContext);

  if (isMoreOptionsFollowUp(message) && lastProductSearch) {
    return {
      ...nextIntent,
      intencion: 'BUSCAR_PRODUCTO',
      herramienta_mcp: 'buscar_productos',
      parametros: {
        ...(lastProductSearch.parametros ?? {}),
        offset: lastProductSearch.next_offset ?? 0
      }
    };
  }

  const selectedProduct = findSelectedProductFromContext(message, conversationContext);

  if (selectedProduct?.id) {
    return {
      ...nextIntent,
      intencion: 'CONSULTAR_PRECIO',
      herramienta_mcp: 'obtener_producto',
      parametros: {
        ...nextIntent.parametros,
        producto_id: selectedProduct.id
      }
    };
  }

  if (isShortContextualQuestion(message) && hasProductContext(conversationContext)) {
    if (isPriceFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: 'obtener_producto',
        parametros: { producto_id: conversationContext.ultimo_producto_id }
      };
    }

    if (isShippingFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_ENVIOS',
        herramienta_mcp: 'obtener_configuracion_empresa',
        parametros: {}
      };
    }

    if (isPurchaseFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'INTENCION_COMPRA',
        herramienta_mcp: 'crear_pedido',
        parametros: {
          interes: conversationContext.ultimo_texto_busqueda ?? message,
          producto_id: conversationContext.ultimo_producto_id
        }
      };
    }
  }

  if (isShortContextualQuestion(message) && hasServiceContext(conversationContext)) {
    if (isInstallationFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: 'obtener_servicio',
        parametros: { servicio_id: conversationContext.ultimo_servicio_id }
      };
    }

    if (isPriceFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: 'obtener_servicio',
        parametros: { servicio_id: conversationContext.ultimo_servicio_id }
      };
    }

    if (isPurchaseFollowUp(message)) {
      return {
        ...nextIntent,
        intencion: 'INTENCION_COMPRA',
        herramienta_mcp: 'registrar_intencion_compra',
        parametros: {
          interes: conversationContext.ultimo_texto_busqueda ?? message,
          servicio_id: conversationContext.ultimo_servicio_id
        }
      };
    }
  }

  if (hasProductContext(conversationContext) && !nextIntent.parametros.producto_id) {
    if (nextIntent.intencion === 'CONSULTAR_PRECIO' || nextIntent.intencion === 'CONSULTAR_STOCK') {
      nextIntent.herramienta_mcp = 'obtener_producto';
      nextIntent.parametros.producto_id = conversationContext.ultimo_producto_id;
      return nextIntent;
    }

    if (nextIntent.intencion === 'INTENCION_COMPRA') {
      nextIntent.herramienta_mcp = 'crear_pedido';
      nextIntent.parametros.producto_id = conversationContext.ultimo_producto_id;
      nextIntent.parametros.interes = nextIntent.parametros.interes ?? conversationContext.ultimo_texto_busqueda ?? message;
      return nextIntent;
    }
  }

  if (hasServiceContext(conversationContext) && !nextIntent.parametros.servicio_id) {
    if (nextIntent.intencion === 'CONSULTAR_PRECIO') {
      nextIntent.herramienta_mcp = 'obtener_servicio';
      nextIntent.parametros.servicio_id = conversationContext.ultimo_servicio_id;
      return nextIntent;
    }

    if (nextIntent.intencion === 'INTENCION_COMPRA' || nextIntent.intencion === 'AGENDAR_CITA') {
      nextIntent.parametros.servicio_id = conversationContext.ultimo_servicio_id;
      nextIntent.parametros.interes = nextIntent.parametros.interes ?? conversationContext.ultimo_texto_busqueda ?? message;
      return nextIntent;
    }
  }

  if (nextIntent.intencion === 'MENSAJE_GENERAL' && isPriceFollowUp(message)) {
    if (hasProductContext(conversationContext)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: 'obtener_producto',
        parametros: { producto_id: conversationContext.ultimo_producto_id }
      };
    }

    if (hasServiceContext(conversationContext)) {
      return {
        ...nextIntent,
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: 'obtener_servicio',
        parametros: { servicio_id: conversationContext.ultimo_servicio_id }
      };
    }
  }

  if (nextIntent.intencion === 'MENSAJE_GENERAL' && hasProductContext(conversationContext) && isShippingFollowUp(message)) {
    return {
      ...nextIntent,
      intencion: 'CONSULTAR_ENVIOS',
      herramienta_mcp: 'obtener_configuracion_empresa',
      parametros: {}
    };
  }

  if (nextIntent.intencion === 'MENSAJE_GENERAL' && isPurchaseFollowUp(message)) {
    const hasProduct = hasProductContext(conversationContext);
    return {
      ...nextIntent,
      intencion: 'INTENCION_COMPRA',
      herramienta_mcp: hasProduct ? 'crear_pedido' : 'registrar_intencion_compra',
      parametros: {
        interes: conversationContext.ultimo_texto_busqueda ?? message,
        producto_id: conversationContext.ultimo_producto_id ?? undefined,
        servicio_id: conversationContext.ultimo_servicio_id ?? undefined
      }
    };
  }

  return nextIntent;
}

function serializeProductContext(product) {
  return {
    id: product.id,
    nombre: product.nombre,
    precio: product.precio,
    imagen: product.imagen ?? null,
    categoria: product.categoria ?? null
  };
}

function extractContextPatch({ intent, toolResult, message, conversationContext }) {
  const previousData = conversationContext?.datos_json ?? {};
  const previousProductList = getLastShownProducts(conversationContext);
  const previousProductSearch = getLastProductSearch(conversationContext);
  const products = toolResult?.productos ?? [];
  const services = toolResult?.servicios ?? [];
  const product = toolResult?.producto ?? products[0] ?? null;
  const service = toolResult?.servicio ?? services[0] ?? null;
  const leadProductId = toolResult?.producto_id ?? intent.parametros?.producto_id ?? null;
  const leadServiceId = toolResult?.servicio_id ?? intent.parametros?.servicio_id ?? null;
  const currentProductList = products.map(serializeProductContext);
  const lastProductList = currentProductList.length > 0 ? currentProductList : previousProductList;
  const lastCategory =
    product?.categoria ??
    products.find((product) => product?.categoria)?.categoria ??
    previousData.ultima_categoria ??
    null;
  const isProductSearch = intent.herramienta_mcp === 'buscar_productos';
  const searchParams = isProductSearch
    ? {
        texto: intent.parametros?.texto ?? null,
        categoria: intent.parametros?.categoria ?? null,
        color: intent.parametros?.color ?? null,
        tamano: intent.parametros?.tamano ?? null,
        presupuesto: intent.parametros?.presupuesto ?? null,
        precio_min: intent.parametros?.precio_min ?? null,
        precio_max: intent.parametros?.precio_max ?? null,
        stock_requerido: intent.parametros?.stock_requerido ?? null
      }
    : previousProductSearch?.parametros ?? null;
  const lastProductSearch = searchParams
    ? {
        parametros: searchParams,
        offset: toolResult?.paginacion?.offset ?? previousProductSearch?.offset ?? 0,
        next_offset: toolResult?.paginacion?.next_offset ?? previousProductSearch?.next_offset ?? 0,
        has_more: toolResult?.paginacion?.has_more ?? previousProductSearch?.has_more ?? false
      }
    : null;

  return {
    ultimaIntencion: intent.intencion,
    ultimoProductoId: product?.id ?? leadProductId,
    ultimoServicioId: service?.id ?? leadServiceId,
    ultimoTextoBusqueda:
      intent.parametros?.texto ??
      intent.parametros?.interes ??
      product?.nombre ??
      service?.nombre ??
      message,
    datos: {
      herramienta_mcp: intent.herramienta_mcp,
      parametros: intent.parametros,
      producto: product
        ? serializeProductContext(product)
        : previousData.producto ?? null,
      ultima_lista_productos: lastProductList,
      productos_mostrados: lastProductList,
      ultima_categoria: lastCategory,
      ultima_busqueda_productos: lastProductSearch,
      servicio: service
        ? {
            id: service.id,
            nombre: service.nombre,
            precio: service.precio,
            tipo_precio: service.tipo_precio,
            unidad_medida: service.unidad_medida,
            requiere_medidas: service.requiere_medidas,
            requiere_cantidad: service.requiere_cantidad,
            incluye: service.incluye,
            no_incluye: service.no_incluye,
            notas_cotizacion: service.notas_cotizacion,
            precio_minimo: service.precio_minimo
          }
        : null
    }
  };
}

async function getMinimalCompanyContext(empresaId, mcpClient) {
  try {
    const result = await mcpClient.callTool('obtener_configuracion_empresa', { empresa_id: empresaId });
    const responseProfile = mcpClient === defaultMcpClient
      ? await getBotResponseProfile(empresaId).catch(() => null)
      : null;
    const company = result.empresa;

    return {
      nombre: company?.nombre,
      tipo_negocio: company?.tipo_negocio,
      nombre_bot: company?.nombre_bot,
      tono_respuesta: company?.tono_respuesta,
      mensaje_bienvenida: company?.mensaje_bienvenida,
      mensaje_fuera_horario: company?.mensaje_fuera_horario,
      instrucciones_negocio: company?.instrucciones_negocio,
      temas_bloqueados: company?.temas_bloqueados,
      faq_personalizada: company?.faq_personalizada,
      auto_pedidos: company?.auto_pedidos !== undefined ? Boolean(company.auto_pedidos) : true,
      envio_imagenes: company?.envio_imagenes !== undefined ? Boolean(company.envio_imagenes) : true,
      fallback_message: company?.fallback_message,
      horario_atencion: company?.horario_atencion,
      politica_entrega: company?.politica_entrega,
      politica_pagos: company?.politica_pagos,
      response_profile: responseProfile
    };
  } catch {
    return {};
  }
}

export async function orchestrateIncomingMessage({
  empresaId,
  userId = null,
  phone,
  message,
  whatsappChatId = null,
  contactName = null,
  contexto = null,
  currentDate = new Date(),
  interpreter = interpretIntent,
  mcpClient = defaultMcpClient,
  handoffManager = {
    hasActive: hasActiveHandoff,
    request: requestHandoff
  },
  contextStore = {
    find: findConversationContext,
    save: saveConversationContext
  }
}) {
  const cleanPhone = normalizePhone(phone);
  const conversationContext = await contextStore.find({ empresaId, phone: cleanPhone });
  const contextoEmpresa = contexto ?? (await getMinimalCompanyContext(empresaId, mcpClient));
  const businessStrategy = getBusinessStrategy(contextoEmpresa);
  const normalizedMessage = normalizarTextoBusqueda(message, contextoEmpresa.response_profile?.sinonimos);
  const blockedTopics = parseBlockedTopics(contextoEmpresa.temas_bloqueados);

  if (matchesBlockedTopic(message, blockedTopics)) {
    const response = configuredFallback(contextoEmpresa);
      const savedConversation = await mcpClient.callTool('guardar_conversacion', {
      empresa_id: empresaId,
      telefono: cleanPhone,
      whatsapp_id: whatsappChatId,
      contact_name: contactName,
      mensaje: message,
      respuesta: response,
      estado: 'bot_active',
      tipo_mensaje: 'bot'
    });

    return {
      respuesta: response,
      medios: [],
      intencion: 'FUERA_DE_TEMA',
      herramienta_mcp: null,
      parametros: {},
      confianza: 1,
      requiere_respuesta_ia: false,
      mcp_result: null,
      notificacion: null,
      lead_id: null,
      conversacion_id: savedConversation.conversacion_id
    };
  }

  const faqAnswer = findFaqAnswer(message, contextoEmpresa.faq_personalizada);

  if (faqAnswer) {
    const savedConversation = await mcpClient.callTool('guardar_conversacion', {
      empresa_id: empresaId,
      telefono: cleanPhone,
      whatsapp_id: whatsappChatId,
      contact_name: contactName,
      mensaje: message,
      respuesta: faqAnswer,
      estado: 'bot_active',
      tipo_mensaje: 'bot'
    });

    return {
      respuesta: faqAnswer,
      medios: [],
      intencion: 'FAQ_PERSONALIZADA',
      herramienta_mcp: null,
      parametros: {},
      confianza: 1,
      requiere_respuesta_ia: false,
      mcp_result: null,
      notificacion: null,
      lead_id: null,
      conversacion_id: savedConversation.conversacion_id
    };
  }

  const contextoCompleto = {
    ...contextoEmpresa,
    conversacion_contexto: conversationContext
      ? {
          ultima_intencion: conversationContext.ultima_intencion,
          ultimo_producto_id: conversationContext.ultimo_producto_id,
          ultimo_servicio_id: conversationContext.ultimo_servicio_id,
          ultimo_texto_busqueda: conversationContext.ultimo_texto_busqueda,
          datos: conversationContext.datos_json
        }
      : null
  };
  let usageSnapshot = null;
  let interpretedIntent = null;

  try {
    interpretedIntent = await interpreter({
      empresa_id: empresaId,
      mensaje_cliente: normalizedMessage,
      contexto: contextoCompleto,
      onUsage: (usage) => {
        usageSnapshot = usage;
      }
    });
  } catch (error) {
    interpretedIntent = {
      ...FALLBACK_INTENT,
      parametros: {
        ai_error: error.code ?? error.name ?? 'INTERPRETER_ERROR'
      }
    };
  }
  const intent = businessStrategy.prepareIntent(
    applyConversationContext(validateIntentJson(interpretedIntent), normalizedMessage, conversationContext),
    {
      companyContext: contextoEmpresa,
      conversationContext,
      normalizedMessage
    }
  );
  intent.sinonimos = contextoEmpresa.response_profile?.sinonimos ?? null;
  let toolResult = null;
  let notificationResult = null;
  let responseIntent = intent;
  const shouldRequestHuman = shouldNotifyOwner(intent.intencion) && intent.herramienta_mcp !== 'crear_pedido';

  if (shouldRequestHuman && !isWithinBusinessHours(contextoEmpresa.horario_atencion, currentDate)) {
    const response = buildAfterHoursAdvisorResponse(contextoEmpresa, currentDate);
    const savedConversation = await mcpClient.callTool('guardar_conversacion', {
      empresa_id: empresaId,
      telefono: cleanPhone,
      whatsapp_id: whatsappChatId,
      contact_name: contactName,
      mensaje: message,
      respuesta: response,
      estado: 'bot_active',
      tipo_mensaje: 'bot'
    });

    await contextStore.save({
      empresaId,
      phone: cleanPhone,
      ...extractContextPatch({ intent, toolResult: null, message, conversationContext })
    });

    return {
      respuesta: response,
      medios: [],
      intencion: intent.intencion,
      herramienta_mcp: null,
      parametros: intent.parametros,
      confianza: intent.confianza,
      requiere_respuesta_ia: intent.requiere_respuesta_ia,
      mcp_result: null,
      notificacion: null,
      lead_id: null,
      conversacion_id: savedConversation.conversacion_id,
      fuera_horario: true
    };
  }

  const activeHandoffExists = shouldRequestHuman
    ? await handoffManager.hasActive({ empresaId, phone: cleanPhone })
    : false;

  if (intent.herramienta_mcp && !activeHandoffExists) {
    toolResult = await mcpClient.callTool(
      intent.herramienta_mcp,
      buildToolArgs(intent.herramienta_mcp, {
        empresaId,
        phone: cleanPhone,
        message,
        normalizedMessage,
        intent,
        conversationContext,
        whatsappChatId,
        contactName
      })
    );

    const strategyResolution = await businessStrategy.resolveAfterTool({
      intent,
      toolResult,
      mcpClient,
      empresaId,
      normalizedMessage,
      normalizeSearchText: normalizarTextoBusqueda
    });

    if (strategyResolution) {
      toolResult = strategyResolution.toolResult;
      responseIntent = strategyResolution.responseIntent;
    }

    if (responseIntent.herramienta_mcp === 'buscar_servicios') {
      toolResult = prepareServiceToolResult(toolResult, {
        message,
        synonyms: contextoEmpresa.response_profile?.sinonimos,
        catalogRequest: isGenericServiceCatalogRequest(message)
      });
    }
  } else if (activeHandoffExists) {
    toolResult = {
      handoff_duplicate: true,
      telefono: cleanPhone,
      interes: intent.parametros?.interes ?? intent.parametros?.texto ?? message,
      producto_id: intent.parametros?.producto_id ?? conversationContext?.ultimo_producto_id ?? null,
      servicio_id: intent.parametros?.servicio_id ?? conversationContext?.ultimo_servicio_id ?? null
    };
  }

  if (toolResult && typeof toolResult === 'object') {
    toolResult.mensaje_cliente = normalizedMessage;
    toolResult.mensaje_original = message;
  }

  const response = buildResponse(responseIntent, toolResult, contextoEmpresa);
  const media = contextoEmpresa.envio_imagenes === false ? [] : buildMedia(responseIntent, toolResult, response);
  const savedConversation = await mcpClient.callTool('guardar_conversacion', {
    empresa_id: empresaId,
    telefono: cleanPhone,
    whatsapp_id: whatsappChatId,
    contact_name: contactName,
    mensaje: message,
    respuesta: response,
    estado: shouldRequestHuman ? 'requires_human' : 'bot_active',
    tipo_mensaje: 'bot'
  });

  if (usageSnapshot) {
    await registerAIUsage({
      tenantId: empresaId,
      userId,
      conversationId: savedConversation.conversacion_id,
      tokensInput: usageSnapshot.tokens_input,
      tokensOutput: usageSnapshot.tokens_output,
      totalTokens: usageSnapshot.total_tokens,
      modelUsed: usageSnapshot.modelo_usado
    });
  }

  if (shouldRequestHuman) {
    try {
      notificationResult = await handoffManager.request({
        empresa_id: empresaId,
        conversation_id: savedConversation.conversacion_id,
        telefono_cliente: cleanPhone,
        whatsapp_chat_id: whatsappChatId,
        mensaje_cliente: message,
        producto_id: toolResult?.producto_id ?? intent.parametros?.producto_id ?? conversationContext?.ultimo_producto_id ?? null,
        servicio_id: toolResult?.servicio_id ?? intent.parametros?.servicio_id ?? conversationContext?.ultimo_servicio_id ?? null,
        motivo: intent.intencion,
        mcpClientInstance: mcpClient
      });
    } catch (error) {
      notificationResult = {
        estado: 'ERROR',
        error: error.message
      };
    }
  } else if (shouldRequestHuman && toolResult?.lead_id) {
    try {
      notificationResult = await notifyOwnerForLead({
        empresaId,
        intent,
        toolResult,
        phone: cleanPhone,
        message,
        mcpClientInstance: mcpClient
      });
    } catch (error) {
      notificationResult = {
        estado: 'ERROR',
        error: error.message
      };
    }
  }

  await contextStore.save({
    empresaId,
    phone: cleanPhone,
    ...extractContextPatch({ intent: responseIntent, toolResult, message, conversationContext })
  });

  return {
    respuesta: response,
    medios: media,
    intencion: responseIntent.intencion,
    herramienta_mcp: responseIntent.herramienta_mcp,
    parametros: responseIntent.parametros,
    confianza: intent.confianza,
    requiere_respuesta_ia: intent.requiere_respuesta_ia,
    mcp_result: toolResult,
    notificacion: notificationResult,
    lead_id: toolResult?.lead_id ?? null,
    conversacion_id: savedConversation.conversacion_id
  };
}

