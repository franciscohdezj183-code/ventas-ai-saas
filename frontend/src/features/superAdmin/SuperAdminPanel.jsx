import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  CircleDollarSign,
  MessageSquareText,
  Plus,
  Power,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import { ErrorState, LoadingState, StatusBadge } from '../../components/ui/index.js';
import { CompanyForm } from '../companies/CompanyForm.jsx';
import { createCompany, fetchSaasGlobalOverview, updateCompany } from '../companies/companiesApi.js';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency'
  });
}

function SuperAdminMetric({ icon: Icon, label, value, detail, tone = 'blue' }) {
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

export function SuperAdminPanel() {
  const [overview, setOverview] = useState({ resumen: {}, empresas: [], auditoria_reciente: [] });
  const [editingCompany, setEditingCompany] = useState(null);
  const [error, setError] = useState('');
  const [isCompanyFormOpen, setIsCompanyFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const companies = overview.empresas ?? [];
  const summary = overview.resumen ?? {};
  const planCounts = useMemo(() => {
    return companies.reduce((accumulator, company) => {
      const plan = company.plan || 'SIN_PLAN';
      accumulator[plan] = (accumulator[plan] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [companies]);

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
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <LoadingState message="Cargando panel Super Admin..." />;
  }

  return (
    <div className="resource-page companies-page">
      <div className="companies-unified-header">
        <div>
          <span className="companies-header-icon">
            <ShieldCheck size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Super Admin</p>
            <h1>Panel global Nexus IA</h1>
            <p>Empresas, planes, consumo operativo, usuarios, conversaciones e ingresos estimados.</p>
          </div>
        </div>
        <div>
          <button className="secondary-button" disabled={isSaving} onClick={loadOverview} type="button">
            <RefreshCcw size={18} aria-hidden="true" />
            Actualizar
          </button>
          <Link className="primary-button" to="/inicio-guiado">
            <Plus size={18} aria-hidden="true" />
            Crear empresa
          </Link>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadOverview} /> : null}

      <section className="saas-command-grid" aria-label="Metricas globales Super Admin">
        <SuperAdminMetric icon={Building2} label="Empresas registradas" value={summary.empresas ?? 0} detail={`${summary.activas ?? 0} activas / ${summary.inactivas ?? 0} suspendidas`} />
        <SuperAdminMetric icon={Users} label="Usuarios activos" value={summary.usuarios_activos ?? 0} detail="Usuarios activos en todos los tenants" tone="green" />
        <SuperAdminMetric icon={MessageSquareText} label="Conversaciones 30d" value={summary.conversaciones_30d ?? 0} detail="Conversaciones registradas por empresas" tone="purple" />
        <SuperAdminMetric icon={Sparkles} label="Consumo IA 30d" value={summary.respuestas_ia_30d ?? 0} detail="Respuestas guardadas asociadas a IA" tone="amber" />
        <SuperAdminMetric icon={CircleDollarSign} label="MRR estimado" value={formatCurrency(summary.ingreso_estimado_mensual)} detail={`${formatCurrency(summary.ingreso_estimado_anual)} estimado anual`} tone="green" />
      </section>

      <section className="panel-section companies-directory-panel">
        <div className="section-header dashboard-section-header">
          <div>
            <h2>Empresas registradas</h2>
            <p>
              Planes: BASICO {planCounts.BASICO ?? 0} · PRO {planCounts.PRO ?? 0} · ENTERPRISE {planCounts.ENTERPRISE ?? 0}
            </p>
          </div>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table companies-data-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Estado</th>
                <th>Plan</th>
                <th>Consumo IA 30d</th>
                <th>Usuarios</th>
                <th>Conversaciones 30d</th>
                <th>Ingreso estimado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>
                    <strong>{company.nombre}</strong>
                    <span className="muted-cell">{company.tipo_negocio || company.slug}</span>
                  </td>
                  <td>
                    <StatusBadge status={company.activo ? 'ACTIVA' : 'SUSPENDIDA'}>
                      {company.activo ? 'ACTIVA' : 'SUSPENDIDA'}
                    </StatusBadge>
                  </td>
                  <td><span className="plan-badge">{company.plan}</span></td>
                  <td>{company.respuestas_ia_30d}</td>
                  <td>{company.usuarios_activos}</td>
                  <td>{company.conversaciones_30d}</td>
                  <td>{formatCurrency(company.ingreso_estimado_mensual)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        aria-label={company.activo ? 'Suspender empresa' : 'Activar empresa'}
                        disabled={isSaving}
                        onClick={() => handleToggleCompany(company)}
                        title={company.activo ? 'Suspender' : 'Activar'}
                        type="button"
                      >
                        <Power size={16} aria-hidden="true" />
                      </button>
                      <button
                        aria-label="Editar empresa"
                        disabled={isSaving}
                        onClick={() => {
                          setEditingCompany(company);
                          setIsCompanyFormOpen(true);
                        }}
                        type="button"
                      >
                        <Building2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
                <p>Administra datos, estado y plan del tenant.</p>
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
    </div>
  );
}
