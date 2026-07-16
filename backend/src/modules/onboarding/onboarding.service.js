import { query } from '../../config/database.js';
import { getAuthenticatedEmpresaId, isSuperAdmin, resolveScopedEmpresaId } from '../../middlewares/company-scope.middleware.js';
import { createHttpError } from '../../utils/http-error.js';
import { createCompany } from '../companies/companies.service.js';
import { upsertCompanySettings } from '../company-settings/company-settings.service.js';
import { createProduct } from '../products/products.service.js';
import { createUser } from '../users/users.service.js';
import { messagingService } from '../../messaging/messaging.service.js';

function bool(value) {
  return value === true || value === 1 || value === '1';
}

function hasText(value) {
  return String(value ?? '').trim().length > 0;
}

function text(value) {
  return String(value ?? '').trim();
}

function nullableText(value) {
  const cleanValue = text(value);
  return cleanValue || null;
}

function normalizeOnboardingProduct(product = {}) {
  return {
    nombre: text(product.nombre),
    descripcion: nullableText(product.descripcion),
    precio: Number(product.precio ?? 0),
    stock: Number.parseInt(product.stock ?? 0, 10),
    estado: 'ACTIVO'
  };
}

function normalizeOnboardingPayload(payload = {}) {
  const business = payload.business ?? {};
  const owner = payload.owner ?? {};
  const settings = payload.settings ?? {};
  const products = Array.isArray(payload.products) ? payload.products : [];
  const whatsapp = payload.whatsapp ?? {};

  if (!hasText(business.nombre)) {
    throw createHttpError(400, 'El nombre del negocio es requerido');
  }

  if (!hasText(owner.nombre) || !hasText(owner.correo) || !hasText(owner.password)) {
    throw createHttpError(400, 'El primer usuario owner requiere nombre, correo y password');
  }

  if (!hasText(settings.mensaje_bienvenida)) {
    throw createHttpError(400, 'El mensaje de bienvenida es requerido');
  }

  if (!hasText(settings.nombre_bot)) {
    throw createHttpError(400, 'El nombre de la IA es requerido');
  }

  return {
    business: {
      nombre: text(business.nombre),
      telefono: nullableText(business.telefono),
      direccion: nullableText(business.direccion),
      tipo_negocio: nullableText(business.tipo_negocio),
      plan: text(business.plan || payload.plan || 'STARTER').toUpperCase(),
      activo: true
    },
    owner: {
      nombre: text(owner.nombre),
      correo: text(owner.correo).toLowerCase(),
      password: String(owner.password ?? ''),
      rol: 'owner',
      estado: 'ACTIVO'
    },
    settings: {
      nombre_bot: text(settings.nombre_bot),
      tono_respuesta: nullableText(settings.tono_respuesta) ?? 'profesional',
      mensaje_bienvenida: text(settings.mensaje_bienvenida),
      instrucciones_negocio: nullableText(settings.instrucciones_negocio),
      temas_bloqueados: nullableText(settings.temas_bloqueados),
      faq_personalizada: nullableText(settings.faq_personalizada),
      auto_pedidos: settings.auto_pedidos ?? true,
      envio_imagenes: settings.envio_imagenes ?? true,
      fallback_message: nullableText(settings.fallback_message),
      activo_ia: true,
      activo_whatsapp: whatsapp.connect_now === true
    },
    products: products
      .map(normalizeOnboardingProduct)
      .filter((product) => hasText(product.nombre)),
    whatsapp: {
      connect_now: whatsapp.connect_now === true
    }
  };
}

function scoreStep({ id, title, description, completed, action, to, weight = 1, detail = null }) {
  return {
    id,
    title,
    description,
    completed: Boolean(completed),
    action,
    to,
    weight,
    detail
  };
}

function progressFromSteps(steps) {
  const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);
  const completedWeight = steps.filter((step) => step.completed).reduce((sum, step) => sum + step.weight, 0);

  return {
    completed_steps: steps.filter((step) => step.completed).length,
    total_steps: steps.length,
    percent: totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0
  };
}

async function getCompanyOnboardingData(empresaId) {
  const [[companyRows], [catalogRows], [promptRows]] = await Promise.all([
    query(
      `SELECT
         e.id,
         e.nombre,
         e.telefono,
         e.direccion,
         e.tipo_negocio,
         e.activo,
         e.estado,
         ce.nombre_bot,
         ce.tono_respuesta,
         ce.mensaje_bienvenida,
         ce.mensaje_fuera_horario,
         ce.telefono_dueno,
         ce.horario_atencion,
         ce.politica_entrega,
         ce.politica_pagos,
         COALESCE(ce.activo_ia, 1) AS activo_ia,
         COALESCE(ce.activo_whatsapp, 1) AS activo_whatsapp
       FROM empresas e
       LEFT JOIN configuracion_empresas ce ON ce.empresa_id = e.id
       WHERE e.id = ?
       LIMIT 1`,
      [empresaId]
    ),
    query(
      `SELECT
         SUM(CASE WHEN p.id IS NOT NULL AND p.estado = 'ACTIVO' THEN 1 ELSE 0 END) AS productos,
         (
           SELECT COUNT(*)
           FROM servicios s
           WHERE s.empresa_id = ? AND s.estado = 'ACTIVO'
         ) AS servicios,
         (
           SELECT COUNT(*)
           FROM categorias c
           WHERE c.empresa_id = ? AND c.estado = 'ACTIVA'
         ) AS categorias
       FROM empresas e
       LEFT JOIN productos p ON p.empresa_id = e.id
       WHERE e.id = ?`,
      [empresaId, empresaId, empresaId]
    ),
    query(
      `SELECT brs.id, brs.template_id, bpt.nombre AS template_nombre
       FROM bot_response_settings brs
       LEFT JOIN bot_prompt_templates bpt ON bpt.id = brs.template_id
       WHERE brs.empresa_id = ?
       LIMIT 1`,
      [empresaId]
    )
  ]);

  return {
    company: companyRows[0] ?? null,
    catalog: catalogRows[0] ?? { productos: 0, servicios: 0, categorias: 0 },
    prompt: promptRows[0] ?? null,
    whatsapp: await messagingService.getStatusSnapshot(empresaId).catch(() => null)
  };
}

function buildSteps(data) {
  const company = data.company ?? {};
  const catalog = data.catalog ?? {};
  const prompt = data.prompt ?? {};
  const whatsapp = data.whatsapp ?? {};
  const hasCatalog = Number(catalog.productos ?? 0) + Number(catalog.servicios ?? 0) > 0;

  return [
    scoreStep({
      id: 'business',
      title: 'Datos del negocio',
      description: 'Nombre, giro, direccion y telefono base.',
      completed: hasText(company.nombre) && hasText(company.tipo_negocio) && (hasText(company.direccion) || hasText(company.telefono)),
      action: 'Completar negocio',
      to: '/configuracion',
      weight: 1.2,
      detail: company.tipo_negocio || 'Sin tipo de negocio'
    }),
    scoreStep({
      id: 'assistant',
      title: 'Personalidad del asistente',
      description: 'Nombre del bot, tono y bienvenida.',
      completed: hasText(company.nombre_bot) && hasText(company.tono_respuesta) && hasText(company.mensaje_bienvenida),
      action: 'Configurar bot',
      to: '/configuracion',
      weight: 1.4,
      detail: company.nombre_bot || 'Asistente sin nombre'
    }),
    scoreStep({
      id: 'contact',
      title: 'Contacto y politicas',
      description: 'Telefono del dueno, horario, entregas y pagos.',
      completed: hasText(company.telefono_dueno) && hasText(company.horario_atencion) && hasText(company.politica_entrega) && hasText(company.politica_pagos),
      action: 'Completar politicas',
      to: '/configuracion',
      weight: 1,
      detail: company.telefono_dueno || 'Sin telefono de dueno'
    }),
    scoreStep({
      id: 'catalog',
      title: 'Catalogo comercial',
      description: 'Productos o servicios activos para responder con datos reales.',
      completed: hasCatalog,
      action: Number(catalog.productos ?? 0) > 0 ? 'Revisar servicios' : 'Cargar catalogo',
      to: Number(catalog.productos ?? 0) > 0 ? '/servicios' : '/productos',
      weight: 1.8,
      detail: `${Number(catalog.productos ?? 0)} productos · ${Number(catalog.servicios ?? 0)} servicios`
    }),
    scoreStep({
      id: 'whatsapp',
      title: 'WhatsApp conectado',
      description: 'Sesion lista para recibir y responder clientes.',
      completed: bool(company.activo_whatsapp) && whatsapp.status === 'CONNECTED',
      action: 'Conectar WhatsApp',
      to: '/whatsapp',
      weight: 1.8,
      detail: whatsapp.status || 'DISCONNECTED'
    }),
    scoreStep({
      id: 'ai',
      title: 'IA activa',
      description: 'El asistente puede responder automaticamente.',
      completed: bool(company.activo_ia),
      action: 'Activar IA',
      to: '/configuracion',
      weight: 1,
      detail: bool(company.activo_ia) ? 'Activa' : 'Pausada'
    }),
    scoreStep({
      id: 'template',
      title: 'Plantilla del bot',
      description: 'Prompt o formato comercial asignado al negocio.',
      completed: Boolean(prompt.id),
      action: 'Asignar plantilla',
      to: '/prompts-bot',
      weight: 0.8,
      detail: prompt.template_nombre || 'Sin plantilla asignada'
    })
  ];
}

export async function getOnboardingStatus(auth, requestedEmpresaId = null) {
  const empresaId = isSuperAdmin(auth)
    ? resolveScopedEmpresaId(auth, requestedEmpresaId ?? auth.user.empresaId)
    : getAuthenticatedEmpresaId(auth);
  const data = await getCompanyOnboardingData(empresaId);
  const steps = buildSteps(data);
  const progress = progressFromSteps(steps);

  return {
    empresa_id: empresaId,
    empresa_nombre: data.company?.nombre ?? null,
    ready: progress.percent >= 85,
    progress,
    steps,
    next_step: steps.find((step) => !step.completed) ?? null,
    summary: {
      productos: Number(data.catalog?.productos ?? 0),
      servicios: Number(data.catalog?.servicios ?? 0),
      categorias: Number(data.catalog?.categorias ?? 0),
      whatsapp_status: data.whatsapp?.status ?? 'DISCONNECTED',
      ia_activa: bool(data.company?.activo_ia)
    }
  };
}

export async function createCompanyOnboarding(payload, auth) {
  if (!isSuperAdmin(auth)) {
    throw createHttpError(403, 'Solo super_admin puede crear onboarding de empresas nuevas');
  }

  const onboarding = normalizeOnboardingPayload(payload);
  const company = await createCompany(onboarding.business);
  const empresaId = company.id;

  const scopedAuth = {
    ...auth,
    user: {
      ...auth.user,
      empresaId
    }
  };

  const owner = await createUser({
    ...onboarding.owner,
    empresa_id: empresaId
  }, auth);

  const settings = await upsertCompanySettings({
    ...onboarding.settings,
    empresa_id: empresaId
  }, auth);

  const products = [];

  for (const product of onboarding.products) {
    products.push(await createProduct({
      ...product,
      empresa_id: empresaId
    }, auth));
  }

  return {
    company,
    owner,
    settings,
    products,
    whatsapp: {
      connect_now: onboarding.whatsapp.connect_now,
      next_step: onboarding.whatsapp.connect_now ? '/whatsapp' : null,
      status: onboarding.whatsapp.connect_now ? 'PENDING_CONNECTION' : 'PENDING'
    },
    checklist: await getOnboardingStatus(scopedAuth, empresaId)
  };
}
