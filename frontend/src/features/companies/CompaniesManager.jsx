import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Bot,
  Building2,
  Eye,
  Filter,
  LogIn,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert
} from 'lucide-react';
import { ConfirmModal, ErrorState, StatusBadge } from '../../components/ui/index.js';
import { Can } from '../../components/Can.jsx';
import { isSuperAdminRole } from '../../config/permissions.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { CompanyForm } from './CompanyForm.jsx';
import { CompanyTable } from './CompanyTable.jsx';
import {
  createCompany,
  deleteCompany,
  fetchCompanies,
  fetchSaasGlobalOverview,
  impersonateCompanyOwner,
  updateCompany
} from './companiesApi.js';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

const initialFilters = {
  query: '',
  estado: '',
  plan: ''
};

const emptySaasOverview = {
  resumen: {
    empresas: 0,
    activas: 0,
    inactivas: 0,
    whatsapp_conectadas: 0,
    ia_activas: 0,
    leads_30d: 0,
    conversaciones_30d: 0,
    errores: 0,
    plantillas_asignadas: 0,
    salud_promedio: 0
  },
  empresas: [],
  auditoria_reciente: []
};

function SaaSMetric({ icon: Icon, label, value, detail, tone = 'blue' }) {
  return (
    <article className={`saas-metric ${tone}`}>
      <span><Icon size={18} aria-hidden="true" /></span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function CompanyOpsCard({ company, onView }) {
  const whatsappConnected = company.whatsapp_status === 'CONNECTED';

  return (
    <button className="saas-company-card" onClick={() => onView(company)} type="button">
      <div>
        <strong>{company.nombre}</strong>
        <span>{company.tipo_negocio || 'General'} - {company.plan}</span>
      </div>
      <div className="saas-company-health">
        <span>{company.salud_saas}%</span>
        <small>salud</small>
      </div>
      <div className="saas-company-signals">
        <span className={whatsappConnected ? 'good' : 'bad'}>WA {whatsappConnected ? 'ON' : 'OFF'}</span>
        <span className={company.activo_ia ? 'good' : 'warn'}>IA {company.activo_ia ? 'ON' : 'OFF'}</span>
        <span>{company.template_nombre || 'Sin plantilla'}</span>
      </div>
      <p>{company.leads_30d} leads - {company.conversaciones_30d} conversaciones - {company.usuarios_activos} usuarios</p>
    </button>
  );
}

function SaaSGlobalPanel({ overview, onViewCompany }) {
  const summary = overview.resumen ?? emptySaasOverview.resumen;
  const riskyCompanies = [...(overview.empresas ?? [])]
    .sort((first, second) => Number(first.salud_saas ?? 0) - Number(second.salud_saas ?? 0))
    .slice(0, 5);

  return (
    <>
      <section className="saas-command-grid" aria-label="Metricas globales SaaS">
        <SaaSMetric icon={Building2} label="Empresas" value={summary.empresas} detail={`${summary.activas} activas / ${summary.inactivas} inactivas`} />
        <SaaSMetric icon={MessageCircle} label="WhatsApp conectado" value={`${summary.whatsapp_conectadas}/${summary.empresas}`} detail="Sesiones listas para operar" tone="green" />
        <SaaSMetric icon={Bot} label="IA activa" value={summary.ia_activas} detail="Empresas con asistente habilitado" tone="purple" />
        <SaaSMetric icon={Sparkles} label="Plantillas" value={summary.plantillas_asignadas} detail="Empresas con prompt asignado" tone="amber" />
        <SaaSMetric icon={TriangleAlert} label="Errores" value={summary.errores} detail="Empresas con error reciente" tone="red" />
        <SaaSMetric icon={Activity} label="Salud promedio" value={`${summary.salud_promedio}%`} detail="Estado global de operacion" />
      </section>

      <section className="saas-ops-grid">
        <article className="saas-panel">
          <div>
            <p className="eyebrow">Operacion global</p>
            <h2>Empresas que requieren atencion</h2>
          </div>
          <div className="saas-company-card-list">
            {riskyCompanies.map((company) => (
              <CompanyOpsCard company={company} key={company.id} onView={onViewCompany} />
            ))}
          </div>
        </article>

        <article className="saas-panel">
          <div>
            <p className="eyebrow">Auditoria</p>
            <h2>Actividad reciente</h2>
          </div>
          <div className="saas-audit-list">
            {(overview.auditoria_reciente ?? []).map((event) => (
              <article key={event.id}>
                <strong>{event.descripcion || `${event.accion} en ${event.modulo}`}</strong>
                <span>{event.usuario_nombre || 'Sistema'} - {event.empresa_nombre || 'Global'}</span>
              </article>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}

export function CompaniesManager() {
  const { assumeSession, user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = isSuperAdminRole(user?.rol);
  const [companies, setCompanies] = useState([]);
  const [editingCompany, setEditingCompany] = useState(null);
  const [viewingCompany, setViewingCompany] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [saasOverview, setSaasOverview] = useState(emptySaasOverview);
  const [error, setError] = useState('');

  const stats = useMemo(() => {
    const active = companies.filter((company) => company.activo).length;
    const inactive = companies.length - active;

    return {
      active,
      inactive,
      total: companies.length
    };
  }, [companies]);

  const plans = useMemo(
    () => Array.from(new Set(companies.map((company) => company.plan).filter(Boolean))),
    [companies]
  );

  const filteredCompanies = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return companies.filter((company) => {
      const status = company.activo ? 'ACTIVA' : 'INACTIVA';
      const matchesQuery =
        !query ||
        company.nombre?.toLowerCase().includes(query) ||
        company.telefono?.toLowerCase().includes(query) ||
        company.tipo_negocio?.toLowerCase().includes(query) ||
        company.slug?.toLowerCase().includes(query);
      const matchesStatus = !filters.estado || status === filters.estado;
      const matchesPlan = !filters.plan || company.plan === filters.plan;

      return matchesQuery && matchesStatus && matchesPlan;
    });
  }, [companies, filters]);

  async function loadCompanies() {
    try {
      setIsLoading(true);
      setError('');
      const [nextCompanies, nextOverview] = await Promise.all([
        isSuperAdmin ? Promise.resolve([]) : fetchCompanies(),
        isSuperAdmin ? fetchSaasGlobalOverview() : Promise.resolve(emptySaasOverview)
      ]);
      setCompanies(isSuperAdmin ? nextOverview.empresas ?? [] : nextCompanies);
      setSaasOverview(nextOverview);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCompanies();
  }, [isSuperAdmin]);

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingCompany) {
        await updateCompany(editingCompany.id, payload);
      } else {
        await createCompany(payload);
      }

      setEditingCompany(null);
      setIsFormOpen(false);
      await loadCompanies();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(company) {
    if (!company) {
      return;
    }

    try {
      setError('');
      await deleteCompany(company.id);
      setPendingDelete(null);
      await loadCompanies();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function handleToggle(company) {
    if (!company) {
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await updateCompany(company.id, { ...company, activo: !company.activo });
      setPendingToggle(null);
      await loadCompanies();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImpersonate(company) {
    try {
      setError('');
      const session = await impersonateCompanyOwner(company.id);
      assumeSession(session);
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <div className="resource-page companies-page">
      <div className="companies-unified-header">
        <div>
          <span className="companies-header-icon">
            <Building2 size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Administracion</p>
            <h1>{isSuperAdmin ? 'Administracion' : 'Empresas'}</h1>
            <p>{isSuperAdmin ? 'Opera empresas, WhatsApp, IA, plantillas, errores y auditoria desde una consola global.' : 'Gestiona negocios, planes y estado operativo del entorno multiempresa.'}</p>
          </div>
        </div>
        <div>
          <Can permission="tenants.manage">
            <button
              className="primary-button"
              onClick={() => {
                setEditingCompany(null);
                setIsFormOpen(true);
              }}
              type="button"
            >
              <Plus size={18} aria-hidden="true" />
              {isSuperAdmin ? 'Crear empresa con wizard' : 'Nueva empresa'}
            </button>
          </Can>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadCompanies} /> : null}

      {isSuperAdmin ? <SaaSGlobalPanel overview={saasOverview} onViewCompany={setViewingCompany} /> : null}

      <div className="companies-summary-grid">
        <article className="company-summary-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
          <p>Empresas creadas en la plataforma.</p>
        </article>
        <article className="company-summary-card active">
          <span>Activas</span>
          <strong>{stats.active}</strong>
          <p>Empresas operando con acceso habilitado.</p>
        </article>
        <article className="company-summary-card inactive">
          <span>Inactivas</span>
          <strong>{stats.inactive}</strong>
          <p>Empresas pausadas o fuera de operacion.</p>
        </article>
      </div>

      <section className="panel-section companies-directory-panel">
        <div className="companies-toolbar">
          <label className="product-search" htmlFor="companies-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="companies-search"
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar empresa, telefono o giro"
              type="search"
              value={filters.query}
            />
          </label>

          <div className="company-filter-group">
            <Filter size={18} aria-hidden="true" />
            <select
              aria-label="Estado"
              onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
              value={filters.estado}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVA">Activas</option>
              <option value="INACTIVA">Inactivas</option>
            </select>
            <select
              aria-label="Plan"
              onChange={(event) => setFilters((current) => ({ ...current, plan: event.target.value }))}
              value={filters.plan}
            >
              <option value="">Todos los planes</option>
              {plans.map((plan) => (
                <option key={plan} value={plan}>
                  {plan}
                </option>
              ))}
            </select>
          </div>

          <span className="companies-visible-count">
            {filteredCompanies.length} de {companies.length} visibles
          </span>
        </div>

        <CompanyTable
          companies={filteredCompanies}
          isLoading={isLoading}
          onDelete={setPendingDelete}
          onEdit={(company) => {
            setEditingCompany(company);
            setIsFormOpen(true);
          }}
          onToggle={setPendingToggle}
          onView={setViewingCompany}
        />

      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide" role="dialog" aria-modal="true" aria-labelledby="company-form-title">
            <button
              className="modal-close icon-button"
              onClick={() => {
                setEditingCompany(null);
                setIsFormOpen(false);
              }}
              type="button"
              aria-label="Cerrar formulario"
            >
              x
            </button>
            <div className="catalog-modal-header">
              <span>
                <Building2 size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Empresa</p>
                <h2 id="company-form-title">{editingCompany ? 'Editar empresa' : 'Wizard de nueva empresa'}</h2>
                <p>{editingCompany ? 'Configura los datos comerciales y el plan de la empresa.' : 'Alta guiada para crear la empresa base del tenant SaaS.'}</p>
              </div>
            </div>
            <CompanyForm
              company={editingCompany}
              isSaving={isSaving}
              onCancel={() => {
                setEditingCompany(null);
                setIsFormOpen(false);
              }}
              onSubmit={handleSubmit}
            />
          </article>
        </div>
      ) : null}

      {viewingCompany ? (
        <div className="modal-backdrop" role="presentation">
          <article className="company-detail-modal" role="dialog" aria-modal="true" aria-labelledby="company-detail-title">
            <button className="modal-close icon-button" onClick={() => setViewingCompany(null)} type="button" aria-label="Cerrar detalle">
              x
            </button>
            <div className="company-detail-header">
              <span>
                <Eye size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Detalle de empresa</p>
                <h2 id="company-detail-title">{viewingCompany.nombre}</h2>
                <p>{viewingCompany.tipo_negocio || 'Tipo de negocio no configurado'}</p>
              </div>
              <StatusBadge status={viewingCompany.activo ? 'ACTIVA' : 'INACTIVA'}>
                {viewingCompany.activo ? 'ACTIVA' : 'INACTIVA'}
              </StatusBadge>
            </div>
            <dl className="company-detail-grid">
              <div>
                <dt>Plan</dt>
                <dd>{viewingCompany.plan || '-'}</dd>
              </div>
              <div>
                <dt>Telefono</dt>
                <dd>{viewingCompany.telefono || '-'}</dd>
              </div>
              <div>
                <dt>Slug</dt>
                <dd>{viewingCompany.slug || '-'}</dd>
              </div>
              <div>
                <dt>Direccion</dt>
                <dd>{viewingCompany.direccion || '-'}</dd>
              </div>
              {isSuperAdmin ? (
                <>
                  <div>
                    <dt>WhatsApp</dt>
                    <dd>{viewingCompany.whatsapp_status || 'Sin sesion'}</dd>
                  </div>
                  <div>
                    <dt>IA</dt>
                    <dd>{viewingCompany.activo_ia ? 'Activa' : 'Pausada'}</dd>
                  </div>
                  <div>
                    <dt>Plantilla</dt>
                    <dd>{viewingCompany.template_nombre || 'Sin asignar'}</dd>
                  </div>
                  <div>
                    <dt>Leads 30d</dt>
                    <dd>{viewingCompany.leads_30d ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Conversaciones 30d</dt>
                    <dd>{viewingCompany.conversaciones_30d ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Ultimo error</dt>
                    <dd>{viewingCompany.ultimo_error || 'Sin errores recientes'}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            {isSuperAdmin ? (
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => handleImpersonate(viewingCompany)} type="button">
                  <LogIn size={17} aria-hidden="true" />
                  Ver como OWNER
                </button>
                <Can permission="tenants.manage">
                  <button className="primary-button" onClick={() => {
                    setEditingCompany(viewingCompany);
                    setViewingCompany(null);
                    setIsFormOpen(true);
                  }} type="button">
                    <ShieldCheck size={17} aria-hidden="true" />
                    Administrar tenant
                  </button>
                </Can>
              </div>
            ) : null}
          </article>
        </div>
      ) : null}

      <ConfirmModal
        destructive
        confirmLabel="Eliminar"
        description={`Se eliminara ${pendingDelete?.nombre ?? 'esta empresa'} y sus datos asociados.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => handleDelete(pendingDelete)}
        open={Boolean(pendingDelete)}
        title="Eliminar empresa"
      />

      <ConfirmModal
        confirmLabel={pendingToggle?.activo ? 'Desactivar' : 'Activar'}
        description={
          pendingToggle?.activo
            ? `Se pausara ${pendingToggle?.nombre ?? 'esta empresa'} sin eliminar sus datos.`
            : `Se reactivara ${pendingToggle?.nombre ?? 'esta empresa'} para operar nuevamente.`
        }
        onCancel={() => setPendingToggle(null)}
        onConfirm={() => handleToggle(pendingToggle)}
        open={Boolean(pendingToggle)}
        title={pendingToggle?.activo ? 'Desactivar empresa' : 'Activar empresa'}
      />
    </div>
  );
}
