import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  MessageCircle,
  MessageSquarePlus,
  Phone,
  Search,
  SlidersHorizontal
} from 'lucide-react';
import { ConfirmModal, EmptyState, ErrorState, StatusBadge } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  createConversation,
  deleteConversation,
  fetchConversations,
  updateConversation
} from './conversationsApi.js';
import { ConversationForm } from './ConversationForm.jsx';

const initialFilters = {
  canal: '',
  estado: '',
  fecha: '',
  query: '',
  empresa_id: ''
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '-';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : '-';
}

function getConversationChannel(conversation) {
  return conversation.canal ?? conversation.origen ?? 'WHATSAPP';
}

function getThreadStatus(messages) {
  const latest = messages[0];
  return latest?.respuesta ? 'CERRADA' : 'ABIERTA';
}

function buildThreads(conversations) {
  const groups = new Map();

  conversations.forEach((conversation) => {
    const key = conversation.telefono_cliente;
    const current = groups.get(key) ?? [];
    current.push(conversation);
    groups.set(key, current);
  });

  return Array.from(groups, ([phone, messages]) => {
    const sortedMessages = [...messages].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const latest = sortedMessages[0];

    return {
      phone,
      company: latest?.empresa_nombre,
      channel: getConversationChannel(latest),
      status: getThreadStatus(sortedMessages),
      latest,
      messages: sortedMessages
    };
  }).sort((a, b) => new Date(b.latest?.fecha ?? 0) - new Date(a.latest?.fecha ?? 0));
}

function ChannelBadge({ channel }) {
  return <span className={`channel-badge ${String(channel).toLowerCase()}`}>{channel}</span>;
}

function ConversationList({ selectedPhone, threads, onSelect }) {
  if (!threads.length) {
    return (
      <EmptyState
        title="Sin conversaciones"
        description="Cuando lleguen mensajes o registres interacciones, apareceran aqui."
      />
    );
  }

  return (
    <div className="inbox-thread-list">
      {threads.map((thread) => (
        <button
          className={selectedPhone === thread.phone ? 'inbox-thread active' : 'inbox-thread'}
          key={thread.phone}
          onClick={() => onSelect(thread.phone)}
          type="button"
        >
          <span className="inbox-avatar">
            <Phone size={17} aria-hidden="true" />
          </span>
          <div>
            <strong>{thread.phone}</strong>
            <p>{thread.latest?.mensaje ?? 'Sin mensaje'}</p>
            <small>{thread.company ?? 'Empresa'} · {formatDate(thread.latest?.fecha)}</small>
          </div>
          <div className="inbox-thread-badges">
            <ChannelBadge channel={thread.channel} />
            <StatusBadge status={thread.status}>{thread.status}</StatusBadge>
          </div>
        </button>
      ))}
    </div>
  );
}

function ConversationPanel({ onDelete, onEdit, thread }) {
  if (!thread) {
    return (
      <div className="inbox-empty-panel">
        <MessageCircle size={42} aria-hidden="true" />
        <strong>Selecciona una conversacion</strong>
        <p>El historial de mensajes aparecera aqui para revisar contexto y seguimiento.</p>
      </div>
    );
  }

  return (
    <section className="inbox-chat-panel">
      <header className="inbox-chat-header">
        <div>
          <strong>{thread.phone}</strong>
          <span>{thread.company ?? 'Empresa'} · Ultimo mensaje {formatDate(thread.latest?.fecha)}</span>
        </div>
        <div>
          <ChannelBadge channel={thread.channel} />
          <StatusBadge status={thread.status}>{thread.status}</StatusBadge>
        </div>
      </header>

      <div className="inbox-message-list">
        {[...thread.messages].reverse().map((message) => (
          <article className="inbox-message-group" key={message.id}>
            <div className="chat-bubble customer">
              <span>Cliente · {formatTime(message.fecha)}</span>
              <p>{message.mensaje}</p>
            </div>
            {message.respuesta ? (
              <div className="chat-bubble agent">
                <span>Respuesta</span>
                <p>{message.respuesta}</p>
              </div>
            ) : null}
            <div className="inbox-message-actions">
              <button className="secondary-button" onClick={() => onEdit(message)} type="button">
                Editar
              </button>
              <button className="secondary-button" onClick={() => onDelete(message)} type="button">
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ConversationsManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [companies, setCompanies] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [editingConversation, setEditingConversation] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [selectedPhone, setSelectedPhone] = useState('');

  async function loadData(nextFilters = filters) {
    try {
      setIsLoading(true);
      setError('');
      const requestFilters = {
        telefono_cliente: nextFilters.query || undefined,
        empresa_id: canSelectCompany && nextFilters.empresa_id ? nextFilters.empresa_id : undefined
      };
      const [nextConversations, nextCompanies] = await Promise.all([
        fetchConversations(requestFilters),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);
      setConversations(nextConversations);
      setCompanies(nextCompanies);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData(initialFilters);
  }, [canSelectCompany]);

  const filteredConversations = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return conversations.filter((conversation) => {
      const channel = getConversationChannel(conversation);
      const status = conversation.respuesta ? 'CERRADA' : 'ABIERTA';
      const date = conversation.fecha ? new Date(conversation.fecha).toISOString().slice(0, 10) : '';
      const matchesQuery =
        !query ||
        conversation.telefono_cliente?.toLowerCase().includes(query) ||
        conversation.empresa_nombre?.toLowerCase().includes(query);
      const matchesChannel = !filters.canal || channel === filters.canal;
      const matchesStatus = !filters.estado || status === filters.estado;
      const matchesDate = !filters.fecha || date === filters.fecha;

      return matchesQuery && matchesChannel && matchesStatus && matchesDate;
    });
  }, [conversations, filters]);

  const threads = useMemo(() => buildThreads(filteredConversations), [filteredConversations]);
  const selectedThread = threads.find((thread) => thread.phone === selectedPhone) ?? threads[0] ?? null;

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingConversation) {
        await updateConversation(editingConversation.id, payload);
      } else {
        await createConversation(payload);
      }

      setEditingConversation(null);
      setIsFormOpen(false);
      await loadData(filters);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(conversation) {
    if (!conversation) {
      return;
    }

    try {
      setError('');
      await deleteConversation(conversation.id);
      setPendingDelete(null);
      await loadData(filters);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <div className="resource-page inbox-page">
      <div className="inbox-unified-header">
        <div>
          <span className="inbox-header-icon">
            <MessageCircle size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Atencion al cliente</p>
            <h1>Conversaciones</h1>
            <p>Gestiona mensajes, respuestas y seguimiento desde una bandeja empresarial.</p>
          </div>
        </div>
        <div>
          <div className="inbox-header-metric">
            <strong>{threads.length}</strong>
            <span>conversaciones</span>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setEditingConversation(null);
              setIsFormOpen(true);
            }}
            type="button"
          >
            <MessageSquarePlus size={18} aria-hidden="true" />
            Nueva nota
          </button>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={() => loadData(filters)} /> : null}

      <section className="panel-section inbox-panel">
        <div className="inbox-toolbar">
          <label className="product-search" htmlFor="conversation-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="conversation-search"
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar telefono o empresa"
              type="search"
              value={filters.query}
            />
          </label>

          <div className="crm-filter-group">
            <SlidersHorizontal size={18} aria-hidden="true" />
            <select
              aria-label="Canal"
              onChange={(event) => setFilters((current) => ({ ...current, canal: event.target.value }))}
              value={filters.canal}
            >
              <option value="">Todos los canales</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="MANUAL">Manual</option>
            </select>
            <select
              aria-label="Estado"
              onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
              value={filters.estado}
            >
              <option value="">Todos los estados</option>
              <option value="ABIERTA">Abierta</option>
              <option value="CERRADA">Cerrada</option>
            </select>
          </div>

          <div className="crm-date-filters">
            <CalendarDays size={18} aria-hidden="true" />
            <input
              aria-label="Fecha"
              onChange={(event) => setFilters((current) => ({ ...current, fecha: event.target.value }))}
              type="date"
              value={filters.fecha}
            />
          </div>

          {canSelectCompany ? (
            <select
              className="inbox-company-filter"
              aria-label="Empresa"
              onChange={(event) => setFilters((current) => ({ ...current, empresa_id: event.target.value }))}
              value={filters.empresa_id}
            >
              <option value="">Todas las empresas</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nombre}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="inbox-layout">
          <aside className="inbox-sidebar">
            {isLoading ? (
              <EmptyState title="Cargando conversaciones" description="Estamos preparando la bandeja." />
            ) : (
              <ConversationList selectedPhone={selectedThread?.phone} threads={threads} onSelect={setSelectedPhone} />
            )}
          </aside>

          <ConversationPanel
            onDelete={setPendingDelete}
            onEdit={(conversation) => {
              setEditingConversation(conversation);
              setIsFormOpen(true);
            }}
            thread={selectedThread}
          />
        </div>
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide" role="dialog" aria-modal="true" aria-labelledby="conversation-form-title">
            <button
              className="modal-close icon-button"
              onClick={() => {
                setEditingConversation(null);
                setIsFormOpen(false);
              }}
              type="button"
              aria-label="Cerrar formulario"
            >
              x
            </button>
            <div className="catalog-modal-header">
              <span>
                <MessageSquarePlus size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Conversacion</p>
                <h2 id="conversation-form-title">{editingConversation ? 'Editar interaccion' : 'Nueva nota manual'}</h2>
                <p>Registra mensajes relevantes sin modificar la logica de WhatsApp.</p>
              </div>
            </div>
            <ConversationForm
              canSelectCompany={canSelectCompany}
              companies={companies}
              conversation={editingConversation}
              isSaving={isSaving}
              onCancel={() => {
                setEditingConversation(null);
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
        description={`Se eliminara la conversacion ${pendingDelete?.id ?? ''}.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => handleDelete(pendingDelete)}
        open={Boolean(pendingDelete)}
        title="Eliminar conversacion"
      />
    </div>
  );
}
