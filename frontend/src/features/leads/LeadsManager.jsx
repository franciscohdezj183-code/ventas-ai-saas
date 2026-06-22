import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  FilterX,
  Mail,
  Phone,
  Plus,
  Search,
  UserRound,
  UsersRound
} from 'lucide-react';
import { ConfirmModal, ErrorState } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isSuperAdminRole } from '../../config/permissions.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import { createLead, deleteLead, fetchLeads, fetchLeadStats, updateLead } from './leadsApi.js';
import { LeadForm } from './LeadForm.jsx';
import { LeadStats } from './LeadStats.jsx';
import { CRM_STATES, LeadStageBadge, LeadTable, normalizeLeadState, stateLabels } from './LeadTable.jsx';

const emptyStats = {
  total: 0,
  nuevo: 0,
  contactado: 0,
  cotizado: 0,
  ganado: 0,
  perdido: 0
};

const initialFilters = {
  dateFrom: '',
  dateTo: '',
  empresa: '',
  estado: '',
  query: ''
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function parseLeadDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = parseLeadDate(value);
  return date ? date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
}

function customerEmail(lead) {
  return lead.correo ?? lead.email ?? lead.email_cliente ?? '';
}

function leadResponsible(lead) {
  return lead.responsable_nombre ?? lead.responsable ?? lead.usuario_nombre ?? lead.assigned_to_name ?? '';
}

function buildCustomerStats(leads) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return leads.reduce((totals, lead) => {
    const state = normalizeLeadState(lead.estado);
    const createdAt = parseLeadDate(lead.fecha_creacion);

    totals.total += 1;

    if (state === 'PERDIDO') {
      totals.inactive += 1;
    } else {
      totals.active += 1;
    }

    if (createdAt && createdAt.getMonth() === currentMonth && createdAt.getFullYear() === currentYear) {
      totals.newThisMonth += 1;
    }

    return totals;
  }, { active: 0, inactive: 0, newThisMonth: 0, total: 0 });
}

function buildTimeline(lead) {
  if (!lead) {
    return [];
  }

  return [
    { label: 'Cliente registrado', at: lead.fecha_creacion, detail: lead.interes },
    lead.fecha_actualizacion && lead.fecha_actualizacion !== lead.fecha_creacion
      ? { label: 'Ultima actividad', at: lead.fecha_actualizacion, detail: stateLabels[normalizeLeadState(lead.estado)] }
      : null
  ].filter(Boolean);
}

export function LeadsManager() {
  const { user } = useAuth();
  const canSelectCompany = isSuperAdminRole(user?.rol);
  const [companies, setCompanies] = useState([]);
  const [editingLead, setEditingLead] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [leads, setLeads] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [stats, setStats] = useState(emptyStats);

  const companyOptions = useMemo(() => {
    const fromLeads = leads
      .map((lead) => lead.empresa_nombre)
      .filter(Boolean);

    return Array.from(new Set([...companies.map((company) => company.nombre), ...fromLeads]));
  }, [companies, leads]);

  const filteredLeads = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return leads.filter((lead) => {
      const createdAt = parseLeadDate(lead.fecha_creacion);
      const createdDate = createdAt ? createdAt.toISOString().slice(0, 10) : '';
      const companyName = lead.empresa_nombre ?? '';
      const email = customerEmail(lead);
      const matchesQuery =
        !query ||
        lead.nombre_cliente?.toLowerCase().includes(query) ||
        lead.telefono?.toLowerCase().includes(query) ||
        lead.interes?.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query) ||
        companyName.toLowerCase().includes(query) ||
        leadResponsible(lead).toLowerCase().includes(query);
      const matchesState = !filters.estado || normalizeLeadState(lead.estado) === filters.estado;
      const matchesCompany = !filters.empresa || companyName === filters.empresa;
      const matchesFrom = !filters.dateFrom || createdDate >= filters.dateFrom;
      const matchesTo = !filters.dateTo || createdDate <= filters.dateTo;

      return matchesQuery && matchesState && matchesCompany && matchesFrom && matchesTo;
    });
  }, [filters, leads]);

  const customerStats = useMemo(() => buildCustomerStats(filteredLeads), [filteredLeads]);
  const hasFilters = Object.values(filters).some(Boolean);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextLeads, nextStats, nextCompanies] = await Promise.all([
        fetchLeads(),
        fetchLeadStats(),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);
      setLeads(nextLeads);
      setStats({ ...emptyStats, ...nextStats });
      setCompanies(nextCompanies);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [canSelectCompany]);

  function openCreateModal() {
    setEditingLead(null);
    setIsFormOpen(true);
  }

  function closeFormModal() {
    setEditingLead(null);
    setIsFormOpen(false);
  }

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingLead) {
        await updateLead(editingLead.id, payload);
      } else {
        await createLead(payload);
      }

      closeFormModal();
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(lead) {
    if (!lead) {
      return;
    }

    try {
      setError('');
      await deleteLead(lead.id);
      setPendingDelete(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function handleStageChange(lead, nextState) {
    try {
      setError('');
      await updateLead(lead.id, {
        empresa_id: lead.empresa_id,
        nombre_cliente: lead.nombre_cliente,
        telefono: lead.telefono,
        interes: lead.interes,
        estado: nextState,
        notas: lead.notas ?? ''
      });
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <div className="resource-page crm-page customer-page">
      <header className="customer-page-header">
        <div>
          <span className="customer-header-icon">
            <UsersRound size={22} aria-hidden="true" />
          </span>
          <div>
            <h1>Clientes</h1>
            <p>Administra todos los clientes registrados de forma sencilla.</p>
          </div>
        </div>
        <button className="primary-button customer-new-button" onClick={openCreateModal} type="button">
          <Plus size={18} aria-hidden="true" />
          Nuevo Cliente
        </button>
      </header>

      {error ? (
        <div className="customer-error-shell">
          <ErrorState message={error} onRetry={loadData} />
        </div>
      ) : null}

      <LeadStats stats={{ ...stats, ...customerStats }} />

      <section className="customer-workspace" aria-label="Clientes registrados">
        <div className="customer-toolbar">
          <label className="customer-search" htmlFor="customer-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="customer-search"
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar por nombre, telefono, empresa o interes"
              type="search"
              value={filters.query}
            />
          </label>

          <div className="customer-filter-field">
            <label htmlFor="customer-status">Estado</label>
            <select
              id="customer-status"
              onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
              value={filters.estado}
            >
              <option value="">Todos</option>
              {CRM_STATES.map((state) => (
                <option key={state} value={state}>{stateLabels[state]}</option>
              ))}
            </select>
          </div>

          <div className="customer-filter-field">
            <label htmlFor="customer-company">Empresa</label>
            <select
              id="customer-company"
              onChange={(event) => setFilters((current) => ({ ...current, empresa: event.target.value }))}
              value={filters.empresa}
            >
              <option value="">Todas</option>
              {companyOptions.map((company) => <option key={company} value={company}>{company}</option>)}
            </select>
          </div>

          <div className="customer-date-range">
            <span>
              <CalendarDays size={16} aria-hidden="true" />
              Fecha
            </span>
            <input
              aria-label="Fecha desde"
              onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
              type="date"
              value={filters.dateFrom}
            />
            <input
              aria-label="Fecha hasta"
              onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
              type="date"
              value={filters.dateTo}
            />
          </div>

          <button
            className="secondary-button customer-clear-button"
            disabled={!hasFilters}
            onClick={() => setFilters(initialFilters)}
            type="button"
          >
            <FilterX size={17} aria-hidden="true" />
            Limpiar
          </button>
        </div>

        <LeadTable
          isLoading={isLoading}
          leads={filteredLeads}
          onCreate={openCreateModal}
          onDelete={setPendingDelete}
          onEdit={(lead) => {
            setEditingLead(lead);
            setIsFormOpen(true);
          }}
          onStageChange={handleStageChange}
          onView={setSelectedLead}
        />
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide customer-form-modal" role="dialog" aria-modal="true" aria-labelledby="lead-form-title">
            <button
              className="modal-close icon-button"
              onClick={closeFormModal}
              type="button"
              aria-label="Cerrar formulario"
            >
              x
            </button>
            <div className="catalog-modal-header">
              <span>
                <UserRound size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Cliente</p>
                <h2 id="lead-form-title">{editingLead ? 'Editar cliente' : 'Nuevo cliente'}</h2>
                <p>Registra datos de contacto, empresa, estado y notas internas.</p>
              </div>
            </div>
            <LeadForm
              canSelectCompany={canSelectCompany}
              companies={companies}
              isSaving={isSaving}
              lead={editingLead}
              onCancel={closeFormModal}
              onSubmit={handleSubmit}
            />
          </article>
        </div>
      ) : null}

      {selectedLead ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide customer-detail-modal" role="dialog" aria-modal="true" aria-labelledby="lead-detail-title">
            <button className="modal-close icon-button" onClick={() => setSelectedLead(null)} type="button" aria-label="Cerrar detalle">
              x
            </button>
            <div className="catalog-modal-header">
              <span>
                <UserRound size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Cliente</p>
                <h2 id="lead-detail-title">{selectedLead.nombre_cliente}</h2>
                <p>{selectedLead.interes || 'Sin interes registrado'}</p>
              </div>
            </div>

            <div className="customer-detail-content">
              <div className="customer-detail-meta-row">
                <LeadStageBadge state={normalizeLeadState(selectedLead.estado)} />
                <span>Ultima actividad: {formatDateTime(selectedLead.fecha_actualizacion ?? selectedLead.fecha_creacion)}</span>
              </div>

              <div className="customer-detail-columns">
                <section className="customer-detail-section" aria-label="Informacion del cliente">
                  <h3>Informacion</h3>
                  <dl className="customer-detail-grid">
                    <div>
                      <dt><Phone size={15} aria-hidden="true" /> Telefono</dt>
                      <dd>{selectedLead.telefono ?? '-'}</dd>
                    </div>
                    <div>
                      <dt><Mail size={15} aria-hidden="true" /> Correo</dt>
                      <dd>{customerEmail(selectedLead) || '-'}</dd>
                    </div>
                    <div>
                      <dt><Building2 size={15} aria-hidden="true" /> Empresa</dt>
                      <dd>{selectedLead.empresa_nombre ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Responsable</dt>
                      <dd>{leadResponsible(selectedLead) || '-'}</dd>
                    </div>
                  </dl>

                  <section className="customer-notes-panel">
                    <h3>Notas</h3>
                    <p>{selectedLead.notas || 'Sin notas internas.'}</p>
                  </section>
                </section>

                <section className="customer-timeline-panel" aria-label="Actividad del cliente">
                  <h3>Actividad</h3>
                  {buildTimeline(selectedLead).map((event, index) => (
                    <article className="customer-timeline-item" key={`${event.label}-${index}`}>
                      <span />
                      <div>
                        <strong>{event.label}</strong>
                        <small>{formatDateTime(event.at)}</small>
                        {event.detail ? <p>{event.detail}</p> : null}
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            </div>

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setSelectedLead(null)} type="button">
                Cerrar
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setEditingLead(selectedLead);
                  setIsFormOpen(true);
                  setSelectedLead(null);
                }}
                type="button"
              >
                Editar cliente
              </button>
            </div>
          </article>
        </div>
      ) : null}

      <ConfirmModal
        destructive
        confirmLabel="Eliminar"
        description={`Se eliminara el cliente ${pendingDelete?.nombre_cliente ?? 'seleccionado'}.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => handleDelete(pendingDelete)}
        open={Boolean(pendingDelete)}
        title="Eliminar cliente"
      />
    </div>
  );
}
