import { query } from '../../config/database.js';
import {
  getAuthenticatedEmpresaId,
  isSuperAdmin,
  resolveScopedEmpresaId
} from '../../middlewares/company-scope.middleware.js';
import { getMonthlyAIUsage } from '../ai-usage/ai-usage.service.js';

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
  const fechaInicio = toDateOnly(filters.fecha_inicio) ?? defaultStartDate();
  const fechaFin = toDateOnly(filters.fecha_fin) ?? today;

  return {
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    start: `${fechaInicio} 00:00:00`,
    endExclusive: `${addDays(fechaFin, 1)} 00:00:00`
  };
}

function toDateKey(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function scopedCompanyCondition(auth, alias, requestedCompanyId = null) {
  if (!isSuperAdmin(auth)) {
    return {
      clause: `AND ${alias}.empresa_id = ?`,
      params: [getAuthenticatedEmpresaId(auth)]
    };
  }

  const empresaId = resolveScopedEmpresaId(auth, requestedCompanyId, { requiredForSuperAdmin: false });

  if (!empresaId) {
    return { clause: '', params: [] };
  }

  return {
    clause: `AND ${alias}.empresa_id = ?`,
    params: [empresaId]
  };
}

function combineWhere(...conditions) {
  const clauses = [];
  const params = [];

  for (const condition of conditions) {
    if (!condition?.clause) {
      continue;
    }

    clauses.push(condition.clause.replace(/^AND\s+/i, ''));
    params.push(...condition.params);
  }

  return {
    clause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

async function scalar(sql, params = []) {
  const [rows] = await query(sql, params);
  return Number(rows[0]?.total ?? 0);
}

async function getOrderMetrics(auth, range, requestedCompanyId) {
  const scope = scopedCompanyCondition(auth, 'o', requestedCompanyId);
  const where = combineWhere(
    scope,
    { clause: 'AND o.fecha >= ? AND o.fecha < ?', params: [range.start, range.endExclusive] }
  );
  const [rows] = await query(
    `SELECT COUNT(*) AS pedidos_generados, COALESCE(SUM(o.total), 0) AS ventas_estimadas
     FROM pedidos o
     ${where.clause}`,
    where.params
  );
  const row = rows[0] ?? {};

  return {
    pedidos_generados: Number(row.pedidos_generados ?? 0),
    ventas_estimadas: Number(row.ventas_estimadas ?? 0),
    source: 'orders_module'
  };
}

async function getConversationMetrics(auth, range, requestedCompanyId) {
  const scope = scopedCompanyCondition(auth, 'c', requestedCompanyId);
  const where = combineWhere(
    scope,
    { clause: 'AND c.fecha >= ? AND c.fecha < ?', params: [range.start, range.endExclusive] }
  );
  const [rows] = await query(
    `SELECT
       COUNT(*) AS total_conversaciones,
       SUM(CASE WHEN c.tipo_mensaje = 'bot' OR (c.respuesta IS NOT NULL AND c.respuesta <> '' AND (c.tipo_mensaje IS NULL OR c.tipo_mensaje <> 'human')) THEN 1 ELSE 0 END) AS atendidas_bot,
       SUM(CASE WHEN c.estado IN ('requires_human','human_active') THEN 1 ELSE 0 END) AS pidieron_humano
     FROM conversaciones c
     ${where.clause}`,
    where.params
  );
  const row = rows[0] ?? {};

  return {
    total_conversaciones: Number(row.total_conversaciones ?? 0),
    conversaciones_atendidas_bot: Number(row.atendidas_bot ?? 0),
    conversaciones_pidieron_humano: Number(row.pidieron_humano ?? 0)
  };
}

async function getNewCustomers(auth, range, requestedCompanyId) {
  const scope = scopedCompanyCondition(auth, 'c', requestedCompanyId);
  const where = combineWhere(scope);
  const [rows] = await query(
    `SELECT COUNT(*) AS total
     FROM (
       SELECT c.empresa_id, c.telefono_cliente, MIN(c.fecha) AS primera_fecha
       FROM conversaciones c
       ${where.clause}
       GROUP BY c.empresa_id, c.telefono_cliente
     ) clientes
     WHERE clientes.primera_fecha >= ? AND clientes.primera_fecha < ?`,
    [...where.params, range.start, range.endExclusive]
  );

  return Number(rows[0]?.total ?? 0);
}

async function getMessagesByDay(auth, range, requestedCompanyId) {
  const scope = scopedCompanyCondition(auth, 'c', requestedCompanyId);
  const where = combineWhere(
    scope,
    { clause: 'AND c.fecha >= ? AND c.fecha < ?', params: [range.start, range.endExclusive] }
  );
  const [rows] = await query(
    `SELECT DATE(c.fecha) AS fecha, COUNT(*) AS total
     FROM conversaciones c
     ${where.clause}
     GROUP BY DATE(c.fecha)
     ORDER BY fecha ASC`,
    where.params
  );
  const totalsByDate = new Map(rows.map((row) => [toDateKey(row.fecha), Number(row.total ?? 0)]));
  const days = [];
  let cursor = range.fecha_inicio;

  while (cursor <= range.fecha_fin) {
    days.push({
      fecha: cursor,
      mensajes: totalsByDate.get(cursor) ?? 0
    });
    cursor = addDays(cursor, 1);
  }

  return days;
}

async function getTopProducts(auth, range, requestedCompanyId) {
  const scope = scopedCompanyCondition(auth, 'p', requestedCompanyId);
  const where = combineWhere(scope);
  const params = [
    range.start,
    range.endExclusive,
    range.start,
    range.endExclusive,
    ...where.params
  ];
  const [rows] = await query(
    `SELECT
       p.id,
       p.nombre,
       p.empresa_id,
       e.nombre AS empresa_nombre,
       COALESCE(consultas.total, 0) AS consultas
     FROM productos p
     INNER JOIN empresas e ON e.id = p.empresa_id
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
     ${where.clause}
     ORDER BY consultas DESC, p.nombre ASC
     LIMIT 10`,
    params
  );

  return rows.map((row) => ({
    id: Number(row.id),
    tenant_id: Number(row.empresa_id),
    empresa_nombre: row.empresa_nombre,
    nombre: row.nombre,
    consultas: Number(row.consultas ?? 0)
  }));
}

async function getCompanyBreakdown(auth, range) {
  if (!isSuperAdmin(auth)) {
    return [];
  }

  const [rows] = await query(
    `SELECT
       e.id AS tenant_id,
       e.nombre AS empresa_nombre,
       COUNT(c.id) AS total_conversaciones,
       SUM(CASE WHEN c.tipo_mensaje = 'bot' OR (c.respuesta IS NOT NULL AND c.respuesta <> '' AND (c.tipo_mensaje IS NULL OR c.tipo_mensaje <> 'human')) THEN 1 ELSE 0 END) AS conversaciones_atendidas_bot,
       SUM(CASE WHEN c.estado IN ('requires_human','human_active') THEN 1 ELSE 0 END) AS conversaciones_pidieron_humano,
       COUNT(DISTINCT c.telefono_cliente) AS clientes_unicos
     FROM empresas e
     LEFT JOIN conversaciones c
       ON c.empresa_id = e.id
      AND c.fecha >= ?
      AND c.fecha < ?
     GROUP BY e.id, e.nombre
     ORDER BY total_conversaciones DESC, e.nombre ASC`,
    [range.start, range.endExclusive]
  );

  return rows.map((row) => ({
    tenant_id: Number(row.tenant_id),
    empresa_nombre: row.empresa_nombre,
    total_conversaciones: Number(row.total_conversaciones ?? 0),
    conversaciones_atendidas_bot: Number(row.conversaciones_atendidas_bot ?? 0),
    conversaciones_pidieron_humano: Number(row.conversaciones_pidieron_humano ?? 0),
    clientes_unicos: Number(row.clientes_unicos ?? 0)
  }));
}

export async function getReportsOverview(auth, filters = {}) {
  const range = normalizeDateFilters(filters);
  const requestedCompanyId = filters.empresa_id ?? filters.tenant_id;
  const usageMonth = String(filters.month ?? filters.mes ?? range.fecha_fin.slice(0, 7));
  const [
    conversationMetrics,
    clientesNuevos,
    productosMasConsultados,
    mensajesPorDia,
    aiUsage,
    desgloseEmpresas
  ] = await Promise.all([
    getConversationMetrics(auth, range, requestedCompanyId),
    getNewCustomers(auth, range, requestedCompanyId),
    getTopProducts(auth, range, requestedCompanyId),
    getMessagesByDay(auth, range, requestedCompanyId),
    getMonthlyAIUsage(auth, { month: usageMonth, empresa_id: requestedCompanyId }),
    getCompanyBreakdown(auth, range)
  ]);
  const orderMetrics = await getOrderMetrics(auth, range, requestedCompanyId);
  const conversionRate = conversationMetrics.total_conversaciones > 0
    ? Number(((orderMetrics.pedidos_generados / conversationMetrics.total_conversaciones) * 100).toFixed(2))
    : 0;

  return {
    date_range: {
      fecha_inicio: range.fecha_inicio,
      fecha_fin: range.fecha_fin
    },
    scope: isSuperAdmin(auth) && !requestedCompanyId ? 'global' : 'tenant',
    metrics: {
      ...conversationMetrics,
      pedidos_generados: orderMetrics.pedidos_generados,
      ventas_estimadas: orderMetrics.ventas_estimadas,
      clientes_nuevos: clientesNuevos,
      tasa_conversion_conversacion_pedido: conversionRate,
      orders_source: orderMetrics.source
    },
    productos_mas_consultados: productosMasConsultados,
    consumo_ia: aiUsage,
    mensajes_por_dia: mensajesPorDia,
    desglose_empresas: desgloseEmpresas
  };
}
