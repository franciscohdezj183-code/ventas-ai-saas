import { useEffect, useMemo, useState } from 'react';
import { Building2, Eye, Filter, Plus, Search } from 'lucide-react';
import { ConfirmModal, ErrorState, StatusBadge } from '../../components/ui/index.js';
import { CompanyForm } from './CompanyForm.jsx';
import { CompanyTable } from './CompanyTable.jsx';
import {
  createCompany,
  deleteCompany,
  fetchCompanies,
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

export function CompaniesManager() {
  const [companies, setCompanies] = useState([]);
  const [editingCompany, setEditingCompany] = useState(null);
  const [viewingCompany, setViewingCompany] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
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
      setCompanies(await fetchCompanies());
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCompanies();
  }, []);

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

  return (
    <div className="resource-page companies-page">
      <div className="companies-unified-header">
        <div>
          <span className="companies-header-icon">
            <Building2 size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Administracion</p>
            <h1>Empresas</h1>
            <p>Gestiona negocios, planes y estado operativo del entorno multiempresa.</p>
          </div>
        </div>
        <div>
          <div className="companies-header-metric">
            <strong>{stats.total}</strong>
            <span>empresas registradas</span>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setEditingCompany(null);
              setIsFormOpen(true);
            }}
            type="button"
          >
            <Plus size={18} aria-hidden="true" />
            Nueva empresa
          </button>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadCompanies} /> : null}

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
                <h2 id="company-form-title">{editingCompany ? 'Editar empresa' : 'Nueva empresa'}</h2>
                <p>Configura los datos comerciales y el plan de la empresa.</p>
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
            </dl>
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
