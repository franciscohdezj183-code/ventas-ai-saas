import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { app } from '../app.js';
import { closeDatabase } from '../config/database.js';
import { cleanupDemoData, setupDemoData } from './demo-data.js';

const runDbTests = process.env.RUN_DB_TESTS === 'true';

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function requestJson(baseUrl, path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  return {
    response,
    payload
  };
}

describe('API integration with demo data', { skip: !runDbTests }, () => {
  let server;
  let baseUrl;
  let demo;
  let ownerAToken;
  let ownerBToken;
  let superToken;

  before(async () => {
    server = await listen();
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
    demo = await setupDemoData();

    const ownerALogin = await requestJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: { email: demo.ownerA.email, password: demo.ownerA.password }
    });
    const ownerBLogin = await requestJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: { email: demo.ownerB.email, password: demo.ownerB.password }
    });
    const superLogin = await requestJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: { email: demo.superAdmin.email, password: demo.superAdmin.password }
    });

    ownerAToken = ownerALogin.payload.data.accessToken.token;
    ownerBToken = ownerBLogin.payload.data.accessToken.token;
    superToken = superLogin.payload.data.accessToken.token;
  });

  after(async () => {
    await cleanupDemoData();
    await closeDatabase();
    await new Promise((resolve) => server.close(resolve));
  });

  it('logs in demo users and enforces role routes', async () => {
    const ownerMe = await requestJson(baseUrl, '/auth/me', { token: ownerAToken });
    const ownerForbidden = await requestJson(baseUrl, '/auth/super-admin', { token: ownerAToken });
    const superAllowed = await requestJson(baseUrl, '/auth/super-admin', { token: superToken });

    assert.equal(ownerMe.response.status, 200);
    assert.equal(ownerMe.payload.data.rol, 'OWNER');
    assert.equal(ownerForbidden.response.status, 403);
    assert.equal(superAllowed.response.status, 200);
  });

  it('keeps OWNER product CRUD scoped to its company', async () => {
    const createA = await requestJson(baseUrl, '/products', {
      method: 'POST',
      token: ownerAToken,
      body: {
        empresa_id: demo.companyBId,
        nombre: 'Producto Owner A',
        precio: 100,
        stock: 5
      }
    });
    const createB = await requestJson(baseUrl, '/products', {
      method: 'POST',
      token: ownerBToken,
      body: {
        nombre: 'Producto Owner B',
        precio: 200,
        stock: 3
      }
    });

    assert.equal(createA.response.status, 201);
    assert.equal(Number(createA.payload.data.empresa_id), demo.companyAId);
    assert.equal(createB.response.status, 201);

    const crossRead = await requestJson(baseUrl, `/products/${createB.payload.data.id}`, {
      token: ownerAToken
    });
    const updateA = await requestJson(baseUrl, `/products/${createA.payload.data.id}`, {
      method: 'PUT',
      token: ownerAToken,
      body: {
        nombre: 'Producto Owner A Editado',
        precio: 125,
        stock: 4
      }
    });
    const deleteA = await requestJson(baseUrl, `/products/${createA.payload.data.id}`, {
      method: 'DELETE',
      token: ownerAToken
    });

    assert.equal(crossRead.response.status, 404);
    assert.equal(updateA.response.status, 200);
    assert.equal(updateA.payload.data.nombre, 'Producto Owner A Editado');
    assert.equal(deleteA.response.status, 204);
  });

  it('supports OWNER service CRUD', async () => {
    const createService = await requestJson(baseUrl, '/services', {
      method: 'POST',
      token: ownerAToken,
      body: {
        nombre: 'Servicio Demo',
        descripcion: 'Servicio de prueba',
        precio: 300,
        duracion: 60
      }
    });
    const updateService = await requestJson(baseUrl, `/services/${createService.payload.data.id}`, {
      method: 'PUT',
      token: ownerAToken,
      body: {
        nombre: 'Servicio Demo Editado',
        descripcion: 'Servicio de prueba',
        precio: 350,
        duracion: 90
      }
    });
    const deleteService = await requestJson(baseUrl, `/services/${createService.payload.data.id}`, {
      method: 'DELETE',
      token: ownerAToken
    });

    assert.equal(createService.response.status, 201);
    assert.equal(Number(createService.payload.data.empresa_id), demo.companyAId);
    assert.equal(updateService.response.status, 200);
    assert.equal(updateService.payload.data.nombre, 'Servicio Demo Editado');
    assert.equal(deleteService.response.status, 204);
  });
});
