import bcrypt from 'bcrypt';
import { closeDatabase, getConnection } from '../config/database.js';

function requiredEnv(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    throw new Error(`${name} is required`);
  }

  return String(value).trim();
}

function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : String(value).trim();
}

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function assertStrongPassword(password) {
  if (
    password.length < 12 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^a-zA-Z0-9]/.test(password)
  ) {
    throw new Error('INITIAL_SUPER_ADMIN_PASSWORD must be at least 12 characters and include upper, lower, number and symbol');
  }
}

async function findActiveSuperAdmin(connection) {
  const [rows] = await connection.query(
    `SELECT id, email
     FROM usuarios
     WHERE rol IN ('SUPER_ADMIN', 'super_admin')
       AND estado = 'ACTIVO'
     LIMIT 1`
  );

  return rows[0] ?? null;
}

async function findUserByEmail(connection, email) {
  const [rows] = await connection.query(
    `SELECT id, email, rol
     FROM usuarios
     WHERE email = ?
     LIMIT 1`,
    [email]
  );

  return rows[0] ?? null;
}

async function findOrCreateCompany(connection, { name, slug }) {
  const [existingRows] = await connection.query(
    `SELECT id
     FROM empresas
     WHERE slug = ?
     LIMIT 1`,
    [slug]
  );

  if (existingRows[0]) {
    return existingRows[0].id;
  }

  const [result] = await connection.query(
    `INSERT INTO empresas (nombre, slug, tipo_negocio, plan, activo, estado)
     VALUES (?, ?, 'SaaS Admin', 'ENTERPRISE', 1, 'ACTIVA')`,
    [name, slug]
  );

  return result.insertId;
}

async function main() {
  const email = requiredEnv('INITIAL_SUPER_ADMIN_EMAIL').toLowerCase();
  const password = requiredEnv('INITIAL_SUPER_ADMIN_PASSWORD');
  const name = optionalEnv('INITIAL_SUPER_ADMIN_NAME', 'Super Admin');
  const companyName = optionalEnv('INITIAL_SUPER_ADMIN_COMPANY_NAME', 'Platform Admin');
  const companySlug = slugify(optionalEnv('INITIAL_SUPER_ADMIN_COMPANY_SLUG', companyName));
  const bcryptRounds = Number.parseInt(optionalEnv('INITIAL_SUPER_ADMIN_BCRYPT_ROUNDS', '12'), 10);

  if (!companySlug) {
    throw new Error('INITIAL_SUPER_ADMIN_COMPANY_SLUG is invalid');
  }

  if (!Number.isInteger(bcryptRounds) || bcryptRounds < 10 || bcryptRounds > 14) {
    throw new Error('INITIAL_SUPER_ADMIN_BCRYPT_ROUNDS must be an integer between 10 and 14');
  }

  assertStrongPassword(password);

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    const existingSuperAdmin = await findActiveSuperAdmin(connection);

    if (existingSuperAdmin) {
      await connection.rollback();
      console.info(`Active SUPER_ADMIN already exists: ${existingSuperAdmin.email}`);
      return;
    }

    const existingEmail = await findUserByEmail(connection, email);

    if (existingEmail) {
      throw new Error(`A user with INITIAL_SUPER_ADMIN_EMAIL already exists: ${email}`);
    }

    const companyId = await findOrCreateCompany(connection, {
      name: companyName,
      slug: companySlug
    });
    const passwordHash = await bcrypt.hash(password, bcryptRounds);

    await connection.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol, estado)
       VALUES (?, ?, ?, ?, 'SUPER_ADMIN', 'ACTIVO')`,
      [companyId, name, email, passwordHash]
    );

    await connection.commit();
    console.info(`Initial SUPER_ADMIN created: ${email}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await closeDatabase();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
