import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Trash2
} from 'lucide-react';
import { EmptyState } from '../../components/ui/index.js';

export const CRM_STATES = ['NUEVO', 'CONTACTADO', 'COTIZADO', 'GANADO', 'PERDIDO'];

export const stateLabels = {
  NUEVO: 'Pendiente',
  EN_PROCESO: 'Activo',
  CONTACTADO: 'Activo',
  COTIZADO: 'Activo',
  GANADO: 'Activo',
  PERDIDO: 'Inactivo',
  SUSPENDIDO: 'Suspendido'
};

const stageLabels = {
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

function formatDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('es-MX', options);
}

function customerEmail(lead) {
  return lead.correo ?? lead.email ?? lead.email_cliente ?? '';
}

function leadResponsible(lead) {
  return lead.responsable_nombre ?? lead.responsable ?? lead.usuario_nombre ?? lead.assigned_to_name ?? '';
}

function getInitials(name) {
  const cleanName = String(name || 'Cliente').trim();
  const parts = cleanName.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'CL';
}

export function LeadStageBadge({ state }) {
  const normalizedState = normalizeLeadState(state);
  const label = stateLabels[normalizedState] ?? stateLabels.NUEVO;

  return <span className={`customer-status-badge ${normalizedState.toLowerCase()}`}>{label}</span>;
}

function IconAction({ children, label, onClick, tone = '' }) {
  return (
    <button
      aria-label={label}
      className={`customer-action-button ${tone}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function LeadActions({ lead, onDelete, onEdit, onView }) {
  return (
    <div className="customer-actions" aria-label={`Acciones para ${lead.nombre_cliente}`}>
      <IconAction label="Ver cliente" onClick={() => onView(lead)} tone="view">
        <Eye size={16} aria-hidden="true" />
      </IconAction>
      <IconAction label="Editar cliente" onClick={() => onEdit(lead)} tone="edit">
        <Pencil size={16} aria-hidden="true" />
      </IconAction>
      <IconAction label="Eliminar cliente" onClick={() => onDelete(lead)} tone="delete">
        <Trash2 size={16} aria-hidden="true" />
      </IconAction>
      <button
        aria-label={`Mas opciones para ${lead.nombre_cliente}`}
        className="customer-more-button"
        onClick={() => onView(lead)}
        title="Mas opciones"
        type="button"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
        <ChevronDown size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function PhoneLink({ phone }) {
  const clean = String(phone ?? '').replace(/\s/g, '');

  return phone ? (
    <a className="customer-contact-link" href={`tel:${clean}`}>
      <Phone size={15} aria-hidden="true" />
      {phone}
    </a>
  ) : (
    <span className="customer-muted-value">Sin telefono</span>
  );
}

function EmailValue({ email }) {
  return email ? (
    <a className="customer-contact-link" href={`mailto:${email}`}>
      <Mail size={15} aria-hidden="true" />
      {email}
    </a>
  ) : (
    <span className="customer-muted-value">Sin correo</span>
  );
}

function CustomerRow({ lead, onDelete, onEdit, onStageChange, onView }) {
  const state = normalizeLeadState(lead.estado);
  const nextState = getNextState(state);
  const email = customerEmail(lead);
  const responsible = leadResponsible(lead);

  return (
    <article className="customer-row-card">
      <button className="customer-avatar" onClick={() => onView(lead)} type="button" aria-label={`Ver ${lead.nombre_cliente}`}>
        {getInitials(lead.nombre_cliente)}
      </button>

      <div className="customer-primary">
        <div className="customer-name-line">
          <button onClick={() => onView(lead)} type="button">{lead.nombre_cliente}</button>
          <LeadStageBadge state={state} />
        </div>
        <p>{lead.interes || 'Sin interes registrado'}</p>
        <div className="customer-contact-grid">
          <EmailValue email={email} />
          <PhoneLink phone={lead.telefono} />
        </div>
      </div>

      <div className="customer-company-block">
        <span>
          <Building2 size={15} aria-hidden="true" />
          Empresa
        </span>
        <strong>{lead.empresa_nombre ?? 'Sin empresa'}</strong>
      </div>

      <div className="customer-date-block">
        <span>
          <CalendarDays size={15} aria-hidden="true" />
          Registro
        </span>
        <strong>{formatDate(lead.fecha_creacion)}</strong>
        <small>Ultima actividad: {formatDate(lead.fecha_actualizacion ?? lead.fecha_creacion, { day: '2-digit', month: 'short' })}</small>
      </div>

      <div className="customer-owner-block">
        <span>Responsable</span>
        <strong>{responsible || 'Sin asignar'}</strong>
        <small>Etapa: {stageLabels[state] ?? state}</small>
      </div>

      <div className="customer-row-actions">
        {nextState ? (
          <button className="customer-stage-button" onClick={() => onStageChange(lead, nextState)} type="button">
            Avanzar
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        ) : null}
        <LeadActions lead={lead} onDelete={onDelete} onEdit={onEdit} onView={onView} />
      </div>
    </article>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function CustomerSkeleton() {
  return (
    <div className="customer-list-skeleton" aria-label="Cargando clientes">
      {Array.from({ length: 6 }).map((_, index) => (
        <article className="customer-row-card skeleton" key={index}>
          <span className="customer-avatar skeleton-piece" />
          <div className="customer-primary">
            <span className="skeleton-line wide" />
            <span className="skeleton-line medium" />
            <span className="skeleton-line short" />
          </div>
          <span className="skeleton-block" />
          <span className="skeleton-block" />
          <span className="skeleton-block" />
          <span className="skeleton-actions" />
        </article>
      ))}
    </div>
  );
}

export function LeadTable({ isLoading, leads, onCreate, onDelete, onEdit, onStageChange, onView }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const totalPages = Math.max(1, Math.ceil(leads.length / pageSize));
  const paginatedLeads = useMemo(() => {
    const start = (page - 1) * pageSize;
    return leads.slice(start, start + pageSize);
  }, [leads, page, pageSize]);
  const pageStart = leads.length ? (page - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(page * pageSize, leads.length);

  useEffect(() => {
    setPage(1);
  }, [leads.length, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (isLoading) {
    return <CustomerSkeleton />;
  }

  if (!leads.length) {
    return (
      <div className="customer-empty-shell">
        <EmptyState
          title="No hay clientes registrados."
          description="Crea tu primer cliente para empezar a guardar contactos, estados y seguimiento comercial."
        />
        {onCreate ? (
          <button className="primary-button" onClick={onCreate} type="button">
            Crear primer cliente
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="customer-table-experience">
      <div className="customer-list" aria-label="Lista de clientes">
        {paginatedLeads.map((lead) => (
          <CustomerRow
            key={lead.id}
            lead={lead}
            onDelete={onDelete}
            onEdit={onEdit}
            onStageChange={onStageChange}
            onView={onView}
          />
        ))}
      </div>

      <nav className="customer-pagination" aria-label="Paginacion de clientes">
        <p>
          Mostrando <strong>{pageStart}-{pageEnd}</strong> de <strong>{leads.length}</strong> clientes
        </p>

        <label htmlFor="customer-page-size">
          Filas por pagina
          <select
            id="customer-page-size"
            onChange={(event) => setPageSize(Number(event.target.value))}
            value={pageSize}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <div className="customer-page-controls">
          <button
            aria-label="Pagina anterior"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <span>Pagina {page} de {totalPages}</span>
          <button
            aria-label="Pagina siguiente"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            type="button"
          >
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      </nav>
    </div>
  );
}
