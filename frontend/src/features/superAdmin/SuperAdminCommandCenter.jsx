import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Filter,
  Plus,
  Power,
  RefreshCcw,
  Search,
  ShieldCheck,
  Users,
  X
} from 'lucide-react';
import { StatusBadge } from '../../components/ui/index.js';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getInitials,
  getPlanClass
} from './superAdminUtils.js';

export function SuperAdminCommandCenter({
  attentionItems,
  companies,
  error,
  filteredCompanies,
  filters,
  isSaving,
  lastUpdated,
  onClearFilters,
  onCreate,
  onEdit,
  onFilterChange,
  onRefresh,
  onSelectCompany,
  onToggleCompany,
  planNames,
  plans,
  recentActivity,
  selectedCompany,
  setSelectedCompany,
  summary
}) {
  return (
    <div className="resource-page superadmin-page superadmin-command-center">
      <SuperAdminHero
        attentionCount={attentionItems.length}
        isSaving={isSaving}
        lastUpdated={lastUpdated}
        onCreate={onCreate}
        onRefresh={onRefresh}
        summary={summary}
      />

      {error ? <SuperAdminErrorState message={error} onRetry={onRefresh} /> : null}

      <ExecutiveSummary companies={companies} summary={summary} />

      <section className="superadmin-command-layout">
        <main className="superadmin-command-main">
          <CompaniesSection
            companies={filteredCompanies}
            filters={filters}
            isSaving={isSaving}
            onClear={onClearFilters}
            onCreate={onCreate}
            onEdit={onEdit}
            onFilterChange={onFilterChange}
            onSelect={onSelectCompany}
            onToggle={onToggleCompany}
            plans={planNames}
            total={companies.length}
          />
          <PlansSection plans={plans} />
        </main>

        <aside className="superadmin-command-side">
          <AttentionPanel items={attentionItems} />
          <ActivityTimeline events={recentActivity} />
        </aside>
      </section>

      <CompanyDetailDrawer
        company={selectedCompany}
        isSaving={isSaving}
        onClose={() => setSelectedCompany(null)}
        onEdit={onEdit}
        onToggle={onToggleCompany}
      />
    </div>
  );
}

export function SuperAdminHero({ attentionCount, isSaving, lastUpdated, onCreate, onRefresh, summary }) {
  const platformStatus = attentionCount > 0 ? 'Requiere revision' : 'Plataforma operativa';

  return (
    <header className="superadmin-hero">
      <div className="superadmin-hero-copy">
        <span className="superadmin-hero-icon">
          <ShieldCheck size={24} aria-hidden="true" />
        </span>
        <p className="eyebrow">Centro de control</p>
        <h1>Centro de Super Admin</h1>
        <p>Administra empresas, planes, usuarios y actividad general de la plataforma.</p>
      </div>
      <div className="superadmin-hero-actions">
        <button className="secondary-button" disabled={isSaving} onClick={onRefresh} type="button">
          <RefreshCcw size={18} aria-hidden="true" />
          Actualizar datos
        </button>
        <button className="primary-button" disabled={isSaving} onClick={onCreate} type="button">
          <Plus size={18} aria-hidden="true" />
          Crear empresa
        </button>
      </div>
      <div className="superadmin-hero-summary">
        <HeroStat label="Estado general" value={platformStatus} />
        <HeroStat label="Empresas activas" value={summary.activas ?? 0} />
        <HeroStat label="Alertas criticas" value={attentionCount} />
        <HeroStat label="Ultima actualizacion" value={formatRelativeTime(lastUpdated)} />
      </div>
    </header>
  );
}

function HeroStat({ label, value }) {
  return (
    <div className="superadmin-hero-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ExecutiveSummary({ companies, summary }) {
  const whatsappIssues = companies.filter((company) => company.whatsapp_status && company.whatsapp_status !== 'CONNECTED').length;
  const pendingTemplates = companies.filter((company) => !company.template_id).length;

  return (
    <section className="superadmin-executive-summary" aria-label="Resumen ejecutivo">
      <ExecutiveSummaryCard
        icon={Building2}
        title="Empresas"
        rows={[
          ['Total', summary.empresas ?? 0],
          ['Activas', summary.activas ?? 0],
          ['Suspendidas', summary.inactivas ?? 0]
        ]}
      />
      <ExecutiveSummaryCard
        icon={Users}
        title="Operacion"
        rows={[
          ['Usuarios activos', summary.usuarios_activos ?? 0],
          ['WhatsApp con problemas', whatsappIssues],
          ['Plantillas IA pendientes', pendingTemplates]
        ]}
      />
      <ExecutiveSummaryCard
        icon={CircleDollarSign}
        title="Consumo"
        rows={[
          ['Conversaciones IA', summary.conversaciones_30d ?? 0],
          ['Uso mensual', summary.respuestas_ia_30d ?? 0],
          ['Estimado mensual', formatCurrency(summary.ingreso_estimado_mensual)]
        ]}
      />
    </section>
  );
}

function ExecutiveSummaryCard({ icon: Icon, rows, title }) {
  return (
    <article className="superadmin-summary-card">
      <header>
        <span><Icon size={21} aria-hidden="true" /></span>
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

function CompaniesSection({
  companies,
  filters,
  isSaving,
  onClear,
  onCreate,
  onEdit,
  onFilterChange,
  onSelect,
  onToggle,
  plans,
  total
}) {
  return (
    <section className="superadmin-section superadmin-companies-section">
      <header className="superadmin-section-header">
        <div>
          <p className="eyebrow">Gestion de empresas</p>
          <h2>Empresas registradas</h2>
          <p>Gestiona el estado, plan y operacion de cada empresa.</p>
        </div>
        <span>{companies.length}/{total} visibles</span>
      </header>
      <CompaniesToolbar
        filters={filters}
        onChange={onFilterChange}
        onClear={onClear}
        plans={plans}
      />
      {companies.length === 0 ? (
        <SuperAdminEmptyState onCreate={onCreate} />
      ) : (
        <div className="superadmin-company-list">
          {companies.map((company) => (
            <CompanyCard
              company={company}
              isSaving={isSaving}
              key={company.id}
              onEdit={onEdit}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CompaniesToolbar({ filters, onChange, onClear, plans }) {
  return (
    <div className="superadmin-companies-toolbar" aria-label="Filtros de empresas">
      <label className="superadmin-company-search" htmlFor="superadmin-company-search">
        <Search size={18} aria-hidden="true" />
        <input
          id="superadmin-company-search"
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder="Buscar empresa, slug o tipo de negocio"
          value={filters.query}
        />
      </label>
      <label htmlFor="superadmin-status-filter">
        <Filter size={15} aria-hidden="true" />
        <select id="superadmin-status-filter" onChange={(event) => onChange({ ...filters, status: event.target.value })} value={filters.status}>
          <option value="">Estado</option>
          <option value="active">Activas</option>
          <option value="inactive">Suspendidas</option>
        </select>
      </label>
      <label htmlFor="superadmin-plan-filter">
        <select id="superadmin-plan-filter" onChange={(event) => onChange({ ...filters, plan: event.target.value })} value={filters.plan}>
          <option value="">Plan</option>
          {plans.map((plan) => (
            <option key={plan} value={plan}>{plan}</option>
          ))}
        </select>
      </label>
      <label htmlFor="superadmin-sort-filter">
        <select id="superadmin-sort-filter" onChange={(event) => onChange({ ...filters, sort: event.target.value })} value={filters.sort}>
          <option value="created_desc">Mas recientes</option>
          <option value="name_asc">Nombre A-Z</option>
          <option value="name_desc">Nombre Z-A</option>
          <option value="health_asc">Salud baja primero</option>
          <option value="revenue_desc">Mayor ingreso</option>
        </select>
      </label>
      <button className="ghost-button" onClick={onClear} type="button">Limpiar</button>
    </div>
  );
}

function CompanyCard({ company, isSaving, onEdit, onSelect, onToggle }) {
  const whatsappOk = company.whatsapp_status === 'CONNECTED';
  const whatsappLabel = whatsappOk ? 'WhatsApp conectado' : 'Requiere atencion';
  const aiLabel = company.template_id ? 'Plantilla IA lista' : 'Sin plantilla IA';

  return (
    <article className="superadmin-company-card">
      <div className="superadmin-company-identity">
        <span className="superadmin-company-avatar">{getInitials(company.nombre)}</span>
        <div>
          <h3>{company.nombre}</h3>
          <p>{company.tipo_negocio || company.slug || 'Empresa SaaS'}</p>
        </div>
        <StatusBadge status={company.activo ? 'ACTIVA' : 'SUSPENDIDA'}>
          {company.activo ? 'Activa' : 'Suspendida'}
        </StatusBadge>
      </div>
      <div className="superadmin-company-metrics">
        <span className={getPlanClass(company.plan)}>{company.plan || 'SIN PLAN'}</span>
        <span>Usuarios {company.usuarios_activos ?? 0}</span>
        <span>IA {company.respuestas_ia_30d ?? 0}</span>
        <span>Uso {company.salud_saas ?? 0}%</span>
      </div>
      <div className="superadmin-company-health">
        <p><strong>WhatsApp:</strong> {whatsappLabel}</p>
        <p><strong>IA:</strong> {aiLabel}</p>
      </div>
      <div className="superadmin-company-actions">
        <button className="ghost-button" onClick={() => onSelect(company)} type="button">
          <Eye size={16} aria-hidden="true" />
          Ver detalle
        </button>
        <button className="ghost-button" disabled={isSaving} onClick={() => onEdit(company)} type="button">
          Editar
        </button>
        <button className={company.activo ? 'ghost-button danger-soft' : 'ghost-button success-soft'} disabled={isSaving} onClick={() => onToggle(company)} type="button">
          <Power size={16} aria-hidden="true" />
          {company.activo ? 'Suspender' : 'Reactivar'}
        </button>
      </div>
    </article>
  );
}

function PlansSection({ plans }) {
  return (
    <section className="superadmin-section superadmin-plans-section">
      <header className="superadmin-section-header">
        <div>
          <p className="eyebrow">Planes contratados</p>
          <h2>Planes y suscripciones</h2>
          <p>Distribucion calculada con las empresas registradas.</p>
        </div>
      </header>
      <div className="superadmin-plans-list">
        {plans.length === 0 ? <p className="superadmin-muted">No hay planes asignados.</p> : null}
        {plans.map((plan) => (
          <PlanCard key={plan.plan} plan={plan} />
        ))}
      </div>
    </section>
  );
}

function PlanCard({ plan }) {
  return (
    <article className="superadmin-plan-wide-card">
      <div>
        <span className={getPlanClass(plan.plan)}>{plan.plan}</span>
        <h3>{plan.empresas} empresa{plan.empresas === 1 ? '' : 's'} usando este plan</h3>
      </div>
      <dl>
        <div><dt>Usuarios</dt><dd>{plan.usuarios}</dd></div>
        <div><dt>WhatsApp</dt><dd>{plan.whatsapp}</dd></div>
        <div><dt>Conversaciones</dt><dd>{plan.conversaciones}</dd></div>
        <div><dt>Estimado mensual</dt><dd>{formatCurrency(plan.ingreso)}</dd></div>
      </dl>
      <div className="superadmin-plan-progress" aria-hidden="true">
        <span style={{ width: `${Math.min(plan.empresas * 18, 100)}%` }} />
      </div>
    </article>
  );
}

function AttentionPanel({ items }) {
  const [showAll, setShowAll] = useState(false);
  const visibleItems = showAll ? items : items.slice(0, 4);

  return (
    <section className="superadmin-side-card">
      <header>
        <p className="eyebrow">Alertas</p>
        <h2>Requiere atencion</h2>
      </header>
      <div className="superadmin-attention-list">
        {items.length === 0 ? (
          <div className="superadmin-attention-empty">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>Sin alertas relevantes.</span>
          </div>
        ) : null}
        {visibleItems.map((item) => (
          <AttentionItem item={item} key={item.id} />
        ))}
        {items.length > 4 ? (
          <button className="superadmin-show-more" onClick={() => setShowAll((current) => !current)} type="button">
            {showAll ? 'Ver menos' : `Ver todo (${items.length})`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function AttentionItem({ item }) {
  return (
    <article className={`superadmin-attention-item ${item.tone}`}>
      <AlertTriangle size={17} aria-hidden="true" />
      <div>
        <strong>{item.title}</strong>
        <span>{item.company}</span>
        <p>{item.message}</p>
        <small>{item.severity}</small>
      </div>
    </article>
  );
}

function ActivityTimeline({ events }) {
  const [showAll, setShowAll] = useState(false);
  const visibleEvents = showAll ? events : events.slice(0, 5);

  return (
    <section className="superadmin-side-card">
      <header>
        <p className="eyebrow">Actividad reciente</p>
        <h2>Timeline</h2>
      </header>
      <div className="superadmin-timeline">
        {events.length === 0 ? <p className="superadmin-muted">No hay actividad reciente.</p> : null}
        {visibleEvents.map((event) => (
          <ActivityItem event={event} key={event.id} />
        ))}
        {events.length > 5 ? (
          <button className="superadmin-show-more" onClick={() => setShowAll((current) => !current)} type="button">
            {showAll ? 'Ver menos' : `Ver todo (${events.length})`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ActivityItem({ event }) {
  return (
    <article className="superadmin-timeline-item">
      <span><Activity size={14} aria-hidden="true" /></span>
      <div>
        <strong>{event.descripcion || event.accion || 'Actividad registrada'}</strong>
        <p>{event.empresa_nombre || event.modulo || 'Sistema'} · {event.usuario_nombre || 'Usuario del sistema'}</p>
        <small>{formatRelativeTime(event.fecha)}</small>
      </div>
    </article>
  );
}

function CompanyDetailDrawer({ company, isSaving, onClose, onEdit, onToggle }) {
  if (!company) {
    return null;
  }

  return (
    <div className="superadmin-drawer-backdrop" role="presentation">
      <aside className="superadmin-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="company-detail-title">
        <button className="icon-button superadmin-drawer-close" onClick={onClose} type="button" aria-label="Cerrar detalle">
          <X size={18} aria-hidden="true" />
        </button>
        <header>
          <span className="superadmin-company-avatar large">{getInitials(company.nombre)}</span>
          <div>
            <p className="eyebrow">Detalle de empresa</p>
            <h2 id="company-detail-title">{company.nombre}</h2>
            <p>{company.tipo_negocio || company.slug || 'Empresa SaaS'}</p>
          </div>
          <StatusBadge status={company.activo ? 'ACTIVA' : 'SUSPENDIDA'}>
            {company.activo ? 'Activa' : 'Suspendida'}
          </StatusBadge>
        </header>
        <dl className="superadmin-detail-grid">
          <div><dt>Plan</dt><dd>{company.plan || '-'}</dd></div>
          <div><dt>Usuarios</dt><dd>{company.usuarios_activos ?? 0}</dd></div>
          <div><dt>Creacion</dt><dd>{formatDate(company.fecha_creacion)}</dd></div>
          <div><dt>WhatsApp</dt><dd>{company.whatsapp_status || 'Sin sesion'}</dd></div>
          <div><dt>Numero WhatsApp</dt><dd>{company.whatsapp_numero || '-'}</dd></div>
          <div><dt>IA</dt><dd>{company.activo_ia ? 'Activa' : 'Inactiva'}</dd></div>
          <div><dt>Plantilla IA</dt><dd>{company.template_nombre || 'Sin plantilla'}</dd></div>
          <div><dt>Uso</dt><dd>{company.salud_saas ?? 0}%</dd></div>
          <div><dt>Leads 30d</dt><dd>{company.leads_30d ?? 0}</dd></div>
          <div><dt>Conversaciones IA 30d</dt><dd>{company.conversaciones_30d ?? 0}</dd></div>
          <div><dt>Respuestas IA 30d</dt><dd>{company.respuestas_ia_30d ?? 0}</dd></div>
          <div><dt>Ingreso estimado</dt><dd>{formatCurrency(company.ingreso_estimado_mensual)}</dd></div>
          <div><dt>Ultimo error</dt><dd>{company.ultimo_error || 'Sin errores recientes'}</dd></div>
          <div><dt>Ultima actualizacion WhatsApp</dt><dd>{formatDateTime(company.whatsapp_updated_at)}</dd></div>
        </dl>
        <div className="superadmin-detail-actions">
          <button className="secondary-button" disabled={isSaving} onClick={() => onEdit(company)} type="button">
            <Building2 size={18} aria-hidden="true" />
            Editar empresa
          </button>
          <button className={company.activo ? 'secondary-button danger-soft' : 'secondary-button success-soft'} disabled={isSaving} onClick={() => onToggle(company)} type="button">
            <Power size={18} aria-hidden="true" />
            {company.activo ? 'Suspender' : 'Reactivar'}
          </button>
        </div>
      </aside>
    </div>
  );
}

export function SuperAdminSkeleton() {
  return (
    <div className="resource-page superadmin-page superadmin-command-center">
      <section className="superadmin-command-skeleton" role="status" aria-live="polite">
        <div className="superadmin-skeleton-hero" />
        <div className="superadmin-skeleton-summary">
          <span /><span /><span />
        </div>
        <div className="superadmin-skeleton-body">
          <span /><span />
        </div>
        <p>Cargando Centro de Super Admin...</p>
      </section>
    </div>
  );
}

function SuperAdminErrorState({ message, onRetry }) {
  return (
    <section className="superadmin-feedback error" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <div>
        <h2>No pudimos cargar el Centro de Super Admin.</h2>
        <p>{message || 'Intenta actualizar los datos.'}</p>
      </div>
      <button className="secondary-button" onClick={onRetry} type="button">Actualizar datos</button>
    </section>
  );
}

function SuperAdminEmptyState({ onCreate }) {
  return (
    <section className="superadmin-empty-state">
      <Building2 size={30} aria-hidden="true" />
      <div>
        <h2>No hay empresas registradas.</h2>
        <p>Crea la primera empresa para comenzar.</p>
      </div>
      <button className="primary-button" onClick={onCreate} type="button">
        <Plus size={18} aria-hidden="true" />
        Crear primera empresa
      </button>
    </section>
  );
}
