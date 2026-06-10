import { query } from '../../config/database.js';
import { getAuthenticatedEmpresaId, isSuperAdmin, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { createHttpError } from '../../utils/http-error.js';

const COMPANY_COLUMNS = `
  id,
  nombre,
  slug,
  telefono,
  direccion,
  tipo_negocio,
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
    plan: String(payload.plan ?? 'BASICO').trim().toUpperCase(),
    activo: payload.activo !== false
  };
}

function assertValidPlan(plan) {
  const allowedPlans = ['BASICO', 'PRO', 'ENTERPRISE'];

  if (!allowedPlans.includes(plan)) {
    throw createHttpError(400, 'El plan debe ser BASICO, PRO o ENTERPRISE');
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

export async function createCompany(payload) {
  const company = normalizeCompanyPayload(payload);
  assertValidPlan(company.plan);

  const slug = toSlug(company.nombre);
  const estado = company.activo ? 'ACTIVA' : 'INACTIVA';

  try {
    const [result] = await query(
      `INSERT INTO empresas
        (nombre, slug, telefono, direccion, tipo_negocio, plan, activo, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company.nombre,
        slug,
        company.telefono,
        company.direccion,
        company.tipo_negocio,
        company.plan,
        company.activo ? 1 : 0,
        estado
      ]
    );

    return findCompanyById(result.insertId, { user: { rol: 'SUPER_ADMIN' } });
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
