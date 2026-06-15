import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarDays,
  Flame,
  Grid2X2,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  TrendingUp,
  UsersRound
} from 'lucide-react';
import { ConfirmModal, ErrorState, StatusBadge } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import { createLead, deleteLead, fetchLeads, fetchLeadStats, updateLead } from './leadsApi.js';
import { LeadForm } from './LeadForm.jsx';
import { LeadStats } from './LeadStats.jsx';
import { CRM_STATES, getLeadPriority, normalizeLeadState, stateLabels, LeadTable } from './LeadTable.jsx';

const emptyStats = {
  total: 0,
  nuevo: 0,
  contactado: 0,
  cotizado: 0,
  ganado: 0,
  perdido: 0
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
}

function leadOrigin(lead) {
  return lead.origen ?? 'Panel';
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(0)}%`;
}

function buildCommercialSnapshot(leads) {
  const activeLeads = leads.filter((lead) => !['GANADO', 'PERDIDO'].includes(normalizeLeadState(lead.estado)));
  const wonLeads = leads.filter((lead) => normalizeLeadState(lead.estado) === 'GANADO').length;
  const quotedLeads = leads.filter((lead) => normalizeLeadState(lead.estado) === 'COTIZADO').length;
  const hotLeads = leads.filter((lead) => ['CRITICA', 'ALTA'].includes(lead.prioridad) || Number(lead.score ?? 0) >= 65);
  const totalScore = leads.reduce((total, lead) => total + Number(lead.score ?? 0), 0);

  return {
    activeLeads: activeLeads.length,
    averageScore: leads.length ? Math.round(totalScore / leads.length) : 0,
    conversionRate: leads.length ? (wonLeads / leads.length) * 100 : 0,
    hotLeads: hotLeads.length,
    quotedLeads
  };
}

function buildTimeline(lead) {
  if (!lead) {
    return [];
  }

  return [
    { label: 'Lead creado', at: lead.fecha_creacion, detail: lead.interes },
    lead.fecha_actualizacion && lead.fecha_actualizacion !== lead.fecha_creacion
      ? { label: 'Ultima actualizacion', at: lead.fecha_actualizacion, detail: stateLabels[normalizeLeadState(lead.estado)] }
      : null
  ].filter(Boolean);
}

export function LeadsManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [companies, setCompanies] = useState([]);
  const [editingLead, setEditingLead] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', estado: '', origen: '', query: '' });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [leads, setLeads] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [stats, setStats] = useState(emptyStats);
  const [viewMode, setViewMode] = useState('kanban');

  const filteredLeads = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return leads.filter((lead) => {
      const createdDate = lead.fecha_creacion ? new Date(lead.fecha_creacion).toISOString().slice(0, 10) : '';
      const matchesQuery =
        !query ||
        lead.nombre_cliente?.toLowerCase().includes(query) ||
        lead.telefono?.toLowerCase().includes(query) ||
        lead.interes?.toLowerCase().includes(query);
      const matchesState = !filters.estado || normalizeLeadState(lead.estado) === filters.estado;
      const matchesOrigin = !filters.origen || leadOrigin(lead) === filters.origen;
      const matchesFrom = !filters.dateFrom || createdDate >= filters.dateFrom;
      const matchesTo = !filters.dateTo || createdDate <= filters.dateTo;

      return matchesQuery && matchesState && matchesOrigin && matchesFrom && matchesTo;
    });
  }, [filters, leads]);

  const origins = useMemo(() => Array.from(new Set(leads.map(leadOrigin))), [leads]);
  const commercialSnapshot = useMemo(() => buildCommercialSnapshot(filteredLeads), [filteredLeads]);
  const priorityLeads = useMemo(
    () => [...filteredLeads]
      .sort((first, second) => Number(second.score ?? 0) - Number(first.score ?? 0))
      .slice(0, 4),
    [filteredLeads]
  );

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

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingLead) {
        await updateLead(editingLead.id, payload);
      } else {
        await createLead(payload);
      }

      setEditingLead(null);
      setIsFormOpen(false);
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
    <div className="resource-page crm-page">
      <div className="crm-unified-header">
        <div>
          <span className="crm-header-icon">
            <UsersRound size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Mini CRM</p>
            <h1>Leads</h1>
            <p>Gestiona prospectos, seguimiento comercial y oportunidades generadas por el bot.</p>
          </div>
        </div>
        <div>
          <button
            className="primary-button"
            onClick={() => {
              setEditingLead(null);
              setIsFormOpen(true);
            }}
            type="button"
          >
            <Plus size={18} aria-hidden="true" />
            Nuevo lead
          </button>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}

      <LeadStats stats={stats} />

      <section className="crm-command-center" aria-label="Resumen comercial visual">
        <article>
          <span><Flame size={18} aria-hidden="true" /></span>
          <div>
            <strong>{commercialSnapshot.hotLeads}</strong>
            <small>oportunidades calientes</small>
          </div>
        </article>
        <article>
          <span><Activity size={18} aria-hidden="true" /></span>
          <div>
            <strong>{commercialSnapshot.activeLeads}</strong>
            <small>leads activos</small>
          </div>
        </article>
        <article>
          <span><TrendingUp size={18} aria-hidden="true" /></span>
          <div>
            <strong>{formatPercent(commercialSnapshot.conversionRate)}</strong>
            <small>conversion visible</small>
          </div>
        </article>
        <article>
          <span><UsersRound size={18} aria-hidden="true" /></span>
          <div>
            <strong>{commercialSnapshot.averageScore}</strong>
            <small>score promedio</small>
          </div>
        </article>
      </section>

      <section className="crm-priority-strip" aria-label="Leads prioritarios">
        <div>
          <p className="eyebrow">Seguimiento prioritario</p>
          <h2>Atiende primero los leads con mayor probabilidad</h2>
        </div>
        <div>
          {priorityLeads.length ? priorityLeads.map((lead) => (
            <button className="crm-priority-chip" key={lead.id} onClick={() => setSelectedLead(lead)} type="button">
              <span>{lead.score ?? 0}</span>
              <strong>{lead.nombre_cliente}</strong>
              <small>{stateLabels[normalizeLeadState(lead.estado)]}</small>
            </button>
          )) : (
            <span className="crm-priority-empty">Sin leads para priorizar</span>
          )}
        </div>
      </section>

      <section className="panel-section crm-panel">
        <div className="crm-toolbar">
          <label className="product-search" htmlFor="lead-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="lead-search"
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar cliente, telefono o interes"
              type="search"
              value={filters.query}
            />
          </label>

          <div className="crm-filter-group">
            <SlidersHorizontal size={18} aria-hidden="true" />
            <select
              aria-label="Filtrar por estado"
              onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
              value={filters.estado}
            >
              <option value="">Todos los estados</option>
              {CRM_STATES.map((state) => (
                <option key={state} value={state}>{stateLabels[state]}</option>
              ))}
            </select>
            <select
              aria-label="Filtrar por origen"
              onChange={(event) => setFilters((current) => ({ ...current, origen: event.target.value }))}
              value={filters.origen}
            >
              <option value="">Todos los origenes</option>
              {origins.map((origin) => <option key={origin} value={origin}>{origin}</option>)}
            </select>
          </div>

          <div className="crm-date-filters">
            <CalendarDays size={18} aria-hidden="true" />
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

          <div className="view-toggle">
            <button className={viewMode === 'kanban' ? 'active' : ''} onClick={() => setViewMode('kanban')} type="button">
              <Grid2X2 size={17} aria-hidden="true" />
              Kanban
            </button>
            <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')} type="button">
              <List size={17} aria-hidden="true" />
              Tabla
            </button>
          </div>
        </div>

        <LeadTable
          isLoading={isLoading}
          leads={filteredLeads}
          onDelete={setPendingDelete}
          onEdit={(lead) => {
            setEditingLead(lead);
            setIsFormOpen(true);
          }}
          onStageChange={handleStageChange}
          onView={setSelectedLead}
          viewMode={viewMode}
        />
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide" role="dialog" aria-modal="true" aria-labelledby="lead-form-title">
            <button
              className="modal-close icon-button"
              onClick={() => {
                setEditingLead(null);
                setIsFormOpen(false);
              }}
              type="button"
              aria-label="Cerrar formulario"
            >
              x
            </button>
            <div className="catalog-modal-header">
              <span>
                <Plus size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Lead</p>
                <h2 id="lead-form-title">{editingLead ? 'Editar lead' : 'Nuevo lead'}</h2>
                <p>Registra datos de contacto, estado y notas internas.</p>
              </div>
            </div>
            <LeadForm
              canSelectCompany={canSelectCompany}
              companies={companies}
              isSaving={isSaving}
              lead={editingLead}
              onCancel={() => {
                setEditingLead(null);
                setIsFormOpen(false);
              }}
              onSubmit={handleSubmit}
            />
          </article>
        </div>
      ) : null}

      {selectedLead ? (
        <div className="modal-backdrop" role="presentation">
          <article className="lead-detail-modal" role="dialog" aria-modal="true" aria-labelledby="lead-detail-title">
            <button className="modal-close icon-button" onClick={() => setSelectedLead(null)} type="button" aria-label="Cerrar detalle">
              x
            </button>
            <div className="lead-detail-header">
              <div>
                <StatusBadge status={normalizeLeadState(selectedLead.estado)}>
                  {stateLabels[normalizeLeadState(selectedLead.estado)]}
                </StatusBadge>
                <h2 id="lead-detail-title">{selectedLead.nombre_cliente}</h2>
                <a href={`tel:${selectedLead.telefono}`}>{selectedLead.telefono}</a>
              </div>
              <span className={`priority-badge ${getLeadPriority(selectedLead).tone}`}>{getLeadPriority(selectedLead).label}</span>
            </div>
            <dl className="lead-detail-grid">
              <div>
                <dt>Score</dt>
                <dd>{selectedLead.score ?? 0}</dd>
              </div>
              <div>
                <dt>Interes</dt>
                <dd>{selectedLead.interes}</dd>
              </div>
              <div>
                <dt>Origen</dt>
                <dd>{leadOrigin(selectedLead)}</dd>
              </div>
              <div>
                <dt>Empresa</dt>
                <dd>{selectedLead.empresa_nombre ?? '-'}</dd>
              </div>
            </dl>
            {selectedLead.score_detalle_json?.length ? (
              <section className="lead-score-panel">
                <h3>Factores del score</h3>
                <div>
                  {selectedLead.score_detalle_json.map((factor, index) => (
                    <span key={`${factor.factor}-${index}`}>
                      {factor.factor} {Number(factor.puntos) > 0 ? '+' : ''}{factor.puntos}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
            <section className="lead-notes-panel">
              <h3>Notas internas</h3>
              <p>{selectedLead.notas || 'Sin notas internas.'}</p>
            </section>
            <section className="lead-timeline-panel">
              <h3>Timeline</h3>
              {buildTimeline(selectedLead).map((event, index) => (
                <article className="lead-timeline-item" key={`${event.label}-${index}`}>
                  <span />
                  <div>
                    <strong>{event.label}</strong>
                    <small>{formatDateTime(event.at)}</small>
                    {event.detail ? <p>{event.detail}</p> : null}
                  </div>
                </article>
              ))}
            </section>
          </article>
        </div>
      ) : null}

      <ConfirmModal
        destructive
        confirmLabel="Eliminar"
        description={`Se eliminara el lead de ${pendingDelete?.nombre_cliente ?? 'este cliente'}.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => handleDelete(pendingDelete)}
        open={Boolean(pendingDelete)}
        title="Eliminar lead"
      />
    </div>
  );
}
