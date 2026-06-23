import dotenv from 'dotenv';
import { closeDatabase, getConnection } from '../config/database.js';

dotenv.config();

const MOK_SLUG = process.env.MOK_COMPANY_SLUG ?? 'mok-estudio-taller';
const MOK_NAME = process.env.MOK_COMPANY_NAME ?? 'MOK Estudio + Taller';

const CATEGORY_NAMES = [
  'Diseño',
  'Marketing',
  'Impresión',
  'Vinil',
  'Rotulación',
  'Señalética',
  'Textil',
  'Promocionales',
  'Banners',
  'Instalación'
];

const quoteNotes = {
  senaletica: 'Cotización según material, medida, acabado y volumen.',
  textil: 'Cotización según prenda, técnica, cantidad y diseño.',
  promocionales: 'Cotización según artículo, técnica, cantidad y diseño.',
  banners: 'Cotización según formato, medida, material y acabado.',
  microperforado: 'Cotización según medida, material y requerimientos de instalación.',
  instalacion: 'Cotización según ubicación, superficie, altura y complejidad de instalación.'
};

const SERVICES = [
  {
    nombre: 'Impresión de lona',
    categoria: 'Impresión',
    descripcion: 'Impresión de lona por metro cuadrado.',
    precio: 390,
    tipo_precio: 'POR_M2',
    unidad_medida: 'm2',
    requiere_medidas: true,
    incluye: 'Diseño',
    no_incluye: 'Instalación'
  },
  {
    nombre: 'Vinil impreso',
    categoria: 'Vinil',
    descripcion: 'Vinil impreso por metro cuadrado.',
    precio: 390,
    tipo_precio: 'POR_M2',
    unidad_medida: 'm2',
    requiere_medidas: true,
    incluye: 'Diseño',
    no_incluye: 'Instalación'
  },
  {
    nombre: 'Vinil de rotulación de color',
    categoria: 'Rotulación',
    descripcion: 'Vinil de rotulación de color por metro cuadrado.',
    precio: 400,
    tipo_precio: 'POR_M2',
    unidad_medida: 'm2',
    requiere_medidas: true,
    incluye: 'Depilado y transfer',
    no_incluye: 'Instalación'
  },
  {
    nombre: 'Vinil reflejante',
    categoria: 'Rotulación',
    descripcion: 'Vinil reflejante por metro cuadrado.',
    precio: 800,
    tipo_precio: 'POR_M2',
    unidad_medida: 'm2',
    requiere_medidas: true,
    incluye: 'Depilado y transfer',
    no_incluye: 'Instalación'
  },
  {
    nombre: 'Tarjetas digitales laminado mate 100 pzs',
    categoria: 'Impresión',
    descripcion: 'Paquete de tarjetas digitales con laminado mate.',
    precio: 297,
    tipo_precio: 'FIJO',
    unidad_medida: 'paquete',
    requiere_cantidad: true,
    notas_cotizacion: '100 piezas laminado mate. Para más de 500 piezas consultar con asesor.'
  },
  {
    nombre: 'Diseño de logotipo',
    categoria: 'Diseño',
    descripcion: 'Diseño profesional de logotipo.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    notas_cotizacion: 'Precio sujeto al alcance del proyecto.'
  },
  {
    nombre: 'Identidad e imagen corporativa',
    categoria: 'Diseño',
    descripcion: 'Desarrollo de identidad e imagen corporativa.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    notas_cotizacion: 'Cotización según piezas, aplicaciones y alcance de la identidad.'
  },
  {
    nombre: 'Diseño web',
    categoria: 'Diseño',
    descripcion: 'Diseño y desarrollo de sitio web.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    notas_cotizacion: 'Precio según secciones, funciones y alcance.'
  },
  {
    nombre: 'Marketing digital',
    categoria: 'Marketing',
    descripcion: 'Servicios de marketing digital.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    notas_cotizacion: 'Cotización según objetivos, canales, contenido y duración de campaña.'
  },
  {
    nombre: 'Vinil microperforado',
    categoria: 'Vinil',
    descripcion: 'Vinil microperforado para cristales y superficies.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_medidas: true,
    notas_cotizacion: quoteNotes.microperforado
  },
  {
    nombre: 'Instalación',
    categoria: 'Instalación',
    descripcion: 'Instalación de materiales gráficos y rotulación.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    notas_cotizacion: quoteNotes.instalacion
  },
  {
    nombre: 'Coroplast con vinil impreso',
    categoria: 'Señalética',
    descripcion: 'Señalética en coroplast con vinil impreso.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_medidas: true,
    notas_cotizacion: quoteNotes.senaletica
  },
  {
    nombre: 'Trovicel con vinil impreso',
    categoria: 'Señalética',
    descripcion: 'Señalética en trovicel con vinil impreso.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_medidas: true,
    notas_cotizacion: quoteNotes.senaletica
  },
  {
    nombre: 'Coroplast con corte de vinil',
    categoria: 'Señalética',
    descripcion: 'Señalética en coroplast con corte de vinil.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_medidas: true,
    notas_cotizacion: quoteNotes.senaletica
  },
  {
    nombre: 'Trovicel con corte de vinil',
    categoria: 'Señalética',
    descripcion: 'Señalética en trovicel con corte de vinil.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_medidas: true,
    notas_cotizacion: quoteNotes.senaletica
  },
  {
    nombre: 'Aluminio cepillado o lámina galvanizada con corte de vinil',
    categoria: 'Señalética',
    descripcion: 'Señalética en aluminio cepillado o lámina galvanizada con corte de vinil.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_medidas: true,
    notas_cotizacion: quoteNotes.senaletica
  },
  {
    nombre: 'Impresión textil con serigrafía',
    categoria: 'Textil',
    descripcion: 'Impresión textil con técnica de serigrafía.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_cantidad: true,
    notas_cotizacion: quoteNotes.textil
  },
  {
    nombre: 'Impresión textil con DTF',
    categoria: 'Textil',
    descripcion: 'Impresión textil con técnica DTF.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_cantidad: true,
    notas_cotizacion: quoteNotes.textil
  },
  {
    nombre: 'Impresión textil con vinil textil',
    categoria: 'Textil',
    descripcion: 'Impresión textil con vinil textil.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_cantidad: true,
    notas_cotizacion: quoteNotes.textil
  },
  {
    nombre: 'Promocionales con serigrafía',
    categoria: 'Promocionales',
    descripcion: 'Promocionales personalizados con serigrafía.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_cantidad: true,
    notas_cotizacion: quoteNotes.promocionales
  },
  {
    nombre: 'Promocionales con DTF',
    categoria: 'Promocionales',
    descripcion: 'Promocionales personalizados con DTF.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_cantidad: true,
    notas_cotizacion: quoteNotes.promocionales
  },
  {
    nombre: 'Promocionales con corte de vinil',
    categoria: 'Promocionales',
    descripcion: 'Promocionales personalizados con corte de vinil.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    requiere_cantidad: true,
    notas_cotizacion: quoteNotes.promocionales
  },
  {
    nombre: 'Banner araña 0.60 x 1.60 m',
    categoria: 'Banners',
    descripcion: 'Banner araña en formato 0.60 x 1.60 m.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    notas_cotizacion: quoteNotes.banners
  },
  {
    nombre: 'Banner araña 0.80 x 1.80 m',
    categoria: 'Banners',
    descripcion: 'Banner araña en formato 0.80 x 1.80 m.',
    tipo_precio: 'COTIZACION',
    unidad_medida: 'asesor',
    notas_cotizacion: quoteNotes.banners
  }
];

async function findCompany(connection) {
  const [exactRows] = await connection.query(
    `SELECT id, nombre, slug
       FROM empresas
      WHERE slug = ? OR nombre = ?
      ORDER BY slug = ? DESC, nombre = ? DESC, id
      LIMIT 1`,
    [MOK_SLUG, MOK_NAME, MOK_SLUG, MOK_NAME]
  );

  if (exactRows.length > 0) {
    return exactRows[0];
  }

  const [likeRows] = await connection.query(
    `SELECT id, nombre, slug
       FROM empresas
      WHERE slug LIKE ? OR nombre LIKE ?
      ORDER BY id
      LIMIT 1`,
    ['%mok%', '%MOK%']
  );

  return likeRows[0] ?? null;
}

async function ensureCategory(connection, empresaId, nombre) {
  await connection.query(
    `INSERT INTO categorias (empresa_id, nombre, tipo, estado)
     VALUES (?, ?, 'SERVICIO', 'ACTIVA')
     ON DUPLICATE KEY UPDATE estado = VALUES(estado), tipo = VALUES(tipo)`,
    [empresaId, nombre]
  );

  const [rows] = await connection.query(
    `SELECT id
       FROM categorias
      WHERE empresa_id = ? AND nombre = ? AND tipo = 'SERVICIO'
      LIMIT 1`,
    [empresaId, nombre]
  );

  return rows[0].id;
}

async function findService(connection, empresaId, nombre) {
  const [rows] = await connection.query(
    `SELECT id
       FROM servicios
      WHERE empresa_id = ? AND nombre = ?
      ORDER BY id
      LIMIT 1`,
    [empresaId, nombre]
  );

  return rows[0] ?? null;
}

function buildServicePayload(empresaId, categoryId, service) {
  const isQuote = service.tipo_precio === 'COTIZACION';

  return {
    empresa_id: empresaId,
    categoria_id: categoryId,
    nombre: service.nombre,
    descripcion: service.descripcion ?? null,
    precio: isQuote ? null : service.precio,
    tipo_precio: service.tipo_precio,
    unidad_medida: service.unidad_medida ?? (service.tipo_precio === 'POR_M2' ? 'm2' : null),
    duracion_minutos: null,
    requiere_medidas: service.requiere_medidas ? 1 : 0,
    requiere_cantidad: service.requiere_cantidad ? 1 : 0,
    incluye: service.incluye ?? null,
    no_incluye: service.no_incluye ?? null,
    notas_cotizacion: service.notas_cotizacion ?? null,
    precio_minimo: service.precio_minimo ?? null,
    estado: 'ACTIVO'
  };
}

async function upsertService(connection, payload) {
  const existing = await findService(connection, payload.empresa_id, payload.nombre);

  if (!existing) {
    const [result] = await connection.query(
      `INSERT INTO servicios (
         empresa_id, categoria_id, nombre, descripcion, precio, tipo_precio,
         unidad_medida, duracion_minutos, requiere_medidas, requiere_cantidad,
         incluye, no_incluye, notas_cotizacion, precio_minimo, estado
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.empresa_id,
        payload.categoria_id,
        payload.nombre,
        payload.descripcion,
        payload.precio,
        payload.tipo_precio,
        payload.unidad_medida,
        payload.duracion_minutos,
        payload.requiere_medidas,
        payload.requiere_cantidad,
        payload.incluye,
        payload.no_incluye,
        payload.notas_cotizacion,
        payload.precio_minimo,
        payload.estado
      ]
    );

    return { id: result.insertId, action: 'created' };
  }

  await connection.query(
    `UPDATE servicios
        SET categoria_id = ?,
            descripcion = ?,
            precio = ?,
            tipo_precio = ?,
            unidad_medida = ?,
            duracion_minutos = ?,
            requiere_medidas = ?,
            requiere_cantidad = ?,
            incluye = ?,
            no_incluye = ?,
            notas_cotizacion = ?,
            precio_minimo = ?,
            estado = ?
      WHERE empresa_id = ? AND id = ?`,
    [
      payload.categoria_id,
      payload.descripcion,
      payload.precio,
      payload.tipo_precio,
      payload.unidad_medida,
      payload.duracion_minutos,
      payload.requiere_medidas,
      payload.requiere_cantidad,
      payload.incluye,
      payload.no_incluye,
      payload.notas_cotizacion,
      payload.precio_minimo,
      payload.estado,
      payload.empresa_id,
      existing.id
    ]
  );

  return { id: existing.id, action: 'updated' };
}

async function main() {
  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    const company = await findCompany(connection);
    if (!company) {
      throw new Error(`No se encontró la empresa ${MOK_NAME}. Ajusta MOK_COMPANY_SLUG o MOK_COMPANY_NAME.`);
    }

    const categoryIds = new Map();
    for (const categoryName of CATEGORY_NAMES) {
      const categoryId = await ensureCategory(connection, company.id, categoryName);
      categoryIds.set(categoryName, categoryId);
    }

    const summary = { created: 0, updated: 0 };
    for (const service of SERVICES) {
      const categoryId = categoryIds.get(service.categoria);
      const payload = buildServicePayload(company.id, categoryId, service);
      const result = await upsertService(connection, payload);
      summary[result.action] += 1;
    }

    await connection.commit();

    console.log(`MOK demo listo para ${company.nombre} (${company.slug}).`);
    console.log(`Categorías verificadas: ${CATEGORY_NAMES.length}.`);
    console.log(`Servicios creados: ${summary.created}. Servicios actualizados: ${summary.updated}.`);
  } catch (error) {
    await connection.rollback();
    console.error('No se pudo normalizar la demo de MOK:', error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    await closeDatabase();
  }
}

main();
