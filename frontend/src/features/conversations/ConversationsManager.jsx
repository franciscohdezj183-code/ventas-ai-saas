import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  MessageCircle,
  MessageSquarePlus,
  PauseCircle,
  Phone,
  PlayCircle,
  Search,
  Send,
  SlidersHorizontal
} from 'lucide-react';
import { ConfirmModal, EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isSuperAdminRole } from '../../config/permissions.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  closeInboxThread,
  createConversation,
  deleteConversation,
  fetchInboxThread,
  fetchInboxThreads,
  pauseInboxThread,
  resumeInboxThread,
  sendInboxReply,
  updateConversation
} from './conversationsApi.js';
import { ConversationForm } from './ConversationForm.jsx';

const initialFilters = {
  estado: '',
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

const conversationStateLabels = {
  open: 'Abierta',
  bot_active: 'Bot activo',
  requires_human: 'Requiere humano',
  human_active: 'Atencion humana',
  closed: 'Cerrada'
};

const conversationRoleLabels = {
  customer: 'Cliente',
  human: 'Usuario',
  bot: 'IA',
  system: 'Sistema'
};

function getThreadKey(thread) {
  return thread ? `${thread.empresa_id}-${thread.telefono_cliente}` : '';
}

function ThreadList({ selectedThread, threads, onSelect }) {
  if (!threads.length) {
    return <EmptyState title="Sin conversaciones" description="Cuando lleguen mensajes, apareceran aqui." />;
  }

  return (
    <div className="inbox-thread-list">
      {threads.map((thread) => (
        <button
          className={selectedThread?.telefono_cliente === thread.telefono_cliente && selectedThread?.empresa_id === thread.empresa_id ? 'inbox-thread active' : 'inbox-thread'}
          key={getThreadKey(thread)}
          onClick={() => onSelect(thread)}
          type="button"
        >
          <span className="inbox-avatar">
            <Phone size={17} aria-hidden="true" />
          </span>
          <div>
            <strong>{thread.telefono_cliente}</strong>
            <p>{thread.ultimo_mensaje ?? 'Sin mensaje'}</p>
            <small>{thread.empresa_nombre ?? 'Empresa'} - {formatDate(thread.ultima_fecha)}</small>
          </div>
          <div className="inbox-thread-badges">
            <span className="channel-badge whatsapp">WHATSAPP</span>
            <StatusBadge status={thread.estado_inbox}>{conversationStateLabels[thread.estado_inbox] ?? thread.estado_inbox}</StatusBadge>
          </div>
        </button>
      ))}
    </div>
  );
}

function ChatMessage({ message, onDelete, onEdit }) {
  const isHuman = message.tipo_mensaje === 'human';
  const isBot = message.tipo_mensaje === 'bot';
  const isSystem = message.tipo_mensaje === 'system';
  const responseClass = isHuman ? 'chat-bubble human' : isSystem ? 'chat-bubble system' : 'chat-bubble bot';
  const responseLabel = isHuman ? 'Usuario' : isBot ? 'IA' : isSystem ? 'Sistema' : 'IA / usuario';

  return (
    <article className="inbox-message-group">
      <div className="chat-bubble customer">
        <span>Cliente - {formatTime(message.fecha)}</span>
        <p>{message.mensaje}</p>
      </div>
      {message.respuesta ? (
        <div className={responseClass}>
          <span>{responseLabel} - {formatTime(message.fecha)}</span>
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
  );
}

function ChatPanel({
  isSending,
  onDelete,
  onEdit,
  onPause,
  onReply,
  onResume,
  onClose,
  onBack,
  reply,
  setReply,
  thread
}) {
  if (!thread) {
    return (
      <div className="inbox-empty-panel">
        <MessageCircle size={42} aria-hidden="true" />
        <strong>Selecciona una conversacion</strong>
        <p>El historial, estado del bot y controles de atencion apareceran aqui.</p>
      </div>
    );
  }

  return (
    <section className="inbox-chat-panel">
      <header className="inbox-chat-header professional">
        <div className="inbox-chat-contact">
          <button className="icon-button inbox-back-button" onClick={onBack} type="button" aria-label="Volver a conversaciones">
            <ArrowLeft size={17} aria-hidden="true" />
          </button>
          <span className="inbox-avatar">
            <Phone size={17} aria-hidden="true" />
          </span>
          <div>
            <strong>{thread.telefono_cliente}</strong>
            <span>
              Empresa #{thread.empresa_id} - {conversationStateLabels[thread.estado_inbox] ?? thread.estado_inbox}
            </span>
          </div>
        </div>
        <div>
          <StatusBadge status={thread.estado_inbox}>
            {conversationStateLabels[thread.estado_inbox] ?? thread.estado_inbox}
          </StatusBadge>
          {thread.bot_pausado ? (
            <button className="secondary-button" onClick={onResume} type="button">
              <PlayCircle size={17} aria-hidden="true" />
              Reanudar bot
            </button>
          ) : (
            <button className="secondary-button" onClick={onPause} type="button">
              <PauseCircle size={17} aria-hidden="true" />
              Pausar bot
            </button>
          )}
          {thread.estado_inbox !== 'closed' ? (
            <button className="secondary-button" onClick={onClose} type="button">
              Cerrar
            </button>
          ) : null}
        </div>
      </header>

      <div className="inbox-message-list professional">
        {thread.mensajes?.length ? (
          thread.mensajes.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))
        ) : (
          <EmptyState title="Sin mensajes" description="Este cliente aun no tiene historial guardado." />
        )}
      </div>

      <form className="inbox-reply-box" onSubmit={onReply}>
        <label htmlFor="inbox-reply">
          <Send size={18} aria-hidden="true" />
          <textarea
            id="inbox-reply"
            onChange={(event) => setReply(event.target.value)}
            placeholder="Responder manualmente por WhatsApp..."
            rows={2}
            value={reply}
          />
        </label>
        <button className="primary-button" disabled={isSending || !reply.trim()} type="submit">
          <Send size={18} aria-hidden="true" />
          Enviar
        </button>
      </form>
    </section>
  );
}

export function ConversationsManager() {
  const { user } = useAuth();
  const canSelectCompany = isSuperAdminRole(user?.rol);
  const [companies, setCompanies] = useState([]);
  const [editingConversation, setEditingConversation] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [reply, setReply] = useState('');
  const [selectedThreadKey, setSelectedThreadKey] = useState('');
  const [threadDetail, setThreadDetail] = useState(null);
  const [threads, setThreads] = useState([]);

  const selectedThread = useMemo(
    () => threads.find((thread) => getThreadKey(thread) === selectedThreadKey) ?? null,
    [selectedThreadKey, threads]
  );

  async function loadThreads(nextFilters = filters) {
    try {
      setIsLoading(true);
      setError('');
      const [nextThreads, nextCompanies] = await Promise.all([
        fetchInboxThreads({
          query: nextFilters.query || undefined,
          estado: nextFilters.estado || undefined,
          empresa_id: canSelectCompany && nextFilters.empresa_id ? nextFilters.empresa_id : undefined
        }),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);
      setThreads(nextThreads);
      setCompanies(nextCompanies);
      if (selectedThreadKey && !nextThreads.some((thread) => getThreadKey(thread) === selectedThreadKey)) {
        setSelectedThreadKey('');
        setThreadDetail(null);
        setIsChatOpen(false);
      }
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadThreadDetail(thread = selectedThread) {
    if (!thread) {
      setThreadDetail(null);
      return;
    }

    try {
      setError('');
      setThreadDetail(null);
      setThreadDetail(await fetchInboxThread({
        empresaId: thread.empresa_id,
        telefono: thread.telefono_cliente
      }));
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  useEffect(() => {
    loadThreads(initialFilters);
  }, [canSelectCompany]);

  useEffect(() => {
    loadThreadDetail(selectedThread);
  }, [selectedThread?.empresa_id, selectedThread?.telefono_cliente]);

  function updateFilters(nextFilter) {
    const nextFilters = { ...filters, ...nextFilter };
    setFilters(nextFilters);
    loadThreads(nextFilters);
  }

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
      await loadThreads(filters);
      await loadThreadDetail();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(conversation) {
    if (!conversation) return;

    try {
      setError('');
      await deleteConversation(conversation.id);
      setPendingDelete(null);
      await loadThreads(filters);
      await loadThreadDetail();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function handlePause() {
    if (!selectedThread) return;
    setThreadDetail(await pauseInboxThread({ empresaId: selectedThread.empresa_id, telefono: selectedThread.telefono_cliente }));
    await loadThreads(filters);
  }

  async function handleResume() {
    if (!selectedThread) return;
    setThreadDetail(await resumeInboxThread({ empresaId: selectedThread.empresa_id, telefono: selectedThread.telefono_cliente }));
    await loadThreads(filters);
  }

  async function handleClose() {
    if (!selectedThread) return;
    setThreadDetail(await closeInboxThread({ empresaId: selectedThread.empresa_id, telefono: selectedThread.telefono_cliente }));
    await loadThreads(filters);
  }

  async function handleReply(event) {
    event.preventDefault();
    if (!selectedThread || !reply.trim()) return;

    try {
      setIsSending(true);
      setError('');
      setThreadDetail(await sendInboxReply({
        empresaId: selectedThread.empresa_id,
        telefono: selectedThread.telefono_cliente,
        mensaje: reply
      }));
      setReply('');
      await loadThreads(filters);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSending(false);
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
            <h1>Inbox</h1>
            <p>Bandeja profesional para revisar conversaciones, pausar el bot y responder manualmente.</p>
          </div>
        </div>
        <div>
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

      {error ? <ErrorState message={error} onRetry={() => loadThreads(filters)} /> : null}

      <section className="panel-section inbox-panel">
        <div className="inbox-toolbar">
          <label className="product-search" htmlFor="conversation-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="conversation-search"
              onChange={(event) => updateFilters({ query: event.target.value })}
              placeholder="Buscar telefono o mensaje"
              type="search"
              value={filters.query}
            />
          </label>

          <div className="crm-filter-group">
            <SlidersHorizontal size={18} aria-hidden="true" />
            <select
              aria-label="Estado"
              onChange={(event) => updateFilters({ estado: event.target.value })}
              value={filters.estado}
            >
              <option value="">Todos</option>
              <option value="open">Abiertas</option>
              <option value="bot_active">Bot activo</option>
              <option value="requires_human">Requiere humano</option>
              <option value="human_active">Atencion humana</option>
              <option value="closed">Cerradas</option>
            </select>
          </div>

          {canSelectCompany ? (
            <select
              className="inbox-company-filter"
              aria-label="Empresa"
              onChange={(event) => updateFilters({ empresa_id: event.target.value })}
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

        <div className="inbox-layout professional">
          <aside className="inbox-sidebar">
            {isLoading ? (
              <LoadingState message="Cargando conversaciones..." />
            ) : (
              <ThreadList
                selectedThread={selectedThread}
                threads={threads}
                onSelect={(thread) => {
                  setSelectedThreadKey(getThreadKey(thread));
                  setIsChatOpen(true);
                }}
              />
            )}
          </aside>

          <div className={isChatOpen ? 'inbox-chat-shell open' : 'inbox-chat-shell'}>
            <ChatPanel
              isSending={isSending}
              onBack={() => setIsChatOpen(false)}
              onDelete={setPendingDelete}
              onEdit={(conversation) => {
                setEditingConversation(conversation);
                setIsFormOpen(true);
              }}
              onPause={handlePause}
              onReply={handleReply}
              onResume={handleResume}
              onClose={handleClose}
              reply={reply}
              setReply={setReply}
              thread={threadDetail}
            />
          </div>
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
