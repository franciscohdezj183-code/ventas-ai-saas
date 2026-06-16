import bcrypt from 'bcrypt';
import { query } from '../config/database.js';

const TEST_PREFIX = `codex-test-${Date.now()}`;

async function deleteDemoRows() {
  await query("DELETE FROM empresas WHERE slug LIKE 'codex-test-%'");
}

async function createCompany({ nombre, slug }) {
  const [result] = await query(
    `INSERT INTO empresas (nombre, slug, telefono, direccion, tipo_negocio, plan, activo, estado)
     VALUES (?, ?, ?, ?, ?, 'BASICO', 1, 'ACTIVA')`,
    [nombre, slug, '+525500000000', 'Direccion demo', 'Demo']
  );

  return result.insertId;
}

async function createUser({ empresaId, nombre, email, password, rol }) {
  const passwordHash = await bcrypt.hash(password, 4);
  const [result] = await query(
    `INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol, estado)
     VALUES (?, ?, ?, ?, ?, 'ACTIVO')`,
    [empresaId, nombre, email, passwordHash, rol]
  );

  return result.insertId;
}

export async function setupDemoData() {
  await deleteDemoRows();

  const companyAId = await createCompany({
    nombre: 'Codex Test A',
    slug: `${TEST_PREFIX}-a`
  });
  const companyBId = await createCompany({
    nombre: 'Codex Test B',
    slug: `${TEST_PREFIX}-b`
  });
  const ownerA = {
    email: `${TEST_PREFIX}-owner-a@example.com`,
    password: 'Password123!'
  };
  const ownerB = {
    email: `${TEST_PREFIX}-owner-b@example.com`,
    password: 'Password123!'
  };
  const superAdmin = {
    email: `${TEST_PREFIX}-super@example.com`,
    password: 'Password123!'
  };
  const sellerA = {
    email: `${TEST_PREFIX}-seller-a@example.com`,
    password: 'Password123!'
  };
  const viewerA = {
    email: `${TEST_PREFIX}-viewer-a@example.com`,
    password: 'Password123!'
  };

  await createUser({
    empresaId: companyAId,
    nombre: 'Owner A',
    email: ownerA.email,
    password: ownerA.password,
    rol: 'OWNER'
  });
  await createUser({
    empresaId: companyBId,
    nombre: 'Owner B',
    email: ownerB.email,
    password: ownerB.password,
    rol: 'OWNER'
  });
  await createUser({
    empresaId: companyAId,
    nombre: 'Super Admin',
    email: superAdmin.email,
    password: superAdmin.password,
    rol: 'SUPER_ADMIN'
  });
  await createUser({
    empresaId: companyAId,
    nombre: 'Seller A',
    email: sellerA.email,
    password: sellerA.password,
    rol: 'seller'
  });
  await createUser({
    empresaId: companyAId,
    nombre: 'Viewer A',
    email: viewerA.email,
    password: viewerA.password,
    rol: 'viewer'
  });

  return {
    companyAId,
    companyBId,
    ownerA,
    ownerB,
    superAdmin,
    sellerA,
    viewerA
  };
}

export async function cleanupDemoData() {
  await deleteDemoRows();
}
