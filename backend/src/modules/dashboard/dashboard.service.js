import { query } from '../../config/database.js';

function isSuperAdmin(auth) {
  return auth?.user?.rol === 'SUPER_ADMIN';
}

function scopedWhere(auth, alias = '') {
  const prefix = alias ? `${alias}.` : '';

  if (isSuperAdmin(auth)) {
    return { clause: '', params: [] };
  }

  return {
    clause: `WHERE ${prefix}empresa_id = ?`,
    params: [auth.user.empresaId]
  };
}

async function scalarCount(sql, params = []) {
  const [rows] = await query(sql, params);
  return Number(rows[0]?.total ?? 0);
}

export async function getCommercialDashboard(auth) {
  const leadScope = scopedWhere(auth, 'l');
  const conversationScope = scopedWhere(auth, 'c');
  const productScope = scopedWhere(auth, 'p');

  const today = new Date().toISOString().slice(0, 10);

  const totalLeads = await scalarCount(
    `SELECT COUNT(*) AS total FROM leads l ${leadScope.clause}`,
    leadScope.params
  );

  const conversationsToday = await scalarCount(
    `SELECT COUNT(*) AS total
     FROM conversaciones c
     ${conversationScope.clause ? `${conversationScope.clause} AND` : 'WHERE'} DATE(c.fecha) = ?`,
    [...conversationScope.params, today]
  );

  const companiesRegistered = isSuperAdmin(auth)
    ? await scalarCount('SELECT COUNT(*) AS total FROM empresas')
    : 1;

  const [potentialRows] = await query(
    `SELECT COUNT(*) AS total
     FROM leads l
     ${leadScope.clause ? `${leadScope.clause} AND` : 'WHERE'} l.estado IN ('NUEVO', 'EN_PROCESO')`,
    leadScope.params
  );

  const potentialSales = Number(potentialRows[0]?.total ?? 0);

  const [leadStateRows] = await query(
    `SELECT l.estado, COUNT(*) AS total
     FROM leads l
     ${leadScope.clause}
     GROUP BY l.estado`,
    leadScope.params
  );

  const [topProductRows] = await query(
    `SELECT
       p.id,
       p.nombre,
       COALESCE(SUM(
         CASE WHEN l.interes LIKE CONCAT('%', p.nombre, '%') THEN 1 ELSE 0 END
       ), 0) +
       COALESCE(SUM(
         CASE WHEN c.mensaje LIKE CONCAT('%', p.nombre, '%') THEN 1 ELSE 0 END
       ), 0) AS consultas
     FROM productos p
     LEFT JOIN leads l ON l.empresa_id = p.empresa_id
     LEFT JOIN conversaciones c ON c.empresa_id = p.empresa_id
     ${productScope.clause}
     GROUP BY p.id, p.nombre
     ORDER BY consultas DESC, p.nombre ASC
     LIMIT 5`,
    productScope.params
  );

  return {
    totals: {
      total_leads: totalLeads,
      conversaciones_hoy: conversationsToday,
      ventas_potenciales: potentialSales,
      empresas_registradas: companiesRegistered
    },
    lead_states: leadStateRows.map((row) => ({
      estado: row.estado,
      total: Number(row.total)
    })),
    productos_mas_consultados: topProductRows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      consultas: Number(row.consultas)
    }))
  };
}
