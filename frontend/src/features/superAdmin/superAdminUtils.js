export const emptyFilters = {
  query: '',
  status: '',
  plan: '',
  sort: 'created_desc'
};

export function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency'
  });
}

export function formatDate(value) {
  if (!value) {
    return 'Sin registro';
  }

  return new Date(value).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatDateTime(value) {
  if (!value) {
    return 'Sin registro';
  }

  return new Date(value).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

export function formatRelativeTime(value) {
  if (!value) {
    return 'Sin fecha';
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Sin fecha';
  }

  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diffMs / 60000));

  if (minutes < 60) {
    return `hace ${minutes} min`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} h`;
  }

  return `hace ${Math.round(hours / 24)} d`;
}

export function getPlanClass(plan) {
  return `superadmin-plan-badge plan-${String(plan || 'sin-plan').toLowerCase()}`;
}

export function getInitials(value) {
  return String(value || 'SA')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'SA';
}

export function buildPlanStats(companies) {
  return Object.values(companies.reduce((accumulator, company) => {
    const plan = company.plan || 'SIN PLAN';
    if (!accumulator[plan]) {
      accumulator[plan] = {
        plan,
        empresas: 0,
        usuarios: 0,
        whatsapp: 0,
        conversaciones: 0,
        ingreso: 0
      };
    }

    accumulator[plan].empresas += 1;
    accumulator[plan].usuarios += Number(company.usuarios_activos ?? 0);
    accumulator[plan].whatsapp += company.whatsapp_status === 'CONNECTED' ? 1 : 0;
    accumulator[plan].conversaciones += Number(company.conversaciones_30d ?? 0);
    accumulator[plan].ingreso += Number(company.ingreso_estimado_mensual ?? 0);
    return accumulator;
  }, {}));
}

export function buildAttentionItems(companies) {
  return companies.flatMap((company) => {
    const items = [];

    if (!company.activo) {
      items.push({
        company: company.nombre,
        id: `${company.id}-inactive`,
        message: 'La empresa esta suspendida.',
        severity: 'Critica',
        tone: 'danger',
        title: 'Empresa suspendida'
      });
    }

    if (company.ultimo_error) {
      items.push({
        company: company.nombre,
        id: `${company.id}-error`,
        message: 'Hay un error operativo reciente.',
        severity: 'Critica',
        tone: 'danger',
        title: 'Error operativo'
      });
    }

    if (company.whatsapp_status && company.whatsapp_status !== 'CONNECTED') {
      items.push({
        company: company.nombre,
        id: `${company.id}-whatsapp`,
        message: 'La sesion necesita reconexion.',
        severity: 'Advertencia',
        tone: 'warning',
        title: 'WhatsApp requiere atencion'
      });
    }

    if (!company.template_id) {
      items.push({
        company: company.nombre,
        id: `${company.id}-template`,
        message: 'Falta asignar una plantilla de IA.',
        severity: 'Revision',
        tone: 'info',
        title: 'Sin plantilla IA'
      });
    }

    if (Number(company.salud_saas ?? 100) < 55) {
      items.push({
        company: company.nombre,
        id: `${company.id}-health`,
        message: `Salud operativa en ${company.salud_saas ?? 0}%.`,
        severity: 'Advertencia',
        tone: 'warning',
        title: 'Uso requiere seguimiento'
      });
    }

    return items;
  });
}

export function sortCompanies(companies, sort) {
  const copy = [...companies];
  return copy.sort((a, b) => {
    if (sort === 'name_asc') {
      return String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''));
    }
    if (sort === 'name_desc') {
      return String(b.nombre ?? '').localeCompare(String(a.nombre ?? ''));
    }
    if (sort === 'health_asc') {
      return Number(a.salud_saas ?? 0) - Number(b.salud_saas ?? 0);
    }
    if (sort === 'revenue_desc') {
      return Number(b.ingreso_estimado_mensual ?? 0) - Number(a.ingreso_estimado_mensual ?? 0);
    }
    return new Date(b.fecha_creacion ?? 0) - new Date(a.fecha_creacion ?? 0);
  });
}
