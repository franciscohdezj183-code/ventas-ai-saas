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

function toDateKey(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
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

function todayRange() {
  const today = new Date().toISOString().slice(0, 10);

  return {
    fecha: today,
    start: `${today} 00:00:00`,
    endExclusive: `${addDays(today, 1)} 00:00:00`
  };
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

function scopedWhatsappStatuses(auth) {
  return listWhatsappStatuses().filter(
    (status) => isSuperAdmin(auth) || Number(status.empresa_id) === getAuthenticatedEmpresaId(auth)
  );
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

  const whatsappConnected = scopedWhatsappStatuses(auth).filter((status) => status.status === 'CONNECTED').length;
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

export async function getOperationalMetrics(auth) {
  const range = todayRange();
  const leadTodayWhere = combineWhere(companyCondition(auth, 'l'), dateCondition('l', 'fecha_creacion', range));
  const conversationTodayWhere = combineWhere(companyCondition(auth, 'c'), dateCondition('c', 'fecha', range));
  const productWhere = combineWhere(companyCondition(auth, 'p'), { clause: "AND p.estado = 'ACTIVO'", params: [] });
  const serviceWhere = combineWhere(companyCondition(auth, 's'), { clause: "AND s.estado = 'ACTIVO'", params: [] });
  const activeCompanyWhere = isSuperAdmin(auth)
    ? { clause: "WHERE e.activo = 1 AND e.estado = 'ACTIVA'", params: [] }
    : { clause: "WHERE e.id = ? AND e.activo = 1 AND e.estado = 'ACTIVA'", params: [getAuthenticatedEmpresaId(auth)] };

  const [leadsToday, conversationsToday, activeProducts, activeServices, activeCompanies] = await Promise.all([
    scalarCount(`SELECT COUNT(*) AS total FROM leads l ${leadTodayWhere.clause}`, leadTodayWhere.params),
    scalarCount(`SELECT COUNT(*) AS total FROM conversaciones c ${conversationTodayWhere.clause}`, conversationTodayWhere.params),
    scalarCount(`SELECT COUNT(*) AS total FROM productos p ${productWhere.clause}`, productWhere.params),
    scalarCount(`SELECT COUNT(*) AS total FROM servicios s ${serviceWhere.clause}`, serviceWhere.params),
    scalarCount(`SELECT COUNT(*) AS total FROM empresas e ${activeCompanyWhere.clause}`, activeCompanyWhere.params)
  ]);

  const whatsappStatuses = scopedWhatsappStatuses(auth);
  const whatsappConnected = whatsappStatuses.filter((status) => status.status === 'CONNECTED').length;

  return {
    fecha: range.fecha,
    leads_hoy: leadsToday,
    conversaciones_hoy: conversationsToday,
    productos_activos: activeProducts,
    servicios_activos: activeServices,
    whatsapp: {
      conectadas: whatsappConnected,
      desconectadas: Math.max(activeCompanies - whatsappConnected, 0),
      total: activeCompanies,
      estado: whatsappConnected > 0 ? 'CONNECTED' : 'DISCONNECTED'
    }
  };
}

export async function getLeadStates(auth, filters = {}) {
  const dateRange = normalizeDateFilters(filters);
  const where = combineWhere(companyCondition(auth, 'l'), dateCondition('l', 'fecha_creacion', dateRange));
  const [rows] = await query(
    `SELECT l.estado, COUNT(*) AS total
     FROM leads l
     ${where.clause}
     GROUP BY l.estado`,
    where.params
  );

  const totalsByState = new Map(rows.map((row) => [row.estado, Number(row.total)]));

  return ['NUEVO', 'EN_PROCESO', 'CONTACTADO', 'COTIZADO', 'GANADO', 'PERDIDO'].map((estado) => ({
    estado,
    total: totalsByState.get(estado) ?? 0
  }));
}

export async function getLeadScoreSummary(auth, filters = {}) {
  const dateRange = normalizeDateFilters(filters);
  const where = combineWhere(companyCondition(auth, 'l'), dateCondition('l', 'fecha_creacion', dateRange));
  const [rows] = await query(
    `SELECT
       l.prioridad,
       COUNT(*) AS total,
       AVG(l.score) AS score_promedio
     FROM leads l
     ${where.clause}
     GROUP BY l.prioridad`,
    where.params
  );
  const byPriority = new Map(rows.map((row) => [row.prioridad, row]));

  return ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'].map((prioridad) => {
    const row = byPriority.get(prioridad);

    return {
      prioridad,
      total: Number(row?.total ?? 0),
      score_promedio: Number(Number(row?.score_promedio ?? 0).toFixed(2))
    };
  });
}

export async function getTopLeadOpportunities(auth) {
  const where = combineWhere(
    companyCondition(auth, 'l'),
    { clause: "AND l.estado NOT IN ('GANADO', 'PERDIDO')", params: [] }
  );
  const [rows] = await query(
    `SELECT
       l.id,
       l.nombre_cliente,
       l.telefono,
       l.interes,
       l.estado,
       COALESCE(l.score, 0) AS score,
       COALESCE(l.prioridad, 'BAJA') AS prioridad,
       l.fecha_creacion,
       e.nombre AS empresa_nombre
     FROM leads l
     INNER JOIN empresas e ON e.id = l.empresa_id
     ${where.clause}
     ORDER BY l.score DESC, l.fecha_creacion DESC
     LIMIT 8`,
    where.params
  );

  return rows.map((row) => ({
    ...row,
    score: Number(row.score)
  }));
}

export async function getDailyActivity(auth, filters = {}) {
  const dateRange = normalizeDateFilters(filters);
  const leadWhere = combineWhere(companyCondition(auth, 'l'), dateCondition('l', 'fecha_creacion', dateRange));
  const conversationWhere = combineWhere(companyCondition(auth, 'c'), dateCondition('c', 'fecha', dateRange));

  const [leadRows, conversationRows] = await Promise.all([
    query(
      `SELECT DATE(l.fecha_creacion) AS fecha, COUNT(*) AS total
       FROM leads l
       ${leadWhere.clause}
       GROUP BY DATE(l.fecha_creacion)
       ORDER BY fecha ASC`,
      leadWhere.params
    ),
    query(
      `SELECT DATE(c.fecha) AS fecha, COUNT(*) AS total
       FROM conversaciones c
       ${conversationWhere.clause}
       GROUP BY DATE(c.fecha)
       ORDER BY fecha ASC`,
      conversationWhere.params
    )
  ]);

  const leadsByDate = new Map(leadRows[0].map((row) => [toDateKey(row.fecha), Number(row.total)]));
  const conversationsByDate = new Map(
    conversationRows[0].map((row) => [toDateKey(row.fecha), Number(row.total)])
  );
  const days = [];
  let cursor = dateRange.fecha_inicio;

  while (cursor <= dateRange.fecha_fin) {
    days.push({
      fecha: cursor,
      leads: leadsByDate.get(cursor) ?? 0,
      conversaciones: conversationsByDate.get(cursor) ?? 0
    });
    cursor = addDays(cursor, 1);
  }

  return days.slice(-14);
}

export async function getRecentLeads(auth) {
  const where = companyWhere(auth, 'l');
  const [rows] = await query(
    `SELECT
       l.id,
       l.nombre_cliente,
       l.telefono,
       l.interes,
       l.estado,
       l.fecha_creacion,
       e.nombre AS empresa_nombre
     FROM leads l
     INNER JOIN empresas e ON e.id = l.empresa_id
     ${where.clause}
     ORDER BY l.fecha_creacion DESC
     LIMIT 6`,
    where.params
  );

  return rows;
}

export async function getRecentActivity(auth) {
  const where = companyWhere(auth, 'a');
  const [rows] = await query(
    `SELECT
       a.id,
       a.accion,
       a.modulo,
       a.descripcion,
       a.fecha,
       e.nombre AS empresa_nombre
     FROM audit_logs a
     LEFT JOIN empresas e ON e.id = a.empresa_id
     ${where.clause}
     ORDER BY a.fecha DESC
     LIMIT 8`,
    where.params
  );

  return rows;
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

export async function getIndustryOptimization(auth, filters = {}) {
  const dateRange = normalizeDateFilters(filters);
  const scope = isSuperAdmin(auth)
    ? { clause: '', params: [] }
    : { clause: 'AND e.id = ?', params: [getAuthenticatedEmpresaId(auth)] };
  const [rows] = await query(
    `SELECT
       COALESCE(e.tipo_negocio, 'General') AS tipo_negocio,
       COUNT(DISTINCT e.id) AS empresas,
       COUNT(DISTINCT l.id) AS leads,
       SUM(CASE WHEN l.estado = 'GANADO' THEN 1 ELSE 0 END) AS ganados,
       AVG(COALESCE(l.score, 0)) AS score_promedio
     FROM empresas e
     LEFT JOIN leads l
       ON l.empresa_id = e.id
      AND l.fecha_creacion >= ?
      AND l.fecha_creacion < ?
     WHERE e.activo = 1
       AND e.estado = 'ACTIVA'
       ${scope.clause}
     GROUP BY COALESCE(e.tipo_negocio, 'General')
     ORDER BY leads DESC, score_promedio DESC`,
    [dateRange.start, dateRange.endExclusive, ...scope.params]
  );

  return rows.map((row) => {
    const leads = Number(row.leads ?? 0);
    const ganados = Number(row.ganados ?? 0);

    return {
      tipo_negocio: row.tipo_negocio,
      empresas: Number(row.empresas ?? 0),
      leads,
      ganados,
      tasa_conversion: leads > 0 ? Number(((ganados / leads) * 100).toFixed(2)) : 0,
      score_promedio: Number(Number(row.score_promedio ?? 0).toFixed(2))
    };
  });
}

function buildRecommendations({ summary, metrics, leadScoreSummary, topProducts, topServices, opportunities }) {
  const recommendations = [];
  const criticalLeads = leadScoreSummary.find((item) => item.prioridad === 'CRITICA')?.total ?? 0;
  const highLeads = leadScoreSummary.find((item) => item.prioridad === 'ALTA')?.total ?? 0;

  if (criticalLeads > 0 || highLeads > 0) {
    recommendations.push({
      tipo: 'LEADS_PRIORITARIOS',
      prioridad: criticalLeads > 0 ? 'CRITICA' : 'ALTA',
      titulo: 'Atender leads con mayor probabilidad de compra',
      detalle: `${criticalLeads + highLeads} leads tienen prioridad alta o critica.`,
      accion: 'Contactar primero los leads con score mas alto.'
    });
  }

  if (summary.totals.total_leads > 0 && summary.totals.tasa_conversion < 15) {
    recommendations.push({
      tipo: 'CONVERSION',
      prioridad: 'MEDIA',
      titulo: 'Mejorar seguimiento del embudo',
      detalle: `La conversion del periodo es ${summary.totals.tasa_conversion}%.`,
      accion: 'Revisar mensajes de cierre y tiempos de respuesta.'
    });
  }

  if (metrics.whatsapp.desconectadas > 0) {
    recommendations.push({
      tipo: 'WHATSAPP',
      prioridad: 'ALTA',
      titulo: 'Recuperar sesiones WhatsApp desconectadas',
      detalle: `${metrics.whatsapp.desconectadas} sesiones estan desconectadas.`,
      accion: 'Revisar QR, worker y estado de sesiones.'
    });
  }

  const topProduct = topProducts.find((item) => Number(item.consultas) > 0);
  const topService = topServices.find((item) => Number(item.consultas) > 0);

  if (topProduct) {
    recommendations.push({
      tipo: 'CATALOGO',
      prioridad: 'MEDIA',
      titulo: `Impulsar producto consultado: ${topProduct.nombre}`,
      detalle: `${topProduct.consultas} consultas detectadas.`,
      accion: 'Crear oferta, destacar stock o preparar respuesta de cierre.'
    });
  }

  if (topService) {
    recommendations.push({
      tipo: 'SERVICIO',
      prioridad: 'MEDIA',
      titulo: `Optimizar servicio consultado: ${topService.nombre}`,
      detalle: `${topService.consultas} consultas detectadas.`,
      accion: 'Agregar precio desde, tiempos y requisitos para cotizar mas rapido.'
    });
  }

  if (opportunities.length === 0 && summary.totals.total_leads === 0) {
    recommendations.push({
      tipo: 'ADQUISICION',
      prioridad: 'BAJA',
      titulo: 'Generar primeras oportunidades comerciales',
      detalle: 'No hay leads en el periodo seleccionado.',
      accion: 'Probar mensajes de bienvenida, catalogo y campanas de WhatsApp.'
    });
  }

  return recommendations.slice(0, 6);
}

async function getConversationIntelligence(auth, filters = {}) {
  const dateRange = normalizeDateFilters(filters);
  const where = combineWhere(companyCondition(auth, 'c'), dateCondition('c', 'fecha', dateRange));
  const [rows] = await query(
    `SELECT
       COUNT(*) AS total_conversaciones,
       SUM(CASE WHEN c.respuesta IS NOT NULL AND c.respuesta <> '' THEN 1 ELSE 0 END) AS respondidas,
       SUM(CASE WHEN c.respuesta IS NULL OR c.respuesta = '' THEN 1 ELSE 0 END) AS sin_respuesta,
       COUNT(DISTINCT c.telefono_cliente) AS clientes_unicos
     FROM conversaciones c
     ${where.clause}`,
    where.params
  );
  const row = rows[0] ?? {};
  const total = Number(row.total_conversaciones ?? 0);
  const responded = Number(row.respondidas ?? 0);

  return {
    total_conversaciones: total,
    conversaciones_respondidas: responded,
    conversaciones_sin_respuesta: Number(row.sin_respuesta ?? 0),
    clientes_unicos: Number(row.clientes_unicos ?? 0),
    tasa_respuesta: total > 0 ? Number(((responded / total) * 100).toFixed(2)) : 0
  };
}

async function getCatalogIntelligence(auth) {
  const productWhere = combineWhere(companyCondition(auth, 'p'));
  const serviceWhere = combineWhere(companyCondition(auth, 's'));
  const [productRows, serviceRows] = await Promise.all([
    query(
      `SELECT
         COUNT(*) AS total_productos,
         SUM(CASE WHEN p.estado = 'ACTIVO' THEN 1 ELSE 0 END) AS productos_activos,
         SUM(CASE WHEN p.stock <= 0 THEN 1 ELSE 0 END) AS sin_stock,
         SUM(CASE WHEN p.stock > 0 AND p.stock <= 5 THEN 1 ELSE 0 END) AS bajo_stock,
         SUM(CASE WHEN p.descripcion IS NOT NULL AND p.descripcion <> '' THEN 1 ELSE 0 END) AS con_descripcion,
         SUM(CASE WHEN p.imagen IS NOT NULL AND p.imagen <> '' THEN 1 ELSE 0 END) AS con_imagen
       FROM productos p
       ${productWhere.clause}`,
      productWhere.params
    ),
    query(
      `SELECT
         COUNT(*) AS total_servicios,
         SUM(CASE WHEN s.estado = 'ACTIVO' THEN 1 ELSE 0 END) AS servicios_activos,
         SUM(CASE WHEN s.descripcion IS NULL OR s.descripcion = '' THEN 1 ELSE 0 END) AS servicios_sin_descripcion
       FROM servicios s
       ${serviceWhere.clause}`,
      serviceWhere.params
    )
  ]);
  const products = productRows[0] ?? {};
  const services = serviceRows[0] ?? {};
  const totalProducts = Number(products.total_productos ?? 0);
  const activeProducts = Number(products.productos_activos ?? 0);
  const withDescription = Number(products.con_descripcion ?? 0);
  const withImage = Number(products.con_imagen ?? 0);
  const outOfStock = Number(products.sin_stock ?? 0);
  const catalogHealth = totalProducts
    ? Math.round(
      (activeProducts / totalProducts) * 30
      + (withDescription / totalProducts) * 25
      + (withImage / totalProducts) * 20
      + ((totalProducts - outOfStock) / totalProducts) * 25
    )
    : 0;

  return {
    total_productos: totalProducts,
    productos_activos: activeProducts,
    productos_sin_stock: outOfStock,
    productos_bajo_stock: Number(products.bajo_stock ?? 0),
    cobertura_descripcion: totalProducts ? Number(((withDescription / totalProducts) * 100).toFixed(2)) : 0,
    cobertura_imagen: totalProducts ? Number(((withImage / totalProducts) * 100).toFixed(2)) : 0,
    salud_catalogo: catalogHealth,
    total_servicios: Number(services.total_servicios ?? 0),
    servicios_activos: Number(services.servicios_activos ?? 0),
    servicios_sin_descripcion: Number(services.servicios_sin_descripcion ?? 0)
  };
}

async function getAgingLeadIntelligence(auth) {
  const where = combineWhere(
    companyCondition(auth, 'l'),
    { clause: "AND l.estado NOT IN ('GANADO', 'PERDIDO')", params: [] }
  );
  const [rows] = await query(
    `SELECT
       COUNT(*) AS abiertos,
       SUM(CASE WHEN l.fecha_creacion < DATE_SUB(NOW(), INTERVAL 2 DAY) THEN 1 ELSE 0 END) AS abiertos_2d,
       SUM(CASE WHEN l.fecha_creacion < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS abiertos_7d,
       AVG(COALESCE(l.score, 0)) AS score_promedio_abiertos
     FROM leads l
     ${where.clause}`,
    where.params
  );
  const row = rows[0] ?? {};

  return {
    leads_abiertos: Number(row.abiertos ?? 0),
    leads_abiertos_2d: Number(row.abiertos_2d ?? 0),
    leads_abiertos_7d: Number(row.abiertos_7d ?? 0),
    score_promedio_abiertos: Number(Number(row.score_promedio_abiertos ?? 0).toFixed(2))
  };
}

function scoreBusinessHealth({ summary, metrics, conversationIntelligence, catalogIntelligence, agingLeadIntelligence, leadScoreSummary }) {
  const conversionScore = Math.min(Number(summary.totals.tasa_conversion ?? 0) * 4, 100);
  const responseScore = Number(conversationIntelligence.tasa_respuesta ?? 0);
  const catalogScore = Number(catalogIntelligence.salud_catalogo ?? 0);
  const whatsappScore = metrics.whatsapp.total > 0
    ? (Number(metrics.whatsapp.conectadas ?? 0) / Number(metrics.whatsapp.total)) * 100
    : 0;
  const stalePenalty = agingLeadIntelligence.leads_abiertos
    ? Math.min((agingLeadIntelligence.leads_abiertos_7d / agingLeadIntelligence.leads_abiertos) * 100, 35)
    : 0;
  const hotLeads = leadScoreSummary
    .filter((item) => ['CRITICA', 'ALTA'].includes(item.prioridad))
    .reduce((total, item) => total + Number(item.total ?? 0), 0);
  const opportunityBonus = Math.min(hotLeads * 3, 12);

  return Math.max(0, Math.min(100, Math.round(
    conversionScore * 0.22
    + responseScore * 0.24
    + catalogScore * 0.22
    + whatsappScore * 0.22
    + opportunityBonus
    - stalePenalty
  )));
}

function buildExecutiveRisks({ metrics, conversationIntelligence, catalogIntelligence, agingLeadIntelligence }) {
  const risks = [];

  if (metrics.whatsapp.desconectadas > 0) {
    risks.push({
      nivel: 'ALTO',
      area: 'WhatsApp',
      titulo: 'Canales desconectados',
      detalle: `${metrics.whatsapp.desconectadas} sesiones no estan conectadas.`,
      accion: 'Revisar QR, worker y recuperacion automatica.'
    });
  }

  if (conversationIntelligence.conversaciones_sin_respuesta > 0) {
    risks.push({
      nivel: conversationIntelligence.tasa_respuesta < 75 ? 'ALTO' : 'MEDIO',
      area: 'Atencion',
      titulo: 'Conversaciones sin respuesta',
      detalle: `${conversationIntelligence.conversaciones_sin_respuesta} conversaciones no tienen respuesta registrada.`,
      accion: 'Entrar al inbox y cerrar conversaciones abiertas.'
    });
  }

  if (catalogIntelligence.productos_sin_stock > 0) {
    risks.push({
      nivel: 'MEDIO',
      area: 'Catalogo',
      titulo: 'Productos agotados',
      detalle: `${catalogIntelligence.productos_sin_stock} productos aparecen sin stock.`,
      accion: 'Actualizar inventario o desactivar productos agotados.'
    });
  }

  if (agingLeadIntelligence.leads_abiertos_7d > 0) {
    risks.push({
      nivel: 'MEDIO',
      area: 'CRM',
      titulo: 'Leads abiertos envejecidos',
      detalle: `${agingLeadIntelligence.leads_abiertos_7d} leads llevan mas de 7 dias abiertos.`,
      accion: 'Definir cierre, seguimiento o perdida para limpiar pipeline.'
    });
  }

  if (!risks.length) {
    risks.push({
      nivel: 'BAJO',
      area: 'Operacion',
      titulo: 'Sin riesgos criticos detectados',
      detalle: 'Los indicadores principales estan estables para el periodo.',
      accion: 'Mantener seguimiento diario de conversion, stock y WhatsApp.'
    });
  }

  return risks.slice(0, 5);
}

function buildExecutiveFocus({ summary, conversationIntelligence, catalogIntelligence, agingLeadIntelligence, topProducts, topServices }) {
  return [
    {
      titulo: 'Conversion comercial',
      valor: `${summary.totals.tasa_conversion}%`,
      detalle: `${summary.totals.leads_ganados} ganados de ${summary.totals.total_leads} leads`,
      estado: summary.totals.tasa_conversion >= 20 ? 'BUENO' : 'REVISAR'
    },
    {
      titulo: 'Respuesta a clientes',
      valor: `${conversationIntelligence.tasa_respuesta}%`,
      detalle: `${conversationIntelligence.clientes_unicos} clientes unicos en conversaciones`,
      estado: conversationIntelligence.tasa_respuesta >= 85 ? 'BUENO' : 'REVISAR'
    },
    {
      titulo: 'Catalogo vendible',
      valor: `${catalogIntelligence.salud_catalogo}%`,
      detalle: `${catalogIntelligence.productos_activos} productos activos`,
      estado: catalogIntelligence.salud_catalogo >= 75 ? 'BUENO' : 'REVISAR'
    },
    {
      titulo: 'Pipeline abierto',
      valor: agingLeadIntelligence.leads_abiertos,
      detalle: `${agingLeadIntelligence.leads_abiertos_2d} abiertos por mas de 2 dias`,
      estado: agingLeadIntelligence.leads_abiertos_7d === 0 ? 'BUENO' : 'REVISAR'
    },
    {
      titulo: 'Demanda detectada',
      valor: Number(topProducts[0]?.consultas ?? 0) + Number(topServices[0]?.consultas ?? 0),
      detalle: topProducts[0]?.nombre || topServices[0]?.nombre || 'Sin consultas destacadas',
      estado: topProducts[0] || topServices[0] ? 'BUENO' : 'OBSERVAR'
    }
  ];
}

async function getExecutiveIntelligence({
  auth,
  filters,
  summary,
  metrics,
  leadScoreSummary,
  topProducts,
  topServices
}) {
  const [conversationIntelligence, catalogIntelligence, agingLeadIntelligence] = await Promise.all([
    getConversationIntelligence(auth, filters),
    getCatalogIntelligence(auth),
    getAgingLeadIntelligence(auth)
  ]);
  const healthScore = scoreBusinessHealth({
    summary,
    metrics,
    conversationIntelligence,
    catalogIntelligence,
    agingLeadIntelligence,
    leadScoreSummary
  });

  return {
    salud_negocio: healthScore,
    estado: healthScore >= 80 ? 'SALUDABLE' : healthScore >= 55 ? 'ATENCION' : 'RIESGO',
    conversaciones: conversationIntelligence,
    catalogo: catalogIntelligence,
    pipeline: agingLeadIntelligence,
    riesgos: buildExecutiveRisks({
      metrics,
      conversationIntelligence,
      catalogIntelligence,
      agingLeadIntelligence
    }),
    focos: buildExecutiveFocus({
      summary,
      conversationIntelligence,
      catalogIntelligence,
      agingLeadIntelligence,
      topProducts,
      topServices
    })
  };
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
  const [
    summary,
    metrics,
    leadStates,
    dailyActivity,
    topProducts,
    topServices,
    leadScoreSummary,
    topLeadOpportunities,
    industryOptimization,
    recentLeads,
    recentActivity,
    recentErrors
  ] = await Promise.all([
    getDashboardSummary(auth, filters),
    getOperationalMetrics(auth),
    getLeadStates(auth, filters),
    getDailyActivity(auth, filters),
    getTopProducts(auth, filters),
    getTopServices(auth, filters),
    getLeadScoreSummary(auth, filters),
    getTopLeadOpportunities(auth),
    getIndustryOptimization(auth, filters),
    getRecentLeads(auth),
    getRecentActivity(auth),
    getRecentErrors(auth, filters)
  ]);
  const executiveIntelligence = await getExecutiveIntelligence({
    auth,
    filters,
    summary,
    metrics,
    leadScoreSummary,
    topProducts,
    topServices
  });

  return {
    ...summary,
    metrics,
    inteligencia: executiveIntelligence,
    lead_states: leadStates,
    daily_activity: dailyActivity,
    productos_mas_consultados: topProducts,
    servicios_mas_consultados: topServices,
    scoring_leads: leadScoreSummary,
    oportunidades_prioritarias: topLeadOpportunities,
    optimizacion_industria: industryOptimization,
    recomendaciones: buildRecommendations({
      summary,
      metrics,
      leadScoreSummary,
      topProducts,
      topServices,
      opportunities: topLeadOpportunities
    }),
    leads_recientes: recentLeads,
    actividad_reciente: recentActivity,
    errores_recientes: recentErrors
  };
}
