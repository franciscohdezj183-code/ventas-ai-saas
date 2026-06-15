import { query } from '../../config/database.js';
import { createHttpError } from '../../utils/http-error.js';

export const BUSINESS_TYPES = [
  'Muebleria',
  'Ferreteria',
  'Papeleria',
  'Ropa',
  'Refaccionaria',
  'Restaurante',
  'Clinica',
  'Servicios profesionales',
  'General'
];

const TONES = ['PROFESIONAL', 'AMABLE', 'CERCANO', 'FORMAL', 'COMERCIAL'];
let tablesReadyPromise = null;

const DEFAULT_FORMAT = [
  '{emoji_principal} Claro, encontre estas opciones para ti:',
  '',
  '{items}',
  'Responde con el numero de la opcion que quieres ver, por ejemplo: 1.'
].join('\n');

const DEFAULT_NO_RESULTS = '{emoji_principal} Por ahora no encontre ese producto exacto.\nPuedo ayudarte a buscar algo similar o pasarte con un asesor.';
const DEFAULT_EMOJIS = {
  principal: '\u2728',
  producto: '\u2022',
  precio: '\u{1F4B0}',
  stock: '\u{1F4E6}',
  asesor: '\u{1F9D1}\u200D\u{1F4BC}',
  pago: '\u{1F4B3}'
};

function cleanText(value, fallback = null) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function boolValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return value === true || value === 1 || value === '1' || value === 'true';
}

function toneValue(value, fallback = 'PROFESIONAL') {
  const tone = String(value ?? fallback).toUpperCase();
  return TONES.includes(tone) ? tone : fallback;
}

async function ensureTables() {
  if (!tablesReadyPromise) {
    tablesReadyPromise = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS bot_prompt_templates (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          nombre VARCHAR(150) NOT NULL,
          tipo_negocio VARCHAR(120) NOT NULL,
          intencion VARCHAR(80) NULL,
          prompt_sistema TEXT NULL,
          formato_respuesta TEXT NULL,
          ejemplos_json JSON NULL,
          emojis_activos TINYINT(1) NOT NULL DEFAULT 1,
          tono ENUM('PROFESIONAL','AMABLE','CERCANO','FORMAL','COMERCIAL') NOT NULL DEFAULT 'PROFESIONAL',
          activo TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY bot_prompt_templates_tipo_index (tipo_negocio),
          KEY bot_prompt_templates_activo_index (activo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );

      await query(
        `CREATE TABLE IF NOT EXISTS bot_response_settings (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          empresa_id BIGINT UNSIGNED NOT NULL,
          template_id BIGINT UNSIGNED NULL,
          nombre_asistente VARCHAR(120) NULL,
          tono_respuesta VARCHAR(180) NULL,
          usar_emojis TINYINT(1) NOT NULL DEFAULT 1,
          emoji_principal VARCHAR(16) NULL,
          emoji_producto VARCHAR(16) NULL,
          emoji_precio VARCHAR(16) NULL,
          emoji_stock VARCHAR(16) NULL,
          emoji_asesor VARCHAR(16) NULL,
          emoji_pago VARCHAR(16) NULL,
          saludo_personalizado TEXT NULL,
          despedida_personalizada TEXT NULL,
          mensaje_sin_resultados TEXT NULL,
          mensaje_asesor TEXT NULL,
          mensaje_fuera_horario TEXT NULL,
          reglas_adicionales TEXT NULL,
          sinonimos_json JSON NULL,
          handoff_timeout_minutos INT UNSIGNED NULL,
          handoff_mensaje_tomar TEXT NULL,
          handoff_mensaje_declinar TEXT NULL,
          handoff_mensaje_expirado TEXT NULL,
          handoff_mensaje_reactivar TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY bot_response_settings_empresa_unique (empresa_id),
          KEY bot_response_settings_template_index (template_id),
          CONSTRAINT bot_response_settings_empresa_foreign
            FOREIGN KEY (empresa_id) REFERENCES empresas (id)
            ON DELETE CASCADE
            ON UPDATE CASCADE,
          CONSTRAINT bot_response_settings_template_foreign
            FOREIGN KEY (template_id) REFERENCES bot_prompt_templates (id)
            ON DELETE SET NULL
            ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );

      const [columns] = await query(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bot_response_settings'`
      );
      const columnNames = new Set(columns.map((column) => column.COLUMN_NAME));
      const alterStatements = [
        ['sinonimos_json', 'ALTER TABLE bot_response_settings ADD COLUMN sinonimos_json JSON NULL AFTER reglas_adicionales'],
        ['handoff_timeout_minutos', 'ALTER TABLE bot_response_settings ADD COLUMN handoff_timeout_minutos INT UNSIGNED NULL AFTER sinonimos_json'],
        ['handoff_mensaje_tomar', 'ALTER TABLE bot_response_settings ADD COLUMN handoff_mensaje_tomar TEXT NULL AFTER handoff_timeout_minutos'],
        ['handoff_mensaje_declinar', 'ALTER TABLE bot_response_settings ADD COLUMN handoff_mensaje_declinar TEXT NULL AFTER handoff_mensaje_tomar'],
        ['handoff_mensaje_expirado', 'ALTER TABLE bot_response_settings ADD COLUMN handoff_mensaje_expirado TEXT NULL AFTER handoff_mensaje_declinar'],
        ['handoff_mensaje_reactivar', 'ALTER TABLE bot_response_settings ADD COLUMN handoff_mensaje_reactivar TEXT NULL AFTER handoff_mensaje_expirado']
      ];

      for (const [columnName, statement] of alterStatements) {
        if (!columnNames.has(columnName)) {
          await query(statement);
        }
      }
    })();
  }

  return tablesReadyPromise;
}

function parseJson(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeJsonPayload(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return null;
  }
}

function positiveIntegerOrNull(value) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function mapTemplate(row) {
  return row
    ? {
        ...row,
        ejemplos_json: parseJson(row.ejemplos_json),
        emojis_activos: Boolean(row.emojis_activos),
        activo: Boolean(row.activo)
      }
    : null;
}

function mapSettings(row) {
  return row
    ? {
        ...row,
        usar_emojis: Boolean(row.usar_emojis),
        sinonimos_json: parseJson(row.sinonimos_json),
        template: row.template_id
          ? {
              id: row.template_id,
              nombre: row.template_nombre,
              tipo_negocio: row.template_tipo_negocio,
              intencion: row.template_intencion,
              prompt_sistema: row.template_prompt_sistema,
              formato_respuesta: row.template_formato_respuesta,
              ejemplos_json: parseJson(row.template_ejemplos_json),
              emojis_activos: Boolean(row.template_emojis_activos),
              tono: row.template_tono,
              activo: Boolean(row.template_activo)
            }
          : null
      }
    : null;
}

export async function listTemplates() {
  await ensureTables();
  const [rows] = await query(
    `SELECT *
     FROM bot_prompt_templates
     ORDER BY activo DESC, tipo_negocio ASC, nombre ASC`
  );

  return rows.map(mapTemplate);
}

export async function saveTemplate(payload) {
  await ensureTables();
  const input = {
    id: payload.id ? Number(payload.id) : null,
    nombre: cleanText(payload.nombre, 'Plantilla general'),
    tipoNegocio: cleanText(payload.tipo_negocio, 'General'),
    intencion: cleanText(payload.intencion),
    promptSistema: cleanText(payload.prompt_sistema),
    formatoRespuesta: cleanText(payload.formato_respuesta, DEFAULT_FORMAT),
    ejemplosJson: payload.ejemplos_json ? JSON.stringify(payload.ejemplos_json) : null,
    emojisActivos: boolValue(payload.emojis_activos),
    tono: toneValue(payload.tono),
    activo: boolValue(payload.activo)
  };

  if (input.id) {
    const [result] = await query(
      `UPDATE bot_prompt_templates
       SET nombre = ?, tipo_negocio = ?, intencion = ?, prompt_sistema = ?,
           formato_respuesta = ?, ejemplos_json = ?, emojis_activos = ?, tono = ?, activo = ?
       WHERE id = ?`,
      [
        input.nombre,
        input.tipoNegocio,
        input.intencion,
        input.promptSistema,
        input.formatoRespuesta,
        input.ejemplosJson,
        input.emojisActivos ? 1 : 0,
        input.tono,
        input.activo ? 1 : 0,
        input.id
      ]
    );

    if (result.affectedRows === 0) {
      throw createHttpError(404, 'Plantilla no encontrada');
    }
  } else {
    const [result] = await query(
      `INSERT INTO bot_prompt_templates
        (nombre, tipo_negocio, intencion, prompt_sistema, formato_respuesta, ejemplos_json, emojis_activos, tono, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.nombre,
        input.tipoNegocio,
        input.intencion,
        input.promptSistema,
        input.formatoRespuesta,
        input.ejemplosJson,
        input.emojisActivos ? 1 : 0,
        input.tono,
        input.activo ? 1 : 0
      ]
    );
    input.id = result.insertId;
  }

  const [rows] = await query('SELECT * FROM bot_prompt_templates WHERE id = ? LIMIT 1', [input.id]);
  return mapTemplate(rows[0]);
}

export async function deleteTemplate(id) {
  await ensureTables();
  const [result] = await query('DELETE FROM bot_prompt_templates WHERE id = ?', [Number(id)]);

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Plantilla no encontrada');
  }
}

export async function listResponseSettings() {
  await ensureTables();
  const [rows] = await query(
    `SELECT brs.*,
            e.nombre AS empresa_nombre,
            bpt.nombre AS template_nombre,
            bpt.tipo_negocio AS template_tipo_negocio,
            bpt.intencion AS template_intencion,
            bpt.prompt_sistema AS template_prompt_sistema,
            bpt.formato_respuesta AS template_formato_respuesta,
            bpt.ejemplos_json AS template_ejemplos_json,
            bpt.emojis_activos AS template_emojis_activos,
            bpt.tono AS template_tono,
            bpt.activo AS template_activo
     FROM bot_response_settings brs
     INNER JOIN empresas e ON e.id = brs.empresa_id
     LEFT JOIN bot_prompt_templates bpt ON bpt.id = brs.template_id
     ORDER BY e.nombre ASC`
  );

  return rows.map(mapSettings);
}

export async function saveResponseSettings(payload) {
  await ensureTables();
  const empresaId = Number(payload.empresa_id);

  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw createHttpError(400, 'La empresa es requerida');
  }

  await query(
    `INSERT INTO bot_response_settings
      (empresa_id, template_id, nombre_asistente, tono_respuesta, usar_emojis,
       emoji_principal, emoji_producto, emoji_precio, emoji_stock, emoji_asesor, emoji_pago,
       saludo_personalizado, despedida_personalizada, mensaje_sin_resultados,
       mensaje_asesor, mensaje_fuera_horario, reglas_adicionales, sinonimos_json,
       handoff_timeout_minutos, handoff_mensaje_tomar, handoff_mensaje_declinar,
       handoff_mensaje_expirado, handoff_mensaje_reactivar)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       template_id = VALUES(template_id),
       nombre_asistente = VALUES(nombre_asistente),
       tono_respuesta = VALUES(tono_respuesta),
       usar_emojis = VALUES(usar_emojis),
       emoji_principal = VALUES(emoji_principal),
       emoji_producto = VALUES(emoji_producto),
       emoji_precio = VALUES(emoji_precio),
       emoji_stock = VALUES(emoji_stock),
       emoji_asesor = VALUES(emoji_asesor),
       emoji_pago = VALUES(emoji_pago),
       saludo_personalizado = VALUES(saludo_personalizado),
       despedida_personalizada = VALUES(despedida_personalizada),
       mensaje_sin_resultados = VALUES(mensaje_sin_resultados),
       mensaje_asesor = VALUES(mensaje_asesor),
       mensaje_fuera_horario = VALUES(mensaje_fuera_horario),
       reglas_adicionales = VALUES(reglas_adicionales),
       sinonimos_json = VALUES(sinonimos_json),
       handoff_timeout_minutos = VALUES(handoff_timeout_minutos),
       handoff_mensaje_tomar = VALUES(handoff_mensaje_tomar),
       handoff_mensaje_declinar = VALUES(handoff_mensaje_declinar),
       handoff_mensaje_expirado = VALUES(handoff_mensaje_expirado),
       handoff_mensaje_reactivar = VALUES(handoff_mensaje_reactivar)`,
    [
      empresaId,
      payload.template_id ? Number(payload.template_id) : null,
      cleanText(payload.nombre_asistente),
      cleanText(payload.tono_respuesta),
      boolValue(payload.usar_emojis) ? 1 : 0,
      cleanText(payload.emoji_principal, '✨'),
      cleanText(payload.emoji_producto, '•'),
      cleanText(payload.emoji_precio, '💰'),
      cleanText(payload.emoji_stock, '📦'),
      cleanText(payload.emoji_asesor, '🧑‍💼'),
      cleanText(payload.emoji_pago, '💳'),
      cleanText(payload.saludo_personalizado),
      cleanText(payload.despedida_personalizada),
      cleanText(payload.mensaje_sin_resultados),
      cleanText(payload.mensaje_asesor),
      cleanText(payload.mensaje_fuera_horario),
      cleanText(payload.reglas_adicionales),
      normalizeJsonPayload(payload.sinonimos_json),
      positiveIntegerOrNull(payload.handoff_timeout_minutos),
      cleanText(payload.handoff_mensaje_tomar),
      cleanText(payload.handoff_mensaje_declinar),
      cleanText(payload.handoff_mensaje_expirado),
      cleanText(payload.handoff_mensaje_reactivar)
    ]
  );

  const settings = await getResponseSettingsByCompany(empresaId);
  return settings;
}

export async function getResponseSettingsByCompany(empresaId) {
  await ensureTables();
  const [rows] = await query(
    `SELECT brs.*,
            bpt.nombre AS template_nombre,
            bpt.tipo_negocio AS template_tipo_negocio,
            bpt.intencion AS template_intencion,
            bpt.prompt_sistema AS template_prompt_sistema,
            bpt.formato_respuesta AS template_formato_respuesta,
            bpt.ejemplos_json AS template_ejemplos_json,
            bpt.emojis_activos AS template_emojis_activos,
            bpt.tono AS template_tono,
            bpt.activo AS template_activo
     FROM bot_response_settings brs
     LEFT JOIN bot_prompt_templates bpt ON bpt.id = brs.template_id
     WHERE brs.empresa_id = ?
     LIMIT 1`,
    [Number(empresaId)]
  );

  return mapSettings(rows[0] ?? null);
}

export async function getBotResponseProfile(empresaId) {
  const settings = await getResponseSettingsByCompany(empresaId);

  return {
    template: settings?.template ?? null,
    nombre_asistente: settings?.nombre_asistente,
    tono_respuesta: settings?.tono_respuesta,
    usar_emojis: settings?.usar_emojis ?? true,
    emojis: {
      principal: settings?.emoji_principal ?? '✨',
      producto: settings?.emoji_producto ?? '•',
      precio: settings?.emoji_precio ?? '💰',
      stock: settings?.emoji_stock ?? '📦',
      asesor: settings?.emoji_asesor ?? '🧑‍💼',
      pago: settings?.emoji_pago ?? '💳'
    },
    saludo_personalizado: settings?.saludo_personalizado,
    despedida_personalizada: settings?.despedida_personalizada,
    mensaje_sin_resultados: settings?.mensaje_sin_resultados ?? DEFAULT_NO_RESULTS,
    mensaje_asesor: settings?.mensaje_asesor,
    mensaje_fuera_horario: settings?.mensaje_fuera_horario,
    reglas_adicionales: settings?.reglas_adicionales,
    sinonimos: settings?.sinonimos_json ?? null,
    handoff: {
      timeout_minutos: positiveIntegerOrNull(settings?.handoff_timeout_minutos) ?? 4,
      mensaje_tomar: settings?.handoff_mensaje_tomar,
      mensaje_declinar: settings?.handoff_mensaje_declinar,
      mensaje_expirado: settings?.handoff_mensaje_expirado,
      mensaje_reactivar: settings?.handoff_mensaje_reactivar
    },
    formato_respuesta: settings?.template?.formato_respuesta ?? DEFAULT_FORMAT
  };
}

function money(value) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    currency: 'MXN',
    style: 'currency'
  });
}

function formatServicePrice(service) {
  const type = String(service?.tipo_precio ?? 'FIJO').toUpperCase();

  if (type === 'COTIZACION') {
    return 'requiere cotizacion con asesor';
  }

  if (type === 'DESDE') {
    return `desde ${money(service.precio)}`;
  }

  if (type === 'POR_M2') {
    return `${money(service.precio)} por m2`;
  }

  return money(service.precio);
}

function renderPreviewItems(profile, items = []) {
  const emojisEnabled = profile.usar_emojis !== false;
  const emoji = (key) => (emojisEnabled ? profile.emojis?.[key] ?? '' : '');

  if (!items.length) {
    return (profile.mensaje_sin_resultados ?? DEFAULT_NO_RESULTS)
      .replaceAll('{emoji_principal}', emoji('principal'));
  }

  const renderedItems = items.map((item, index) => [
    `${index + 1}. ${item.nombre}`,
    item.precio ? `   ${emoji('precio')} Precio: ${item.precio}` : null,
    item.stock !== undefined ? `   ${emoji('stock')} Disponibles: ${item.stock}` : null
  ].filter(Boolean).join('\n')).join('\n\n');

  return (profile.formato_respuesta ?? DEFAULT_FORMAT)
    .replaceAll('{emoji_principal}', emoji('principal'))
    .replaceAll('{items}', renderedItems);
}

export function renderPreviewResponse(profile, products = []) {
  return renderPreviewItems(profile, products);
}

function renderCategories(categories = []) {
  if (!categories.length) {
    return 'Por ahora no hay categorias configuradas.';
  }

  return [
    'Estas son las categorias disponibles:',
    '',
    ...categories.map((category, index) => `${index + 1}. ${category.nombre}${category.tipo ? ` (${String(category.tipo).toLowerCase()})` : ''}`),
    '',
    'Dime cual quieres revisar y te muestro opciones.'
  ].join('\n');
}

async function previewCategories(empresaId) {
  const [rows] = await query(
    `SELECT id, nombre, tipo
     FROM categorias
     WHERE empresa_id = ? AND estado = 'ACTIVA'
     ORDER BY nombre ASC
     LIMIT 20`,
    [empresaId]
  );

  return rows;
}

async function previewServices(empresaId, text) {
  const clean = cleanText(text, '');
  const params = [empresaId];
  const conditions = ["s.empresa_id = ?", "s.estado = 'ACTIVO'"];

  if (clean) {
    const term = `%${clean}%`;
    conditions.push('(s.nombre LIKE ? OR s.descripcion LIKE ? OR c.nombre LIKE ?)');
    params.push(term, term, term);
  }

  const [rows] = await query(
    `SELECT s.id, s.nombre, s.precio, s.tipo_precio, s.duracion_minutos AS duracion, c.nombre AS categoria
     FROM servicios s
     LEFT JOIN categorias c ON c.empresa_id = s.empresa_id AND c.id = s.categoria_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.precio ASC, s.nombre ASC
     LIMIT 8`,
    params
  );

  return rows;
}

async function previewProducts(empresaId, text) {
  const clean = cleanText(text, '');
  const params = [empresaId];
  const conditions = ["p.empresa_id = ?", "p.estado = 'ACTIVO'"];

  if (clean) {
    const term = `%${clean}%`;
    conditions.push('(p.nombre LIKE ? OR p.descripcion LIKE ? OR c.nombre LIKE ?)');
    params.push(term, term, term);
  }

  const [rows] = await query(
    `SELECT p.id, p.nombre, p.precio, p.stock, c.nombre AS categoria
     FROM productos p
     LEFT JOIN categorias c ON c.empresa_id = p.empresa_id AND c.id = p.categoria_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.stock DESC, p.precio ASC, p.nombre ASC
     LIMIT 8`,
    params
  );

  return rows;
}

function normalizePreviewMessage(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function previewMessageKind(message) {
  const text = normalizePreviewMessage(message);

  if (!text || /\b(hola|buenos dias|buen dia|buenas tardes|buenas noches)\b/.test(text)) {
    return 'GREETING';
  }

  if (/\b(no existe|sin resultados|no encuentro|no hay)\b/.test(text)) {
    return 'NO_RESULTS';
  }

  if (/\b(asesor|me interesa|comprar|lo quiero|la quiero)\b/.test(text)) {
    return 'ADVISOR';
  }

  if (/\b(categoria|categorias|catalogo|que manejan|que ofrecen|servicios ofrecen|servicios)\b/.test(text)) {
    return 'CATALOG';
  }

  if (/\b(servicio|diseno|diseño|impresion|rotulacion|senaletica|señaletica|textil|banner|promocional|instalacion|instalación|cotizar|cotizacion)\b/.test(text)) {
    return 'SERVICE_SEARCH';
  }

  return 'PRODUCT_SEARCH';
}

function mergePreviewProfile(baseProfile, payload) {
  return {
    ...baseProfile,
    usar_emojis: payload.usar_emojis === undefined ? baseProfile.usar_emojis : boolValue(payload.usar_emojis),
    emojis: {
      ...(baseProfile.emojis ?? {}),
      principal: payload.emoji_principal ?? baseProfile.emojis?.principal,
      producto: payload.emoji_producto ?? baseProfile.emojis?.producto,
      precio: payload.emoji_precio ?? baseProfile.emojis?.precio,
      stock: payload.emoji_stock ?? baseProfile.emojis?.stock,
      asesor: payload.emoji_asesor ?? baseProfile.emojis?.asesor,
      pago: payload.emoji_pago ?? baseProfile.emojis?.pago
    },
    formato_respuesta: cleanText(payload.formato_respuesta, baseProfile.formato_respuesta ?? DEFAULT_FORMAT),
    saludo_personalizado: cleanText(payload.saludo_personalizado, baseProfile.saludo_personalizado),
    despedida_personalizada: cleanText(payload.despedida_personalizada, baseProfile.despedida_personalizada),
    mensaje_sin_resultados: cleanText(payload.mensaje_sin_resultados, baseProfile.mensaje_sin_resultados ?? DEFAULT_NO_RESULTS),
    mensaje_asesor: cleanText(payload.mensaje_asesor, baseProfile.mensaje_asesor)
  };
}

export async function previewBotResponse(payload) {
  await ensureTables();
  const savedProfile = payload.empresa_id
    ? await getBotResponseProfile(payload.empresa_id)
    : {
        usar_emojis: boolValue(payload.usar_emojis),
        emojis: {
          principal: payload.emoji_principal ?? '✨',
          precio: payload.emoji_precio ?? '💰',
          stock: payload.emoji_stock ?? '📦'
        },
        formato_respuesta: payload.formato_respuesta ?? DEFAULT_FORMAT,
        mensaje_sin_resultados: payload.mensaje_sin_resultados ?? DEFAULT_NO_RESULTS
      };
  const profile = mergePreviewProfile(savedProfile, payload);
  const message = payload.mensaje ?? 'Tienes salas grises';
  const kind = previewMessageKind(message);
  const emojisEnabled = profile.usar_emojis !== false;
  const mainEmoji = emojisEnabled ? profile.emojis?.principal ?? '' : '';

  if (kind === 'GREETING') {
    return {
      mensaje: message,
      respuesta: profile.saludo_personalizado || 'Hola, gracias por escribirnos. Dime que producto o servicio buscas y te ayudo a revisarlo.'
    };
  }

  if (kind === 'NO_RESULTS') {
    return {
      mensaje: message,
      respuesta: (profile.mensaje_sin_resultados ?? DEFAULT_NO_RESULTS).replaceAll('{emoji_principal}', mainEmoji)
    };
  }

  if (kind === 'ADVISOR') {
    return {
      mensaje: message,
      tipo_prueba: 'ASESOR',
      respuesta: profile.mensaje_asesor || 'Perfecto, voy a avisarle a un asesor para que te apoye. Mientras tanto puedo seguir resolviendo tus dudas.'
    };
  }

  if (payload.empresa_id && kind === 'CATALOG') {
    const normalized = normalizePreviewMessage(message);
    const empresaId = Number(payload.empresa_id);
    const [categories, services] = await Promise.all([
      previewCategories(empresaId).catch(() => []),
      previewServices(empresaId, '').catch(() => [])
    ]);

    if (normalized.includes('servicio') && services.length > 0) {
      return {
        mensaje: message,
        tipo_prueba: 'SERVICIOS_REALES',
        respuesta: renderPreviewItems(
          profile,
          services.map((service) => ({
            nombre: service.nombre,
            precio: formatServicePrice(service)
          }))
        )
      };
    }

    return {
      mensaje: message,
      tipo_prueba: 'CATEGORIAS_REALES',
      respuesta: renderCategories(categories)
    };
  }

  if (payload.empresa_id && kind === 'SERVICE_SEARCH') {
    const services = await previewServices(Number(payload.empresa_id), message).catch(() => []);

    return {
      mensaje: message,
      tipo_prueba: 'BUSQUEDA_SERVICIOS',
      respuesta: renderPreviewItems(
        profile,
        services.map((service) => ({
          nombre: service.nombre,
          precio: formatServicePrice(service)
        }))
      )
    };
  }

  if (payload.empresa_id) {
    const products = await previewProducts(Number(payload.empresa_id), message).catch(() => []);

    return {
      mensaje: message,
      tipo_prueba: 'BUSQUEDA_PRODUCTOS',
      respuesta: renderPreviewItems(
        profile,
        products.map((product) => ({
          nombre: product.nombre,
          precio: money(product.precio),
          stock: Number(product.stock) > 0 ? product.stock : 'sin stock disponible'
        }))
      )
    };
  }

  return {
    mensaje: message,
    tipo_prueba: 'DEMO_SIN_EMPRESA',
    respuesta: renderPreviewResponse(profile, [
      { nombre: 'Sala gris contemporanea', precio: '$12,500.00', stock: 2 },
      { nombre: 'Sala modular gris', precio: '$18,900.00', stock: 1 }
    ])
  };
}
