import { query } from '../../config/database.js';
import {
  getAuthenticatedEmpresaId,
  isSuperAdmin,
  resolveScopedEmpresaId
} from '../../middlewares/company-scope.middleware.js';
import { createHttpError } from '../../utils/http-error.js';

const SETTINGS_COLUMNS = `
  e.id AS empresa_id,
  ce.nombre_bot,
  ce.tono_respuesta,
  ce.mensaje_bienvenida,
  ce.mensaje_fuera_horario,
  ce.instrucciones_negocio,
  ce.temas_bloqueados,
  ce.faq_personalizada,
  COALESCE(ce.auto_pedidos, 1) AS auto_pedidos,
  COALESCE(ce.envio_imagenes, 1) AS envio_imagenes,
  ce.fallback_message,
  ce.telefono_dueno,
  ce.direccion,
  ce.horario_atencion,
  ce.politica_entrega,
  ce.politica_pagos,
  COALESCE(ce.activo_ia, 1) AS activo_ia,
  COALESCE(ce.activo_whatsapp, 1) AS activo_whatsapp,
  ce.fecha_creacion,
  ce.fecha_actualizacion,
  e.nombre AS empresa_nombre,
  e.tipo_negocio AS empresa_tipo_negocio,
  e.logo AS empresa_logo,
  e.telefono AS empresa_telefono,
  e.direccion AS empresa_direccion,
  e.plan AS empresa_plan,
  e.activo AS empresa_activo
`;

function nullableText(value) {
  const cleanValue = String(value ?? '').trim();
  return cleanValue || null;
}

function normalizeBoolean(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeSettingsPayload(payload, auth) {
  return {
    empresaId: resolveScopedEmpresaId(auth, payload.empresa_id),
    nombreBot: nullableText(payload.nombre_bot),
    tonoRespuesta: nullableText(payload.tono_respuesta),
    mensajeBienvenida: nullableText(payload.mensaje_bienvenida),
    mensajeFueraHorario: nullableText(payload.mensaje_fuera_horario),
    instruccionesNegocio: nullableText(payload.instrucciones_negocio),
    temasBloqueados: nullableText(payload.temas_bloqueados),
    faqPersonalizada: nullableText(payload.faq_personalizada),
    autoPedidos: normalizeBoolean(payload.auto_pedidos),
    envioImagenes: normalizeBoolean(payload.envio_imagenes),
    fallbackMessage: nullableText(payload.fallback_message),
    telefonoDueno: nullableText(payload.telefono_dueno),
    direccion: nullableText(payload.direccion),
    horarioAtencion: nullableText(payload.horario_atencion),
    politicaEntrega: nullableText(payload.politica_entrega),
    politicaPagos: nullableText(payload.politica_pagos),
    activoIa: normalizeBoolean(payload.activo_ia),
    activoWhatsapp: normalizeBoolean(payload.activo_whatsapp)
  };
}

function mapDatabaseError(error) {
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    throw createHttpError(400, 'La empresa seleccionada no existe');
  }

  throw error;
}

function mapSettingsRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    activo_ia: Boolean(row.activo_ia),
    activo_whatsapp: Boolean(row.activo_whatsapp),
    auto_pedidos: Boolean(row.auto_pedidos),
    envio_imagenes: Boolean(row.envio_imagenes),
    empresa_activo: Boolean(row.empresa_activo)
  };
}

export async function findCompanySettings(auth) {
  const scope = isSuperAdmin(auth)
    ? { clause: '', params: [] }
    : { clause: 'WHERE e.id = ?', params: [getAuthenticatedEmpresaId(auth)] };

  const [rows] = await query(
    `SELECT ${SETTINGS_COLUMNS}
     FROM empresas e
     LEFT JOIN configuracion_empresas ce ON ce.empresa_id = e.id
     ${scope.clause}
     ORDER BY e.fecha_creacion DESC`,
    scope.params
  );

  return rows.map(mapSettingsRow);
}

export async function findCompanySettingsByCompanyId(companyId, auth) {
  const scopedCompanyId = resolveScopedEmpresaId(auth, companyId);

  if (!isSuperAdmin(auth) && Number(companyId) !== scopedCompanyId) {
    throw createHttpError(404, 'Configuracion no encontrada');
  }

  const [rows] = await query(
    `SELECT ${SETTINGS_COLUMNS}
     FROM empresas e
     LEFT JOIN configuracion_empresas ce ON ce.empresa_id = e.id
     WHERE e.id = ?
     LIMIT 1`,
    [scopedCompanyId]
  );

  return mapSettingsRow(rows[0] ?? null);
}

export async function upsertCompanySettings(payload, auth) {
  const settings = normalizeSettingsPayload(payload, auth);

  try {
    await query(
      `INSERT INTO configuracion_empresas
        (
          empresa_id,
          nombre_bot,
          tono_respuesta,
          mensaje_bienvenida,
          mensaje_fuera_horario,
          instrucciones_negocio,
          temas_bloqueados,
          faq_personalizada,
          auto_pedidos,
          envio_imagenes,
          fallback_message,
          telefono_dueno,
          direccion,
          horario_atencion,
          politica_entrega,
          politica_pagos,
          activo_ia,
          activo_whatsapp
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
          nombre_bot = VALUES(nombre_bot),
          tono_respuesta = VALUES(tono_respuesta),
          mensaje_bienvenida = VALUES(mensaje_bienvenida),
          mensaje_fuera_horario = VALUES(mensaje_fuera_horario),
          instrucciones_negocio = VALUES(instrucciones_negocio),
          temas_bloqueados = VALUES(temas_bloqueados),
          faq_personalizada = VALUES(faq_personalizada),
          auto_pedidos = VALUES(auto_pedidos),
          envio_imagenes = VALUES(envio_imagenes),
          fallback_message = VALUES(fallback_message),
          telefono_dueno = VALUES(telefono_dueno),
          direccion = VALUES(direccion),
          horario_atencion = VALUES(horario_atencion),
          politica_entrega = VALUES(politica_entrega),
          politica_pagos = VALUES(politica_pagos),
          activo_ia = VALUES(activo_ia),
          activo_whatsapp = VALUES(activo_whatsapp)`,
      [
        settings.empresaId,
        settings.nombreBot,
        settings.tonoRespuesta,
        settings.mensajeBienvenida,
        settings.mensajeFueraHorario,
        settings.instruccionesNegocio,
        settings.temasBloqueados,
        settings.faqPersonalizada,
        settings.autoPedidos ? 1 : 0,
        settings.envioImagenes ? 1 : 0,
        settings.fallbackMessage,
        settings.telefonoDueno,
        settings.direccion,
        settings.horarioAtencion,
        settings.politicaEntrega,
        settings.politicaPagos,
        settings.activoIa ? 1 : 0,
        settings.activoWhatsapp ? 1 : 0
      ]
    );

    return findCompanySettingsByCompanyId(settings.empresaId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteCompanySettings(companyId, auth) {
  const scopedCompanyId = resolveScopedEmpresaId(auth, companyId);

  if (!isSuperAdmin(auth) && Number(companyId) !== scopedCompanyId) {
    throw createHttpError(404, 'Configuracion no encontrada');
  }

  const [result] = await query('DELETE FROM configuracion_empresas WHERE empresa_id = ?', [scopedCompanyId]);

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Configuracion no encontrada');
  }

  return true;
}
