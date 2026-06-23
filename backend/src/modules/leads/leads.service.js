import { query } from '../../config/database.js';
import { appendCompanyScope, companyScopeCondition, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { createHttpError } from '../../utils/http-error.js';

const LEAD_COLUMNS = `
  l.id,
  l.empresa_id,
  l.nombre_cliente,
  l.telefono,
  l.whatsapp_id,
  l.contact_name,
  l.interes,
  l.estado,
  l.notas,
  COALESCE(l.score, 0) AS score,
  COALESCE(l.prioridad, 'BAJA') AS prioridad,
  l.score_detalle_json,
  l.score_actualizado_at,
  l.fecha_creacion,
  l.fecha_actualizacion,
  e.nombre AS empresa_nombre
`;

const VALID_STATES = ['NUEVO', 'EN_PROCESO', 'CONTACTADO', 'COTIZADO', 'GANADO', 'PERDIDO'];
const HIGH_INTENT_WORDS = ['comprar', 'quiero', 'me interesa', 'cotizar', 'precio', 'costo', 'apart', 'asesor', 'urgente'];
const MEDIUM_INTENT_WORDS = ['informacion', 'info', 'disponible', 'catalogo', 'servicio', 'producto'];

function scorePriority(score) {
  if (score >= 85) return 'CRITICA';
  if (score >= 65) return 'ALTA';
  if (score >= 35) return 'MEDIA';
  return 'BAJA';
}

function normalizeScoreText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function calculateLeadScore(lead) {
  const text = normalizeScoreText(`${lead.interes ?? ''} ${lead.notas ?? ''}`);
  const estado = String(lead.estado ?? 'NUEVO').toUpperCase();
  const details = [];
  let score = 15;

  if (lead.telefono) {
    score += 10;
    details.push({ factor: 'telefono', puntos: 10 });
  }

  if (lead.email) {
    score += 8;
    details.push({ factor: 'email', puntos: 8 });
  }

  for (const word of HIGH_INTENT_WORDS) {
    if (text.includes(word)) {
      score += 12;
      details.push({ factor: `intencion:${word}`, puntos: 12 });
    }
  }

  for (const word of MEDIUM_INTENT_WORDS) {
    if (text.includes(word)) {
      score += 6;
      details.push({ factor: `interes:${word}`, puntos: 6 });
    }
  }

  if (estado === 'COTIZADO') score += 20;
  if (estado === 'CONTACTADO' || estado === 'EN_PROCESO') score += 12;
  if (estado === 'GANADO') score = 100;
  if (estado === 'PERDIDO') score = Math.min(score, 20);

  const createdAt = lead.fecha_creacion ? new Date(lead.fecha_creacion) : null;

  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

    if (ageHours <= 24) {
      score += 10;
      details.push({ factor: 'reciente_24h', puntos: 10 });
    } else if (ageHours > 168 && !['GANADO', 'PERDIDO'].includes(estado)) {
      score -= 10;
      details.push({ factor: 'sin_cierre_7d', puntos: -10 });
    }
  }

  const normalizedScore = Math.max(0, Math.min(score, 100));

  return {
    score: normalizedScore,
    prioridad: scorePriority(normalizedScore),
    detalles: details
  };
}

function mapLeadRow(row) {
  if (!row) {
    return null;
  }

  let scoreDetalle = null;

  try {
    scoreDetalle = typeof row.score_detalle_json === 'object'
      ? row.score_detalle_json
      : JSON.parse(row.score_detalle_json ?? 'null');
  } catch {
    scoreDetalle = null;
  }

  return {
    ...row,
    score: Number(row.score ?? 0),
    score_detalle_json: scoreDetalle
  };
}

async function updateLeadScore(leadId, scoreData) {
  await query(
    `UPDATE leads
     SET score = ?, prioridad = ?, score_detalle_json = ?, score_actualizado_at = NOW()
     WHERE id = ?`,
    [scoreData.score, scoreData.prioridad, JSON.stringify(scoreData.detalles), leadId]
  );
}

function normalizeLeadPayload(payload, auth) {
  const nombreCliente = String(payload.nombre_cliente ?? '').trim();
  const telefono = String(payload.telefono ?? '').trim();
  const interes = String(payload.interes ?? '').trim();
  const estado = String(payload.estado ?? 'NUEVO').trim().toUpperCase();
  const notas = String(payload.notas ?? '').trim() || null;

  if (!nombreCliente) {
    throw createHttpError(400, 'El nombre del cliente es requerido');
  }

  if (!telefono) {
    throw createHttpError(400, 'El telefono es requerido');
  }

  if (!interes) {
    throw createHttpError(400, 'El interes es requerido');
  }

  if (!VALID_STATES.includes(estado)) {
    throw createHttpError(400, 'El estado no es valido');
  }

  return {
    empresaId: resolveScopedEmpresaId(auth, payload.empresa_id),
    nombreCliente,
    telefono,
    interes,
    estado,
    notas
  };
}

function mapDatabaseError(error) {
  if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    throw createHttpError(400, 'La empresa seleccionada no existe');
  }

  if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
    throw createHttpError(409, 'No se puede eliminar este lead porque tiene datos relacionados');
  }

  throw error;
}

export async function findLeads(auth) {
  const scope = companyScopeCondition(auth, 'l');
  const whereClause = scope.clause ? `WHERE ${scope.clause}` : '';

  const [rows] = await query(
    `SELECT ${LEAD_COLUMNS}
     FROM leads l
     INNER JOIN empresas e ON e.id = l.empresa_id
     ${whereClause}
     ORDER BY l.fecha_creacion DESC`,
    scope.params
  );

  await Promise.all(rows.map((row) => updateLeadScore(row.id, calculateLeadScore(row)).catch(() => null)));

  return rows.map((row) => {
    const scoreData = calculateLeadScore(row);
    return mapLeadRow({
      ...row,
      score: scoreData.score,
      prioridad: scoreData.prioridad,
      score_detalle_json: scoreData.detalles
    });
  });
}

export async function findLeadById(leadId, auth) {
  const scope = appendCompanyScope(auth, [leadId], 'l');

  const [rows] = await query(
    `SELECT ${LEAD_COLUMNS}
     FROM leads l
     INNER JOIN empresas e ON e.id = l.empresa_id
     WHERE l.id = ?
     ${scope.clause}
     LIMIT 1`,
    scope.params
  );

  const lead = rows[0] ?? null;

  if (!lead) {
    return null;
  }

  const scoreData = calculateLeadScore(lead);
  await updateLeadScore(lead.id, scoreData).catch(() => null);

  return mapLeadRow({
    ...lead,
    score: scoreData.score,
    prioridad: scoreData.prioridad,
    score_detalle_json: scoreData.detalles
  });
}

export async function getLeadStats(auth) {
  const scope = companyScopeCondition(auth);
  const whereClause = scope.clause ? `WHERE ${scope.clause}` : '';

  const [rows] = await query(
    `SELECT estado, COUNT(*) AS total
     FROM leads
     ${whereClause}
     GROUP BY estado`,
    scope.params
  );

  const stats = {
    total: 0,
    nuevo: 0,
    en_proceso: 0,
    contactado: 0,
    cotizado: 0,
    ganado: 0,
    perdido: 0
  };

  rows.forEach((row) => {
    const total = Number(row.total);
    const key = String(row.estado).toLowerCase();

    stats.total += total;
    stats[key] = total;

    if (key === 'en_proceso') {
      stats.contactado += total;
    }
  });

  return stats;
}

export async function createLead(payload, auth) {
  const lead = normalizeLeadPayload(payload, auth);

  try {
    const [result] = await query(
      `INSERT INTO leads (empresa_id, nombre_cliente, telefono, interes, estado, notas)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [lead.empresaId, lead.nombreCliente, lead.telefono, lead.interes, lead.estado, lead.notas]
    );

    const createdLead = await findLeadById(result.insertId, auth);
    const scoreData = calculateLeadScore(createdLead);
    await updateLeadScore(result.insertId, scoreData).catch(() => null);
    return findLeadById(result.insertId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function updateLead(leadId, payload, auth) {
  const currentLead = await findLeadById(leadId, auth);

  if (!currentLead) {
    throw createHttpError(404, 'Lead no encontrado');
  }

  const lead = normalizeLeadPayload(payload, auth);
  const scope = appendCompanyScope(auth, [leadId], 'leads');

  try {
    await query(
      `UPDATE leads
       SET empresa_id = ?,
           nombre_cliente = ?,
           telefono = ?,
           interes = ?,
           estado = ?,
           notas = ?
       WHERE id = ?
       ${scope.clause}`,
      [lead.empresaId, lead.nombreCliente, lead.telefono, lead.interes, lead.estado, lead.notas, ...scope.params]
    );

    const updatedLead = await findLeadById(leadId, auth);
    const scoreData = calculateLeadScore(updatedLead);
    await updateLeadScore(leadId, scoreData).catch(() => null);
    return findLeadById(leadId, auth);
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deleteLead(leadId, auth) {
  const scope = appendCompanyScope(auth, [leadId], 'leads');

  try {
    const [result] = await query(`DELETE FROM leads WHERE id = ? ${scope.clause}`, scope.params);

    if (result.affectedRows === 0) {
      throw createHttpError(404, 'Lead no encontrado');
    }

    return true;
  } catch (error) {
    mapDatabaseError(error);
  }
}
