import { ArrowRight, Eye, Pencil, Phone, Star, Trash2 } from 'lucide-react';
import { DataTable, EmptyState, StatusBadge } from '../../components/ui/index.js';

export const CRM_STATES = ['NUEVO', 'CONTACTADO', 'COTIZADO', 'GANADO', 'PERDIDO'];

export const stateLabels = {
  NUEVO: 'Nuevo',
  EN_PROCESO: 'Contactado',
  CONTACTADO: 'Contactado',
  COTIZADO: 'Cotizado',
  GANADO: 'Ganado',
  PERDIDO: 'Perdido'
};

export function normalizeLeadState(state) {
  return state === 'EN_PROCESO' ? 'CONTACTADO' : state ?? 'NUEVO';
}

export function getLeadPriority(lead) {
  if (lead.prioridad) {
    const priorityMap = {
      CRITICA: { label: 'Critica', tone: 'danger' },
      ALTA: { label: 'Alta', tone: 'danger' },
      MEDIA: { label: 'Media', tone: 'warning' },
      BAJA: { label: 'Baja', tone: 'info' }
    };

    return priorityMap[lead.prioridad] ?? priorityMap.BAJA;
  }

  const state = normalizeLeadState(lead.estado);
  const createdAt = lead.fecha_creacion ? new Date(lead.fecha_creacion) : null;
  const ageHours = createdAt ? (Date.now() - createdAt.getTime()) / 36e5 : 999;

  if (state === 'NUEVO' && ageHours <= 24) {
    return { label: 'Alta', tone: 'danger' };
  }

  if (state === 'COTIZADO') {
    return { label: 'Media', tone: 'warning' };
  }

  return { label: 'Normal', tone: 'info' };
}

function getNextState(state) {
  const index = CRM_STATES.indexOf(normalizeLeadState(state));

  if (index < 0 || index >= CRM_STATES.length - 2) {
    return null;
  }

  return CRM_STATES[index + 1];
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '-';
}

function LeadActions({ lead, onDelete, onEdit, onView }) {
  return (
    <div className="table-actions lead-actions">
      <button aria-label="Ver lead" onClick={() => onView(lead)} type="button">
        <Eye size={16} aria-hidden="true" />
      </button>
      <button aria-label="Editar lead" onClick={() => onEdit(lead)} type="button">
        <Pencil size={16} aria-hidden="true" />
      </button>
      <button aria-label="Eliminar lead" onClick={() => onDelete(lead)} type="button">
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function PhoneLink({ phone }) {
  const clean = String(phone ?? '').replace(/\s/g, '');

  return phone ? (
    <a className="phone-link" href={`tel:${clean}`}>
      <Phone size={15} aria-hidden="true" />
      {phone}
    </a>
  ) : (
    '-'
  );
}

function LeadScore({ lead }) {
  const score = Number(lead.score ?? 0);

  return (
    <div className="lead-score-meter" aria-label={`Score ${score}`}>
      <span style={{ '--score': `${score}%` }} />
      <strong>{score}</strong>
    </div>
  );
}

function LeadCard({ lead, onDelete, onEdit, onStageChange, onView }) {
  const state = normalizeLeadState(lead.estado);
  const priority = getLeadPriority(lead);
  const nextState = getNextState(state);

  return (
    <article className="crm-lead-card">
      <div className="crm-lead-card-header">
        <div>
          <strong>{lead.nombre_cliente}</strong>
          <span>{lead.interes}</span>
        </div>
        <StatusBadge status={state}>{stateLabels[state]}</StatusBadge>
      </div>
      <div className="crm-lead-score-row">
        <LeadScore lead={lead} />
        <span className={`priority-badge ${priority.tone}`}>
          <Star size={13} aria-hidden="true" />
          {priority.label}
        </span>
      </div>
      <PhoneLink phone={lead.telefono} />
      <div className="crm-lead-meta">
        <span>{lead.origen ?? 'Panel'}</span>
        <span>{formatDate(lead.fecha_creacion)}</span>
        {lead.empresa_nombre ? <span>{lead.empresa_nombre}</span> : null}
      </div>
      {lead.notas ? <p>{lead.notas}</p> : null}
      {nextState ? (
        <button className="stage-next-button" onClick={() => onStageChange(lead, nextState)} type="button">
          Mover a {stateLabels[nextState]}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      ) : null}
      <LeadActions lead={lead} onDelete={onDelete} onEdit={onEdit} onView={onView} />
    </article>
  );
}

export function LeadKanban({ leads, onDelete, onEdit, onStageChange, onView }) {
  if (!leads.length) {
    return (
      <EmptyState
        title="Sin leads en el pipeline"
        description="Los prospectos apareceran aqui cuando entren desde el bot o el panel."
      />
    );
  }

  return (
    <div className="crm-kanban">
      {CRM_STATES.map((state) => {
        const columnLeads = leads.filter((lead) => normalizeLeadState(lead.estado) === state);
        const averageScore = columnLeads.length
          ? Math.round(columnLeads.reduce((total, lead) => total + Number(lead.score ?? 0), 0) / columnLeads.length)
          : 0;

        return (
          <section className="crm-kanban-column" key={state}>
            <header>
              <div>
                <span>{stateLabels[state]}</span>
                <small>Score prom. {averageScore}</small>
              </div>
              <strong>{columnLeads.length}</strong>
            </header>
            <div>
              {columnLeads.length ? (
                columnLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    onStageChange={onStageChange}
                    onView={onView}
                  />
                ))
              ) : (
                <div className="crm-kanban-empty">Sin leads</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function LeadTable({ isLoading, leads, onDelete, onEdit, onStageChange, onView, viewMode = 'table' }) {
  const columns = [
    {
      key: 'cliente',
      header: 'Cliente',
      render: (lead) => (
        <div className="lead-client-cell">
          <strong>{lead.nombre_cliente}</strong>
          <span>{lead.interes}</span>
        </div>
      )
    },
    { key: 'telefono', header: 'Telefono', render: (lead) => <PhoneLink phone={lead.telefono} /> },
    {
      key: 'estado',
      header: 'Estado',
      render: (lead) => {
        const state = normalizeLeadState(lead.estado);
        return <StatusBadge status={state}>{stateLabels[state]}</StatusBadge>;
      }
    },
    {
      key: 'prioridad',
      header: 'Prioridad',
      render: (lead) => {
        const priority = getLeadPriority(lead);
        return <span className={`priority-badge ${priority.tone}`}><Star size={13} aria-hidden="true" />{priority.label}</span>;
      }
    },
    { key: 'score', header: 'Score', render: (lead) => <LeadScore lead={lead} /> },
    { key: 'origen', header: 'Origen', render: (lead) => lead.origen ?? 'Panel' },
    { key: 'fecha', header: 'Fecha', render: (lead) => formatDate(lead.fecha_creacion) },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (lead) => <LeadActions lead={lead} onDelete={onDelete} onEdit={onEdit} onView={onView} />
    }
  ];

  if (viewMode === 'kanban' && !isLoading) {
    return <LeadKanban leads={leads} onDelete={onDelete} onEdit={onEdit} onStageChange={onStageChange} onView={onView} />;
  }

  return (
    <DataTable
      className="crm-leads-table"
      columns={columns}
      data={leads}
      emptyDescription="Los interesados creados por el bot y el panel apareceran aqui."
      emptyTitle="No hay leads registrados"
      isLoading={isLoading}
      loadingMessage="Cargando leads..."
    />
  );
}
