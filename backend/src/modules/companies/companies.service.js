import { query } from '../../config/database.js';
import { getAuthenticatedEmpresaId, isSuperAdmin, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { getPlanConfig } from '../../config/plans.js';
import { createToken, sanitizeUser } from '../auth/auth.service.js';
import { createHttpError } from '../../utils/http-error.js';
import { companyProviderService } from '../../messaging/company-provider.service.js';

const COMPANY_COLUMNS = `
  id,
  nombre,
  slug,
  telefono,
  direccion,
  tipo_negocio,
  logo,
  plan,
  activo,
  estado,
  fecha_creacion,
  fecha_actualizacion
`;

function toSlug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeCompanyPayload(payload) {
  const nombre = String(payload.nombre ?? '').trim();

  if (!nombre) {
    throw createHttpError(400, 'El nombre de la empresa es requerido');
  }

  return {
    nombre,
    telefono: String(payload.telefono ?? '').trim() || null,
    direccion: String(payload.direccion ?? '').trim() || null,
    tipo_negocio: String(payload.tipo_negocio ?? '').trim() || null,
    logo: String(payload.logo ?? '').trim() || null,
    plan: String(payload.plan ?? 'STARTER').trim().toUpperCase(),
    activo: payload.activo !== false
  };
}

function assertValidPlan(plan) {
  const allowedPlans = ['BASICO', 'PRO', 'STARTER', 'BUSINESS', 'ENTERPRISE'];

  if (!allowedPlans.includes(plan)) {
    throw createHttpError(400, 'El plan debe ser STARTER, BUSINESS o ENTERPRISE');
  }
}

function mapDuplicateError(error) {
  if (error?.code === 'ER_DUP_ENTRY') {
    throw createHttpError(409, 'Ya existe una empresa con ese nombre o identificador');
  }

  throw error;
}

function resolveAccessibleCompanyId(companyId, auth) {
  if (isSuperAdmin(auth)) {
    return companyId;
  }

  const scopedCompanyId = resolveScopedEmpresaId(auth, companyId);

  if (Number(companyId) !== scopedCompanyId) {
    throw createHttpError(404, 'Empresa no encontrada');
  }

  return scopedCompanyId;
}

export async function findCompanies(auth) {
  const scope = isSuperAdmin(auth)
    ? { clause: '', params: [] }
    : { clause: 'AND id = ?', params: [getAuthenticatedEmpresaId(auth)] };

  const [rows] = await query(
    `SELECT ${COMPANY_COLUMNS}
     FROM empresas
     WHERE 1 = 1
     ${scope.clause}
     ORDER BY fecha_creacion DESC`,
    scope.params
  );

  return rows;
}

export async function findCompanyById(companyId, auth) {
  const requestedCompanyId = resolveAccessibleCompanyId(companyId, auth);

  const [rows] = await query(
    `SELECT ${COMPANY_COLUMNS}
     FROM empresas
     WHERE id = ?
     LIMIT 1`,
    [requestedCompanyId]
  );

  return rows[0] ?? null;
}

export async function createCompany(payload, {
  queryFn = query,
  providerService = companyProviderService,
  findCompany = findCompanyById
} = {}) {
  const company = normalizeCompanyPayload(payload);
  assertValidPlan(company.plan);

  const slug = toSlug(company.nombre);
  const estado = company.activo ? 'ACTIVA' : 'INACTIVA';

  try {
    const [result] = await queryFn(
      `INSERT INTO empresas
        (nombre, slug, telefono, direccion, tipo_negocio, logo, plan, activo, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company.nombre,
        slug,
        company.telefono,
        company.direccion,
        company.tipo_negocio,
        company.logo,
        company.plan,
        company.activo ? 1 : 0,
        estado
      ]
    );

    await providerService.ensureDefaultSessionConfig(result.insertId);
    return findCompany(result.insertId, { user: { rol: 'SUPER_ADMIN' } });
  } catch (error) {
    mapDuplicateError(error);
  }
}

export async function updateCompany(companyId, payload, auth) {
  const scopedCompanyId = resolveAccessibleCompanyId(companyId, auth);
  const currentCompany = await findCompanyById(scopedCompanyId, auth);

  if (!currentCompany) {
    throw createHttpError(404, 'Empresa no encontrada');
  }

  const company = normalizeCompanyPayload({
    ...payload,
    plan: isSuperAdmin(auth) ? payload.plan : currentCompany.plan,
    activo: isSuperAdmin(auth) ? payload.activo : Boolean(currentCompany.activo)
  });
  assertValidPlan(company.plan);

  const slug = toSlug(company.nombre);
  const estado = company.activo ? 'ACTIVA' : 'INACTIVA';

  try {
    await query(
      `UPDATE empresas
       SET nombre = ?,
           slug = ?,
           telefono = ?,
           direccion = ?,
           tipo_negocio = ?,
           logo = COALESCE(?, logo),
           plan = ?,
           activo = ?,
           estado = ?
       WHERE id = ?`,
      [
        company.nombre,
        slug,
        company.telefono,
        company.direccion,
        company.tipo_negocio,
        company.logo,
        company.plan,
        company.activo ? 1 : 0,
        estado,
        scopedCompanyId
      ]
    );

    return findCompanyById(scopedCompanyId, auth);
  } catch (error) {
    mapDuplicateError(error);
  }
}

export async function deleteCompany(companyId) {
  const [result] = await query('DELETE FROM empresas WHERE id = ?', [companyId]);

  if (result.affectedRows === 0) {
    throw createHttpError(404, 'Empresa no encontrada');
  }

  return true;
}

function assertSuperAdmin(auth) {
  if (!isSuperAdmin(auth)) {
    throw createHttpError(403, 'Solo SUPER_ADMIN puede acceder a esta operacion');
  }
}

function scoreCompanyHealth(company) {
  let score = 0;

  if (company.activo) score += 15;
  if (company.whatsapp_status === 'CONNECTED') score += 20;
  if (Number(company.activo_ia ?? 1) === 1) score += 12;
  if (Number(company.activo_whatsapp ?? 1) === 1) score += 10;
  if (Number(company.productos_activos ?? 0) + Number(company.servicios_activos ?? 0) > 0) score += 15;
  if (Number(company.leads_30d ?? 0) > 0) score += 12;
  if (Number(company.conversaciones_30d ?? 0) > 0) score += 10;
  if (company.template_nombre) score += 6;
  if (company.ultimo_error) score -= 18;

  return Math.max(0, Math.min(score, 100));
}

export async function getSaasGlobalOverview(auth) {
  assertSuperAdmin(auth);

  const [rows] = await query(
    `SELECT
       e.id,
       e.nombre,
       e.slug,
       e.telefono,
       e.direccion,
       e.tipo_negocio,
       e.logo,
       e.plan,
       e.activo,
       e.estado,
       e.fecha_creacion,
       COALESCE(ce.activo_ia, 1) AS activo_ia,
       COALESCE(ce.activo_whatsapp, 1) AS activo_whatsapp,
       w.status AS whatsapp_status,
       w.phone AS whatsapp_numero,
       w.last_error AS whatsapp_error,
       w.updated_at AS whatsapp_updated_at,
       brs.template_id,
       bpt.nombre AS template_nombre,
       COALESCE(metrics.leads_30d, 0) AS leads_30d,
       COALESCE(metrics.ganados_30d, 0) AS ganados_30d,
       COALESCE(metrics.conversaciones_30d, 0) AS conversaciones_30d,
       COALESCE(metrics.respuestas_ia_30d, 0) AS respuestas_ia_30d,
       COALESCE(metrics.productos_activos, 0) AS productos_activos,
       COALESCE(metrics.servicios_activos, 0) AS servicios_activos,
       COALESCE(metrics.usuarios_activos, 0) AS usuarios_activos,
       latest_error.error AS ultimo_error,
       latest_error.fecha_creacion AS ultimo_error_fecha
     FROM empresas e
     LEFT JOIN configuracion_empresas ce ON ce.empresa_id = e.id
     LEFT JOIN whatsapp_session_status w ON w.empresa_id = e.id
     LEFT JOIN bot_response_settings brs ON brs.empresa_id = e.id
     LEFT JOIN bot_prompt_templates bpt ON bpt.id = brs.template_id
     LEFT JOIN (
       SELECT
         e2.id AS empresa_id,
         (SELECT COUNT(*) FROM leads l WHERE l.empresa_id = e2.id AND l.fecha_creacion >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS leads_30d,
         (SELECT COUNT(*) FROM leads l WHERE l.empresa_id = e2.id AND l.estado = 'GANADO' AND l.fecha_creacion >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS ganados_30d,
         (SELECT COUNT(*) FROM conversaciones c WHERE c.empresa_id = e2.id AND c.fecha >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS conversaciones_30d,
         (SELECT COUNT(*) FROM conversaciones c WHERE c.empresa_id = e2.id AND c.fecha >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND c.respuesta IS NOT NULL AND c.respuesta <> '') AS respuestas_ia_30d,
         (SELECT COUNT(*) FROM productos p WHERE p.empresa_id = e2.id AND p.estado = 'ACTIVO') AS productos_activos,
         (SELECT COUNT(*) FROM servicios s WHERE s.empresa_id = e2.id AND s.estado = 'ACTIVO') AS servicios_activos,
         (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = e2.id AND u.estado = 'ACTIVO') AS usuarios_activos
       FROM empresas e2
     ) metrics ON metrics.empresa_id = e.id
     LEFT JOIN (
       SELECT n1.*
       FROM notificaciones n1
       INNER JOIN (
         SELECT empresa_id, MAX(fecha_creacion) AS fecha_creacion
         FROM notificaciones
         WHERE estado = 'ERROR'
         GROUP BY empresa_id
       ) last_errors
         ON last_errors.empresa_id = n1.empresa_id
        AND last_errors.fecha_creacion = n1.fecha_creacion
     ) latest_error ON latest_error.empresa_id = e.id
     ORDER BY e.fecha_creacion DESC`
  );

  const companies = rows.map((company) => {
    const leads = Number(company.leads_30d ?? 0);
    const won = Number(company.ganados_30d ?? 0);

    return {
      ...company,
      activo: Boolean(company.activo),
      activo_ia: Boolean(company.activo_ia),
      activo_whatsapp: Boolean(company.activo_whatsapp),
      leads_30d: leads,
      ganados_30d: won,
      conversaciones_30d: Number(company.conversaciones_30d ?? 0),
      respuestas_ia_30d: Number(company.respuestas_ia_30d ?? 0),
      productos_activos: Number(company.productos_activos ?? 0),
      servicios_activos: Number(company.servicios_activos ?? 0),
      usuarios_activos: Number(company.usuarios_activos ?? 0),
      conversion_30d: leads > 0 ? Number(((won / leads) * 100).toFixed(2)) : 0,
      plan_key: getPlanConfig(company.plan).key,
      plan_label: getPlanConfig(company.plan).label,
      ingreso_estimado_mensual: getPlanConfig(company.plan).estimatedMonthlyPrice,
      salud_saas: scoreCompanyHealth(company)
    };
  });

  const totals = companies.reduce((accumulator, company) => ({
    empresas: accumulator.empresas + 1,
    activas: accumulator.activas + (company.activo ? 1 : 0),
    inactivas: accumulator.inactivas + (company.activo ? 0 : 1),
    whatsapp_conectadas: accumulator.whatsapp_conectadas + (company.whatsapp_status === 'CONNECTED' ? 1 : 0),
    ia_activas: accumulator.ia_activas + (company.activo_ia ? 1 : 0),
    leads_30d: accumulator.leads_30d + company.leads_30d,
    conversaciones_30d: accumulator.conversaciones_30d + company.conversaciones_30d,
    respuestas_ia_30d: accumulator.respuestas_ia_30d + company.respuestas_ia_30d,
    usuarios_activos: accumulator.usuarios_activos + company.usuarios_activos,
    ingreso_estimado_mensual: accumulator.ingreso_estimado_mensual + company.ingreso_estimado_mensual,
    errores: accumulator.errores + (company.ultimo_error ? 1 : 0),
    plantillas_asignadas: accumulator.plantillas_asignadas + (company.template_id ? 1 : 0)
  }), {
    empresas: 0,
    activas: 0,
    inactivas: 0,
    whatsapp_conectadas: 0,
    ia_activas: 0,
    leads_30d: 0,
    conversaciones_30d: 0,
    respuestas_ia_30d: 0,
    usuarios_activos: 0,
    ingreso_estimado_mensual: 0,
    errores: 0,
    plantillas_asignadas: 0
  });

  const [auditRows] = await query(
    `SELECT
       a.id,
       a.accion,
       a.modulo,
       a.descripcion,
       a.fecha,
       u.nombre AS usuario_nombre,
       e.nombre AS empresa_nombre
     FROM audit_logs a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     LEFT JOIN empresas e ON e.id = a.empresa_id
     ORDER BY a.fecha DESC
     LIMIT 12`
  );

  return {
    resumen: {
      ...totals,
      salud_promedio: companies.length
        ? Math.round(companies.reduce((sum, company) => sum + company.salud_saas, 0) / companies.length)
        : 0,
      ingreso_estimado_anual: totals.ingreso_estimado_mensual * 12
    },
    empresas: companies,
    auditoria_reciente: auditRows
  };
}

export async function impersonateCompanyOwner(companyId, auth) {
  assertSuperAdmin(auth);

  const [rows] = await query(
    `SELECT
       u.id,
       u.empresa_id,
       u.nombre,
       u.email,
       u.rol,
       u.estado,
       e.nombre AS empresa_nombre,
       e.slug AS empresa_slug,
       e.activo AS empresa_activo,
       e.estado AS empresa_estado
     FROM usuarios u
     INNER JOIN empresas e ON e.id = u.empresa_id
     WHERE u.empresa_id = ?
       AND u.rol IN ('OWNER', 'owner')
       AND u.estado = 'ACTIVO'
       AND e.activo = 1
     ORDER BY u.fecha_creacion ASC
     LIMIT 1`,
    [companyId]
  );
  const owner = rows[0];

  if (!owner) {
    throw createHttpError(404, 'No hay OWNER activo para esta empresa');
  }

  return {
    user: sanitizeUser(owner),
    accessToken: createToken(owner),
    impersonation: {
      by_user_id: auth.user.id,
      by_email: auth.user.email,
      empresa_id: Number(companyId)
    }
  };
}
