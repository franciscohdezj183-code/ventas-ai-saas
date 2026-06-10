import { query } from '../../config/database.js';
import {
  getAuthenticatedEmpresaId,
  isSuperAdmin
} from '../../middlewares/company-scope.middleware.js';
import { listWhatsappStatuses } from '../whatsapp/whatsapp.service.js';

const DEFAULT_RANGE_DAYS = 30;

function toDateOnly(value) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultStartDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));
  return date.toISOString().slice(0, 10);
}

function normalizeDateFilters(filters = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = toDateOnly(filters.fecha_inicio) ?? defaultStartDate();
  const endDate = toDateOnly(filters.fecha_fin) ?? today;

  return {
    fecha_inicio: startDate,
    fecha_fin: endDate,
    start: `${startDate} 00:00:00`,
    endExclusive: `${addDays(endDate, 1)} 00:00:00`
  };
}

function companyCondition(auth, alias) {
  if (isSuperAdmin(auth)) {
    return { clause: '', params: [] };
  }

  return {
    clause: `AND ${alias}.empresa_id = ?`,
    params: [getAuthenticatedEmpresaId(auth)]
  };
}

function companyWhere(auth, alias) {
  const scope = companyCondition(auth, alias);
  return {
    clause: scope.clause ? `WHERE ${scope.clause.slice(4)}` : '',
    params: scope.params
  };
}

function dateCondition(alias, column, dateRange) {
  return {
    clause: `AND ${alias}.${column} >= ? AND ${alias}.${column} < ?`,
    params: [dateRange.start, dateRange.endExclusive]
  };
}

function combineWhere(...conditions) {
  const clauses = [];
  const params = [];

  conditions.forEach((condition) => {
    if (!condition?.clause) {
      return;
    }

    clauses.push(condition.clause.replace(/^AND\s+/i, ''));
    params.push(...condition.params);
  });

  return {
    clause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

async function scalarCount(sql, params = []) {
  const [rows] = await query(sql, params);
  return Number(rows[0]?.total ?? 0);
}

async function leadCountByState(auth, dateRange, state) {
  const where = combineWhere(
    companyCondition(auth, 'l'),
    dateCondition('l', 'fecha_creacion', dateRange),
    { clause: 'AND l.estado = ?', params: [state] }
  );

  return scalarCount(`SELECT COUNT(*) AS total FROM leads l ${where.clause}`, where.params);
}

export async function getDashboardSummary(auth, filters = {}) {
  const dateRange = normalizeDateFilters(filters);
  const leadWhere = combineWhere(
    companyCondition(auth, 'l'),
    dateCondition('l', 'fecha_creacion', dateRange)
  );
  const conversationWhere = combineWhere(
    companyCondition(auth, 'c'),
    dateCondition('c', 'fecha', dateRange)
  );
  const activeCompanyWhere = isSuperAdmin(auth)
    ? { clause: "WHERE e.activo = 1 AND e.estado = 'ACTIVA'", params: [] }
    : { clause: "WHERE e.id = ? AND e.activo = 1 AND e.estado = 'ACTIVA'", params: [getAuthenticatedEmpresaId(auth)] };

  const [totalLeads, leadsNuevos, leadsGanados, conversationsToday, activeCompanies] = await Promise.all([
    scalarCount(`SELECT COUNT(*) AS total FROM leads l ${leadWhere.clause}`, leadWhere.params),
    leadCountByState(auth, dateRange, 'NUEVO'),
    leadCountByState(auth, dateRange, 'GANADO'),
    scalarCount(
      `SELECT COUNT(*) AS total FROM conversaciones c ${conversationWhere.clause}`,
      conversationWhere.params
    ),
    scalarCount(`SELECT COUNT(*) AS total FROM empresas e ${activeCompanyWhere.clause}`, activeCompanyWhere.params)
  ]);

  const whatsappStatuses = listWhatsappStatuses();
  const whatsappConnected = whatsappStatuses.filter((status) => {
    if (status.status !== 'CONNECTED') {
      return false;
    }

    return isSuperAdmin(auth) || Number(status.empresa_id) === getAuthenticatedEmpresaId(auth);
  }).length;
  const conversionRate = totalLeads > 0 ? Number(((leadsGanados / totalLeads) * 100).toFixed(2)) : 0;

  return {
    date_range: {
      fecha_inicio: dateRange.fecha_inicio,
      fecha_fin: dateRange.fecha_fin
    },
    totals: {
      conversaciones_hoy: conversationsToday,
      leads_nuevos: leadsNuevos,
      leads_ganados: leadsGanados,
      total_leads: totalLeads,
      tasa_conversion: conversionRate,
      empresas_activas: activeCompanies,
      sesiones_whatsapp_conectadas: whatsappConnected
    }
  };
}

export async function getTopProducts(auth, filters = {}) {
  const dateRange = normalizeDateFilters(filters);
  const productScope = companyWhere(auth, 'p');
  const params = [
    dateRange.start,
    dateRange.endExclusive,
    dateRange.start,
    dateRange.endExclusive,
    ...productScope.params
  ];

  const [rows] = await query(
    `SELECT
       p.id,
       p.nombre,
       COALESCE(consultas.total, 0) AS consultas
     FROM productos p
     LEFT JOIN (
       SELECT empresa_id, item_id, SUM(total) AS total
       FROM (
         SELECT p2.empresa_id, p2.id AS item_id, COUNT(*) AS total
         FROM productos p2
         INNER JOIN conversaciones c
           ON c.empresa_id = p2.empresa_id
          AND c.fecha >= ?
          AND c.fecha < ?
          AND c.mensaje LIKE CONCAT('%', p2.nombre, '%')
         GROUP BY p2.empresa_id, p2.id
         UNION ALL
         SELECT p3.empresa_id, p3.id AS item_id, COUNT(*) AS total
         FROM productos p3
         INNER JOIN leads l
           ON l.empresa_id = p3.empresa_id
          AND l.fecha_creacion >= ?
          AND l.fecha_creacion < ?
          AND l.interes LIKE CONCAT('%', p3.nombre, '%')
         GROUP BY p3.empresa_id, p3.id
       ) product_hits
       GROUP BY empresa_id, item_id
     ) consultas ON consultas.empresa_id = p.empresa_id AND consultas.item_id = p.id
     ${productScope.clause}
     ORDER BY consultas DESC, p.nombre ASC
     LIMIT 5`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    consultas: Number(row.consultas)
  }));
}

export async function getTopServices(auth, filters = {}) {
  const dateRange = normalizeDateFilters(filters);
  const serviceScope = companyWhere(auth, 's');
  const params = [
    dateRange.start,
    dateRange.endExclusive,
    dateRange.start,
    dateRange.endExclusive,
    ...serviceScope.params
  ];

  const [rows] = await query(
    `SELECT
       s.id,
       s.nombre,
       COALESCE(consultas.total, 0) AS consultas
     FROM servicios s
     LEFT JOIN (
       SELECT empresa_id, item_id, SUM(total) AS total
       FROM (
         SELECT s2.empresa_id, s2.id AS item_id, COUNT(*) AS total
         FROM servicios s2
         INNER JOIN conversaciones c
           ON c.empresa_id = s2.empresa_id
          AND c.fecha >= ?
          AND c.fecha < ?
          AND c.mensaje LIKE CONCAT('%', s2.nombre, '%')
         GROUP BY s2.empresa_id, s2.id
         UNION ALL
         SELECT s3.empresa_id, s3.id AS item_id, COUNT(*) AS total
         FROM servicios s3
         INNER JOIN leads l
           ON l.empresa_id = s3.empresa_id
          AND l.fecha_creacion >= ?
          AND l.fecha_creacion < ?
          AND l.interes LIKE CONCAT('%', s3.nombre, '%')
         GROUP BY s3.empresa_id, s3.id
       ) service_hits
       GROUP BY empresa_id, item_id
     ) consultas ON consultas.empresa_id = s.empresa_id AND consultas.item_id = s.id
     ${serviceScope.clause}
     ORDER BY consultas DESC, s.nombre ASC
     LIMIT 5`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    nombre: row.nombre,
    consultas: Number(row.consultas)
  }));
}

export async function getRecentErrors(auth, filters = {}) {
  const dateRange = normalizeDateFilters(filters);
  const notificationWhere = combineWhere(
    companyCondition(auth, 'n'),
    dateCondition('n', 'fecha_creacion', dateRange),
    { clause: "AND n.estado = 'ERROR'", params: [] }
  );

  const [notificationRows] = await query(
    `SELECT
       n.id,
       n.empresa_id,
       e.nombre AS empresa_nombre,
       n.tipo,
       n.error,
       n.fecha_creacion
     FROM notificaciones n
     INNER JOIN empresas e ON e.id = n.empresa_id
     ${notificationWhere.clause}
     ORDER BY n.fecha_creacion DESC
     LIMIT 10`,
    notificationWhere.params
  );

  const whatsappErrors = listWhatsappStatuses()
    .filter((status) => status.last_error)
    .filter((status) => isSuperAdmin(auth) || Number(status.empresa_id) === getAuthenticatedEmpresaId(auth))
    .map((status) => ({
      id: `whatsapp-${status.empresa_id}`,
      empresa_id: status.empresa_id,
      empresa_nombre: null,
      tipo: 'WHATSAPP',
      error: status.last_error,
      fecha_creacion: status.updated_at
    }));

  return [...notificationRows, ...whatsappErrors]
    .sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion))
    .slice(0, 10);
}

export async function getCommercialDashboard(auth, filters = {}) {
  const [summary, topProducts, topServices, recentErrors] = await Promise.all([
    getDashboardSummary(auth, filters),
    getTopProducts(auth, filters),
    getTopServices(auth, filters),
    getRecentErrors(auth, filters)
  ]);

  return {
    ...summary,
    productos_mas_consultados: topProducts,
    servicios_mas_consultados: topServices,
    errores_recientes: recentErrors
  };
}
