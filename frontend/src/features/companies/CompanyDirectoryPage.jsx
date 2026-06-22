import { useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  CalendarDays,
  Eye,
  Filter,
  Grid3X3,
  List,
  LogIn,
  Plus,
  Power,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { Can } from '../../components/Can.jsx';
import { StatusBadge } from '../../components/ui/index.js';

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : 'Sin fecha';
}

function formatRelativeTime(value) {
  if (!value) {
    return 'Sin actividad';
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 'Sin actividad';
  }

  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) {
    return `Hace ${minutes} min`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `Hace ${hours} h`;
  }

  return `Hace ${Math.round(hours / 24)} d`;
}

function getInitials(value) {
  return String(value || 'Empresa')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'EM';
}

function getPlanClass(plan) {
  return `directory-plan-pill plan-${String(plan || 'sin-plan').toLowerCase()}`;
}

function getAdminName(company) {
  return company.admin_nombre || company.owner_nombre || company.usuario_nombre || company.administrador || 'Administrador no asignado';
}

function getLastActivity(company) {
  return company.ultima_actividad || company.whatsapp_updated_at || company.ultimo_error_fecha || company.fecha_creacion || company.created_at;
}

function normalizePlan(plan) {
  return String(plan || 'SIN PLAN').toUpperCase();
}

export function CompanyDirectoryPage({
  allCompanies,
  companies,
  error,
  filters,
  isLoading,
  isSaving,
  isSuperAdmin,
  onCreate,
  onDelete,
  onEdit,
  onFilterChange,
  onImpersonate,
  onRefresh,
  onToggle,
  onView,
  plans,
  stats,
  viewingCompany
}) {
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('created_desc');
  const sortedCompanies = useMemo(() => sortCompanies(companies, sortBy), [companies, sortBy]);

  return (
    <div className="resource-page companies-page company-directory-page">
      <CompanyHero
        companies={allCompanies}
        isSaving={isSaving}
        onCreate={onCreate}
        onRefresh={onRefresh}
        stats={stats}
      />

      {error ? <CompanyError message={error} onRetry={onRefresh} /> : null}

      <CompanySummary companies={allCompanies} stats={stats} />

      <CompanyToolbar
        filters={filters}
        onChange={onFilterChange}
        onClear={() => onFilterChange({ query: '', estado: '', plan: '' })}
        onSortChange={setSortBy}
        onViewModeChange={setViewMode}
        plans={plans}
        sortBy={sortBy}
        viewMode={viewMode}
      />

      <CompanyGrid
        companies={sortedCompanies}
        isLoading={isLoading}
        onCreate={onCreate}
        onDelete={onDelete}
        onEdit={onEdit}
        onToggle={onToggle}
        onView={onView}
        viewMode={viewMode}
      />

      <CompanyDrawer
        company={viewingCompany}
        isSuperAdmin={isSuperAdmin}
        onClose={() => onView(null)}
        onEdit={onEdit}
        onImpersonate={onImpersonate}
        onToggle={onToggle}
      />
    </div>
  );
}

function sortCompanies(companies, sortBy) {
  const copy = [...companies];

  return copy.sort((a, b) => {
    if (sortBy === 'name_asc') {
      return String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''));
    }
    if (sortBy === 'name_desc') {
      return String(b.nombre ?? '').localeCompare(String(a.nombre ?? ''));
    }
    if (sortBy === 'plan_asc') {
      return String(a.plan ?? '').localeCompare(String(b.plan ?? ''));
    }
    if (sortBy === 'status_desc') {
      return Number(b.activo) - Number(a.activo);
    }
    return new Date(b.fecha_creacion ?? b.created_at ?? 0) - new Date(a.fecha_creacion ?? a.created_at ?? 0);
  });
}

function CompanyHero({ companies, isSaving, onCreate, onRefresh, stats }) {
  const trial = companies.filter((company) => normalizePlan(company.plan).includes('TRIAL') || normalizePlan(company.plan).includes('PRUEBA')).length;
  const lastSync = companies
    .map(getLastActivity)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  return (
    <header className="company-directory-hero">
      <div>
        <span className="company-directory-icon"><Building2 size={24} aria-hidden="true" /></span>
        <p className="eyebrow">Directorio multiempresa</p>
        <h1>Directorio de Empresas</h1>
        <p>Administra todas las empresas registradas en la plataforma desde un solo lugar.</p>
      </div>
      <div className="company-directory-actions">
        <Can permission="tenants.manage">
          <button className="primary-button" disabled={isSaving} onClick={onCreate} type="button">
            <Plus size={18} aria-hidden="true" />
            Crear empresa
          </button>
        </Can>
        <button className="secondary-button" disabled={isSaving} onClick={onRefresh} type="button">
          <RefreshCcw size={18} aria-hidden="true" />
          Actualizar datos
        </button>
      </div>
      <div className="company-hero-strip" aria-label="Resumen del directorio">
        <HeroStat label="Empresas activas" value={stats.active} />
        <HeroStat label="Empresas suspendidas" value={stats.inactive} />
        <HeroStat label="Empresas en prueba" value={trial} />
        <HeroStat label="Ultima sincronizacion" value={formatRelativeTime(lastSync)} />
      </div>
    </header>
  );
}

function HeroStat({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CompanySummary({ companies, stats }) {
  const planCounts = companies.reduce((accumulator, company) => {
    const plan = normalizePlan(company.plan);
    accumulator[plan] = (accumulator[plan] ?? 0) + 1;
    return accumulator;
  }, {});
  const admins = companies.filter((company) => getAdminName(company) !== 'Administrador no asignado').length;
  const whatsappActive = companies.filter((company) => company.whatsapp_status === 'CONNECTED').length;
  const aiReady = companies.filter((company) => company.activo_ia || company.template_id).length;
  const newCompanies = companies.filter((company) => {
    const createdAt = new Date(company.fecha_creacion ?? company.created_at ?? 0).getTime();
    return createdAt && Date.now() - createdAt < 1000 * 60 * 60 * 24 * 30;
  }).length;

  return (
    <section className="company-executive-summary" aria-label="Resumen ejecutivo de empresas">
      <SummaryCard icon={Building2} title="Empresas" rows={[['Total', stats.total], ['Activas', stats.active], ['Suspendidas', stats.inactive]]} />
      <SummaryCard icon={Users} title="Usuarios" rows={[['Administradores', admins], ['Usuarios', sum(companies, 'usuarios_activos')], ['Invitaciones', sum(companies, 'invitaciones_pendientes')]]} />
      <SummaryCard icon={ShieldCheck} title="Planes" rows={[['Enterprise', planCounts.ENTERPRISE ?? 0], ['Pro', planCounts.PRO ?? 0], ['Free', planCounts.FREE ?? 0]]} />
      <SummaryCard icon={Activity} title="Actividad" rows={[['Altas', newCompanies], ['WhatsApp activo', whatsappActive], ['IA configurada', aiReady]]} />
    </section>
  );
}

function sum(companies, key) {
  return companies.reduce((total, company) => total + Number(company[key] ?? 0), 0);
}

function SummaryCard({ icon: Icon, rows, title }) {
  return (
    <article className="company-summary-premium-card">
      <header>
        <span><Icon size={20} aria-hidden="true" /></span>
        <h2>{title}</h2>
      </header>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function CompanyToolbar({ filters, onChange, onClear, onSortChange, onViewModeChange, plans, sortBy, viewMode }) {
  return (
    <section className="company-directory-toolbar" aria-label="Filtros de empresas">
      <label className="company-directory-search" htmlFor="company-directory-search">
        <Search size={18} aria-hidden="true" />
        <input
          id="company-directory-search"
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="Buscar empresa, telefono, slug o giro"
          type="search"
          value={filters.query}
        />
      </label>
      <label htmlFor="company-status-filter">
        <Filter size={16} aria-hidden="true" />
        <select id="company-status-filter" onChange={(event) => onChange({ ...filters, estado: event.target.value })} value={filters.estado}>
          <option value="">Estado</option>
          <option value="ACTIVA">Activas</option>
          <option value="INACTIVA">Suspendidas</option>
        </select>
      </label>
      <label htmlFor="company-plan-filter">
        <select id="company-plan-filter" onChange={(event) => onChange({ ...filters, plan: event.target.value })} value={filters.plan}>
          <option value="">Plan</option>
          {plans.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
        </select>
      </label>
      <label htmlFor="company-sort-filter">
        <select id="company-sort-filter" onChange={(event) => onSortChange(event.target.value)} value={sortBy}>
          <option value="created_desc">Mas recientes</option>
          <option value="name_asc">Nombre A-Z</option>
          <option value="name_desc">Nombre Z-A</option>
          <option value="plan_asc">Plan</option>
          <option value="status_desc">Activas primero</option>
        </select>
      </label>
      <button className="ghost-button" onClick={onClear} type="button">Limpiar filtros</button>
      <div className="company-view-toggle" aria-label="Cambiar vista">
        <button aria-pressed={viewMode === 'grid'} onClick={() => onViewModeChange('grid')} type="button"><Grid3X3 size={16} aria-hidden="true" /> Grid</button>
        <button aria-pressed={viewMode === 'list'} onClick={() => onViewModeChange('list')} type="button"><List size={16} aria-hidden="true" /> Lista</button>
      </div>
    </section>
  );
}

function CompanyGrid({ companies, isLoading, onCreate, onDelete, onEdit, onToggle, onView, viewMode }) {
  if (isLoading) {
    return <CompanySkeleton />;
  }

  if (companies.length === 0) {
    return <CompanyEmpty onCreate={onCreate} />;
  }

  return (
    <section className={`company-directory-grid ${viewMode}`} aria-label="Empresas registradas">
      {companies.map((company) => (
        <CompanyCard
          company={company}
          key={company.id}
          onDelete={onDelete}
          onEdit={onEdit}
          onToggle={onToggle}
          onView={onView}
        />
      ))}
    </section>
  );
}

function CompanyCard({ company, onDelete, onEdit, onToggle, onView }) {
  const whatsapp = company.whatsapp_status === 'CONNECTED' ? 'Activo' : 'Requiere atencion';
  const ai = company.activo_ia || company.template_id ? 'Configurada' : 'Pendiente';
  const createdAt = company.fecha_creacion ?? company.created_at ?? company.fecha_alta;

  return (
    <article className="company-directory-card">
      <header>
        <span className="company-avatar">{getInitials(company.nombre)}</span>
        <div>
          <h3>{company.nombre}</h3>
          <p>{company.tipo_negocio || company.slug || 'Empresa'}</p>
        </div>
        <StatusBadge status={company.activo ? 'ACTIVA' : 'INACTIVA'}>{company.activo ? 'Activa' : 'Suspendida'}</StatusBadge>
      </header>
      <div className="company-card-meta">
        <span className={getPlanClass(company.plan)}>{company.plan || 'SIN PLAN'}</span>
        <span>Administrador: {getAdminName(company)}</span>
      </div>
      <dl>
        <div><dt>Usuarios</dt><dd>{company.usuarios_activos ?? 0}</dd></div>
        <div><dt>WhatsApp</dt><dd>{whatsapp}</dd></div>
        <div><dt>IA</dt><dd>{ai}</dd></div>
        <div><dt>Creada</dt><dd>{formatDate(createdAt)}</dd></div>
        <div><dt>Ultima actividad</dt><dd>{formatRelativeTime(getLastActivity(company))}</dd></div>
      </dl>
      <footer>
        <button className="ghost-button" onClick={() => onView(company)} type="button"><Eye size={15} aria-hidden="true" /> Ver</button>
        <Can permission="tenants.manage">
          <button className="ghost-button" onClick={() => onEdit(company)} type="button">Editar</button>
        </Can>
        <Can permission="tenants.manage">
          <button className="ghost-button" onClick={() => onToggle(company)} type="button"><Power size={15} aria-hidden="true" /> {company.activo ? 'Suspender' : 'Activar'}</button>
        </Can>
        <Can permission="tenants.manage">
          <button className="ghost-button danger" onClick={() => onDelete(company)} type="button"><Trash2 size={15} aria-hidden="true" /> Eliminar</button>
        </Can>
      </footer>
    </article>
  );
}

function CompanyDrawer({ company, isSuperAdmin, onClose, onEdit, onImpersonate, onToggle }) {
  if (!company) {
    return null;
  }

  return (
    <div className="modal-backdrop company-detail-backdrop" role="presentation">
      <article className="catalog-modal wide company-detail-floating-modal" role="dialog" aria-modal="true" aria-labelledby="company-drawer-title">
        <button aria-label="Cerrar detalle" className="modal-close icon-button" onClick={onClose} type="button"><X size={18} aria-hidden="true" /></button>
        <header className="company-detail-floating-header">
          <span className="company-avatar large">{getInitials(company.nombre)}</span>
          <div>
            <p className="eyebrow">Detalle de empresa</p>
            <h2 id="company-drawer-title">{company.nombre}</h2>
            <p>{company.tipo_negocio || company.slug || 'Empresa'}</p>
          </div>
          <StatusBadge status={company.activo ? 'ACTIVA' : 'INACTIVA'}>{company.activo ? 'Activa' : 'Suspendida'}</StatusBadge>
        </header>
        <dl className="company-drawer-grid">
          <div><dt>Administrador</dt><dd>{getAdminName(company)}</dd></div>
          <div><dt>Usuarios</dt><dd>{company.usuarios_activos ?? 0}</dd></div>
          <div><dt>Plan</dt><dd>{company.plan || '-'}</dd></div>
          <div><dt>WhatsApp</dt><dd>{company.whatsapp_status || 'Sin sesion'}</dd></div>
          <div><dt>IA</dt><dd>{company.activo_ia ? 'Activa' : 'Pendiente'}</dd></div>
          <div><dt>Consumo</dt><dd>{company.conversaciones_30d ?? 0} conversaciones</dd></div>
          <div><dt>Creada</dt><dd>{formatDate(company.fecha_creacion ?? company.created_at)}</dd></div>
          <div><dt>Actividad reciente</dt><dd>{formatRelativeTime(getLastActivity(company))}</dd></div>
        </dl>
        <div className="company-drawer-actions">
          {isSuperAdmin ? (
            <button className="secondary-button" onClick={() => onImpersonate(company)} type="button"><LogIn size={17} aria-hidden="true" /> Ver como OWNER</button>
          ) : null}
          <Can permission="tenants.manage">
            <button className="primary-button" onClick={() => onEdit(company)} type="button"><ShieldCheck size={17} aria-hidden="true" /> Editar empresa</button>
          </Can>
          <Can permission="tenants.manage">
            <button className="secondary-button" onClick={() => onToggle(company)} type="button"><Power size={17} aria-hidden="true" /> {company.activo ? 'Suspender' : 'Activar'}</button>
          </Can>
        </div>
      </article>
    </div>
  );
}

function CompanySkeleton() {
  return (
    <section className="company-directory-grid" aria-label="Cargando empresas">
      {Array.from({ length: 6 }).map((_, index) => <article className="company-directory-card skeleton" key={index} />)}
    </section>
  );
}

function CompanyEmpty({ onCreate }) {
  return (
    <section className="company-directory-empty">
      <Building2 size={34} aria-hidden="true" />
      <div>
        <h2>No hay empresas registradas.</h2>
        <p>Crea la primera empresa para comenzar.</p>
      </div>
      <Can permission="tenants.manage">
        <button className="primary-button" onClick={onCreate} type="button"><Plus size={18} aria-hidden="true" /> Crear primera empresa</button>
      </Can>
    </section>
  );
}

function CompanyError({ message, onRetry }) {
  return (
    <section className="company-directory-error" role="alert">
      <Building2 size={24} aria-hidden="true" />
      <div>
        <h2>No pudimos cargar las empresas.</h2>
        <p>{message}</p>
      </div>
      <button className="secondary-button" onClick={onRetry} type="button">Reintentar</button>
    </section>
  );
}
