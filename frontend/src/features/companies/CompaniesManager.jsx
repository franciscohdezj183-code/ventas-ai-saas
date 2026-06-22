import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { ConfirmModal } from '../../components/ui/index.js';
import { isSuperAdminRole } from '../../config/permissions.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { CompanyDirectoryPage } from './CompanyDirectoryPage.jsx';
import { CompanyForm } from './CompanyForm.jsx';
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
      setViewingCompany((current) => current?.id === company.id ? { ...current, activo: !company.activo } : current);
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

  function openCreateCompany() {
    setEditingCompany(null);
    setIsFormOpen(true);
  }

  function openEditCompany(company) {
    setEditingCompany(company);
    setViewingCompany(null);
    setIsFormOpen(true);
  }

  return (
    <>
      <CompanyDirectoryPage
        allCompanies={companies}
        companies={filteredCompanies}
        error={error}
        filters={filters}
        isLoading={isLoading}
        isSaving={isSaving}
        isSuperAdmin={isSuperAdmin}
        onCreate={openCreateCompany}
        onDelete={setPendingDelete}
        onEdit={openEditCompany}
        onFilterChange={setFilters}
        onImpersonate={handleImpersonate}
        onRefresh={loadCompanies}
        onToggle={setPendingToggle}
        onView={setViewingCompany}
        plans={plans}
        stats={stats}
        viewingCompany={viewingCompany}
      />

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide" role="dialog" aria-modal="true" aria-labelledby="company-form-title">
            <button
              aria-label="Cerrar formulario"
              className="modal-close icon-button"
              onClick={() => {
                setEditingCompany(null);
                setIsFormOpen(false);
              }}
              type="button"
            >
              x
            </button>
            <div className="catalog-modal-header">
              <span>
                <Building2 size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Empresa</p>
                <h2 id="company-form-title">{editingCompany ? 'Editar empresa' : 'Crear empresa'}</h2>
                <p>{editingCompany ? 'Configura los datos comerciales y el plan de la empresa.' : 'Alta guiada para crear una empresa en la plataforma.'}</p>
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
    </>
  );
}
