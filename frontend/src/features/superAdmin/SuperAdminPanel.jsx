import { useEffect, useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { CompanyForm } from '../companies/CompanyForm.jsx';
import { createCompany, fetchSaasGlobalOverview, updateCompany } from '../companies/companiesApi.js';
import { SuperAdminCommandCenter, SuperAdminSkeleton } from './SuperAdminCommandCenter.jsx';
import {
  buildAttentionItems,
  buildPlanStats,
  emptyFilters,
  getApiError,
  sortCompanies
} from './superAdminUtils.js';

export function SuperAdminPanel() {
  const [overview, setOverview] = useState({ resumen: {}, empresas: [], auditoria_reciente: [] });
  const [editingCompany, setEditingCompany] = useState(null);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [error, setError] = useState('');
  const [isCompanyFormOpen, setIsCompanyFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const companies = overview.empresas ?? [];
  const summary = overview.resumen ?? {};
  const recentActivity = overview.auditoria_reciente ?? [];

  const plans = useMemo(() => buildPlanStats(companies), [companies]);
  const planNames = useMemo(() => Array.from(new Set(companies.map((company) => company.plan).filter(Boolean))), [companies]);
  const attentionItems = useMemo(() => buildAttentionItems(companies), [companies]);

  const lastUpdated = useMemo(() => {
    const dates = [
      ...recentActivity.map((event) => event.fecha),
      ...companies.map((company) => company.whatsapp_updated_at || company.ultimo_error_fecha || company.fecha_creacion)
    ].filter(Boolean);

    return dates.sort((a, b) => new Date(b) - new Date(a))[0];
  }, [companies, recentActivity]);

  const filteredCompanies = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const filtered = companies.filter((company) => {
      const matchesQuery = !query
        || [company.nombre, company.slug, company.tipo_negocio, company.telefono]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      const matchesStatus = !filters.status
        || (filters.status === 'active' ? company.activo : !company.activo);
      const matchesPlan = !filters.plan || company.plan === filters.plan;
      return matchesQuery && matchesStatus && matchesPlan;
    });

    return sortCompanies(filtered, filters.sort);
  }, [companies, filters]);

  async function loadOverview() {
    try {
      setIsLoading(true);
      setError('');
      setOverview(await fetchSaasGlobalOverview());
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  async function handleCompanySubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingCompany) {
        await updateCompany(editingCompany.id, payload);
      } else {
        await createCompany(payload);
      }

      setEditingCompany(null);
      setIsCompanyFormOpen(false);
      await loadOverview();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleCompany(company) {
    try {
      setIsSaving(true);
      setError('');
      await updateCompany(company.id, {
        ...company,
        activo: !company.activo
      });
      await loadOverview();
      setSelectedCompany((current) => current?.id === company.id ? { ...current, activo: !company.activo } : current);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  function openCreateCompany() {
    setEditingCompany(null);
    setIsCompanyFormOpen(true);
  }

  function openEditCompany(company) {
    setEditingCompany(company);
    setIsCompanyFormOpen(true);
  }

  if (isLoading) {
    return <SuperAdminSkeleton />;
  }

  return (
    <>
      <SuperAdminCommandCenter
        attentionItems={attentionItems}
        companies={companies}
        error={error}
        filteredCompanies={filteredCompanies}
        filters={filters}
        isSaving={isSaving}
        lastUpdated={lastUpdated}
        onClearFilters={() => setFilters(emptyFilters)}
        onCreate={openCreateCompany}
        onEdit={openEditCompany}
        onFilterChange={setFilters}
        onRefresh={loadOverview}
        onSelectCompany={setSelectedCompany}
        onToggleCompany={handleToggleCompany}
        planNames={planNames}
        plans={plans}
        recentActivity={recentActivity}
        selectedCompany={selectedCompany}
        setSelectedCompany={setSelectedCompany}
        summary={summary}
      />

      {isCompanyFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide" role="dialog" aria-modal="true" aria-labelledby="super-admin-company-form-title">
            <button
              aria-label="Cerrar formulario"
              className="modal-close icon-button"
              onClick={() => {
                setEditingCompany(null);
                setIsCompanyFormOpen(false);
              }}
              type="button"
            >
              x
            </button>
            <div className="catalog-modal-header">
              <span><Building2 size={22} aria-hidden="true" /></span>
              <div>
                <p className="eyebrow">Empresa</p>
                <h2 id="super-admin-company-form-title">{editingCompany ? 'Editar empresa' : 'Crear empresa'}</h2>
                <p>Administra datos, estado y plan de la empresa.</p>
              </div>
            </div>
            <CompanyForm
              company={editingCompany}
              isSaving={isSaving}
              onCancel={() => {
                setEditingCompany(null);
                setIsCompanyFormOpen(false);
              }}
              onSubmit={handleCompanySubmit}
            />
          </article>
        </div>
      ) : null}
    </>
  );
}
