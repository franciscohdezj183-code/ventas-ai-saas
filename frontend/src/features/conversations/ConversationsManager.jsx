import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCheck,
  CheckCircle2,
  FileText,
  Info,
  MessageCircle,
  MessageSquarePlus,
  MoreVertical,
  PauseCircle,
  Phone,
  PlayCircle,
  Plus,
  Search,
  Send,
  Sparkles,
  UserPlus,
  X
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

function formatThreadDate(value) {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  return isToday
    ? date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function getInitials(value = '') {
  const cleaned = String(value).replace(/[^\dA-Za-z]/g, '');
  return cleaned.slice(-2).toUpperCase() || 'CX';
}

function getThreadPreview(thread) {
  return thread?.ultima_respuesta || thread?.ultimo_mensaje || 'Sin mensajes recientes';
}

function getThreadDisplayName(thread) {
  return (
    thread?.contact_name ||
    thread?.nombre_contacto ||
    thread?.contacto_nombre ||
    thread?.nombre_cliente ||
    thread?.cliente_nombre ||
    thread?.pushname ||
    getThreadPhone(thread) ||
    'Contacto'
  );
}

function getThreadPhone(thread) {
  const phone = thread?.customerPhone || thread?.customer_phone || thread?.telefono || thread?.telefono_cliente;
  return String(phone ?? '').includes('@') ? '' : phone;
}

function normalizeBubbleText(value, { preserveBreaks = false } = {}) {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').trim();

  if (!preserveBreaks) {
    return text.replace(/\s+/g, ' ');
  }

  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function DefaultContactIcon() {
  return (
    <svg viewBox="0 0 48 48" height="34" width="34" preserveAspectRatio="xMidYMid meet" fill="none" aria-hidden="true">
      <title>default-contact-refreshed</title>
      <path
        fill="currentColor"
        d="M24 23q-1.86 0-3.18-1.32T19.5 18.5t1.32-3.18T24 14t3.18 1.32q1.32 1.32 1.32 3.18t-1.32 3.18T24 23m-6.75 10q-.93 0-1.59-.66T15 30.75v-.9q0-.96.5-1.76a3.3 3.3 0 0 1 1.3-1.22 16.7 16.7 0 0 1 3.54-1.3q1.8-.44 3.66-.44t3.66.43 3.54 1.31q.82.42 1.3 1.22t.5 1.76v.9q0 .93-.66 1.59t-1.59.66z"
      />
    </svg>
  );
}

const conversationStateLabels = {
  open: 'Abierta',
  bot_active: 'Bot activo',
  requires_human: 'Requiere humano',
  human_active: 'Atencion humana',
  closed: 'Cerrada'
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
        (() => {
          const displayName = getThreadDisplayName(thread);
          const displayPhone = getThreadPhone(thread);
          const showPhone = displayPhone && displayPhone !== displayName;

          return (
        <button
          className={selectedThread?.telefono_cliente === thread.telefono_cliente && selectedThread?.empresa_id === thread.empresa_id ? 'inbox-thread active' : 'inbox-thread'}
          key={getThreadKey(thread)}
          onClick={() => onSelect(thread)}
          type="button"
        >
          <span className="inbox-avatar" data-icon="default-contact-refreshed" aria-hidden="true">
            <DefaultContactIcon />
          </span>
          <div className="inbox-thread-main">
            <div className="inbox-thread-title-row">
              <strong>{displayName}</strong>
              <time>{formatThreadDate(thread.ultima_fecha)}</time>
            </div>
            {showPhone ? <small>{displayPhone}</small> : null}
            <p>{getThreadPreview(thread)}</p>
            <small>{thread.empresa_nombre ?? `Empresa #${thread.empresa_id}`}</small>
          </div>
          <div className="inbox-thread-badges">
            {Number(thread.mensajes_sin_respuesta) > 0 ? (
              <span className="unread-dot">{thread.mensajes_sin_respuesta}</span>
            ) : null}
          </div>
        </button>
          );
        })()
      ))}
    </div>
  );
}

function ChatMessage({ message }) {
  const isHuman = message.tipo_mensaje === 'human';
  const isSystem = message.tipo_mensaje === 'system';
  const responseClass = isHuman ? 'chat-bubble human' : isSystem ? 'chat-bubble system' : 'chat-bubble bot';
  const customerMessage = normalizeBubbleText(message.mensaje);
  const responseMessage = normalizeBubbleText(message.respuesta, { preserveBreaks: true });

  return (
    <>
      <div className="chat-bubble customer">
        <p>{customerMessage}</p>
        <span className="chat-bubble-meta">{formatTime(message.fecha)}</span>
      </div>
      {responseMessage ? (
        <div className={responseClass}>
          <p>{responseMessage}</p>
          <span className="chat-bubble-meta">
            {formatTime(message.fecha)}
            <CheckCheck size={14} strokeWidth={2.2} aria-hidden="true" />
          </span>
        </div>
      ) : null}
    </>
  );
}

function ContactPanel({ isOpen, onClose, onDismiss, onPause, onResume, thread }) {
  if (!isOpen) {
    return null;
  }

  if (!thread) {
    return (
      <div className="inbox-contact-popover" role="dialog" aria-label="Informacion del contacto">
        <aside className="inbox-contact-panel empty">
          <button className="contact-panel-close" onClick={onDismiss} type="button" aria-label="Cerrar informacion del contacto">
            <X size={16} aria-hidden="true" />
          </button>
          <Sparkles size={24} aria-hidden="true" />
          <strong>Perfil del contacto</strong>
          <p>Selecciona una conversacion para ver datos del cliente, canal y acciones.</p>
        </aside>
      </div>
    );
  }

  const stateLabel = conversationStateLabels[thread.estado_inbox] ?? thread.estado_inbox;
  const displayName = getThreadDisplayName(thread);
  const displayPhone = getThreadPhone(thread);

  return (
    <div className="inbox-contact-popover" role="dialog" aria-label="Informacion del contacto">
      <aside className="inbox-contact-panel">
        <button className="contact-panel-close" onClick={onDismiss} type="button" aria-label="Cerrar informacion del contacto">
          <X size={16} aria-hidden="true" />
        </button>
        <section className="contact-card hero">
          <span className="contact-avatar">{getInitials(displayName || displayPhone)}</span>
          <div>
            <p className="eyebrow">Contacto</p>
            <h2>{displayName}</h2>
            {displayPhone && displayPhone !== displayName ? <span>{displayPhone}</span> : null}
            <span>{thread.empresa_nombre ?? `Empresa #${thread.empresa_id}`}</span>
          </div>
        </section>

        <section className="contact-card">
          <h3>Detalles</h3>
          <dl className="contact-detail-list">
            <div>
              <dt><Phone size={15} aria-hidden="true" /> Telefono</dt>
              <dd>{displayPhone || '-'}</dd>
            </div>
            <div>
              <dt><Building2 size={15} aria-hidden="true" /> Empresa</dt>
              <dd>{thread.empresa_nombre ?? `#${thread.empresa_id}`}</dd>
            </div>
            <div>
              <dt><MessageCircle size={15} aria-hidden="true" /> Canal</dt>
              <dd>WhatsApp</dd>
            </div>
            <div>
              <dt><CheckCircle2 size={15} aria-hidden="true" /> Estado</dt>
              <dd>{stateLabel}</dd>
            </div>
          </dl>
        </section>

        <section className="contact-card">
          <h3>Acciones rapidas</h3>
          <div className="contact-actions">
            {thread.bot_pausado ? (
              <button className="secondary-button" onClick={onResume} type="button">
                <PlayCircle size={16} aria-hidden="true" />
                Reanudar bot
              </button>
            ) : (
              <button className="secondary-button" onClick={onPause} type="button">
                <PauseCircle size={16} aria-hidden="true" />
                Pausar bot
              </button>
            )}
            {thread.estado_inbox !== 'closed' ? (
              <button className="secondary-button" onClick={onClose} type="button">
                Cerrar conversacion
              </button>
            ) : null}
          </div>
        </section>
      </aside>
    </div>
  );
}

function ChatPanel({
  isSending,
  onDelete,
  onEdit,
  onPause,
  onOpenContact,
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
        <div className="inbox-empty-card">
          <span className="inbox-empty-illustration">
            <MessageCircle size={46} aria-hidden="true" />
          </span>
          <strong>WhatsApp conectado al negocio</strong>
          <p>Selecciona una conversacion para revisar el historial, pausar el bot o responder manualmente.</p>
        </div>
        <div className="inbox-empty-shortcuts">
          <span><FileText size={20} aria-hidden="true" /> Enviar documento</span>
          <span><UserPlus size={20} aria-hidden="true" /> Añadir contacto</span>
        </div>
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
          <span
            className="inbox-chat-avatar"
            data-testid="default-contact-refreshed"
            data-icon="default-contact-refreshed"
            aria-hidden="true"
          >
            <DefaultContactIcon />
          </span>
          <div>
            <strong>{getThreadDisplayName(thread)}</strong>
            <span>
              {getThreadPhone(thread) ? `${getThreadPhone(thread)} - ` : ''}WhatsApp - {conversationStateLabels[thread.estado_inbox] ?? thread.estado_inbox}
            </span>
          </div>
        </div>
        <div className="inbox-chat-actions">
          <button className="inbox-info-button" onClick={onOpenContact} type="button" aria-label="Ver informacion del contacto">
            <MoreVertical size={19} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="inbox-message-list professional">
        {thread.mensajes?.length ? (
          thread.mensajes.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
            />
          ))
        ) : (
          <EmptyState title="Sin mensajes" description="Este cliente aun no tiene historial guardado." />
        )}
      </div>

      <form className="inbox-reply-box" onSubmit={onReply}>
        <label className="inbox-reply-field" htmlFor="inbox-reply">
          <textarea
            id="inbox-reply"
            aria-label="Responder conversacion"
            onChange={(event) => setReply(event.target.value)}
            placeholder="Escribe un mensaje"
            rows={1}
            value={reply}
          />
        </label>
        <button
          className="primary-button inbox-send-button"
          disabled={isSending || !reply.trim()}
          type="submit"
          aria-label="Enviar mensaje"
        >
          <Send size={18} aria-hidden="true" />
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
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [reply, setReply] = useState('');
  const [selectedThreadKey, setSelectedThreadKey] = useState('');
  const [threadDetail, setThreadDetail] = useState(null);
  const [threads, setThreads] = useState([]);

  const selectedThread = useMemo(
    () => threads.find((thread) => getThreadKey(thread) === selectedThreadKey) ?? null,
    [selectedThreadKey, threads]
  );

  const inboxCounts = useMemo(() => ({
    all: threads.length,
    requires_human: threads.filter((thread) => thread.estado_inbox === 'requires_human').length,
    bot_active: threads.filter((thread) => thread.estado_inbox === 'bot_active').length,
    human_active: threads.filter((thread) => thread.estado_inbox === 'human_active').length,
    closed: threads.filter((thread) => thread.estado_inbox === 'closed').length
  }), [threads]);

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
        setIsContactOpen(false);
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
      {error ? <ErrorState message={error} onRetry={() => loadThreads(filters)} /> : null}

      <section className="panel-section inbox-panel">
        <div className="inbox-layout professional">
          <aside className="inbox-sidebar">
            <div className="inbox-sidebar-top">
              <div className="inbox-sidebar-title">
                <h1>WhatsApp</h1>
                <div className="inbox-sidebar-actions">
                  <button
                    className="inbox-top-icon"
                    onClick={() => {
                      setEditingConversation(null);
                      setIsFormOpen(true);
                    }}
                    type="button"
                    aria-label="Nueva nota"
                  >
                    <MessageSquarePlus size={18} aria-hidden="true" />
                  </button>
                  <button className="inbox-top-icon" onClick={() => setIsContactOpen(true)} type="button" aria-label="Opciones">
                    <MoreVertical size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <label className="inbox-search" htmlFor="conversation-search">
                <Search size={17} aria-hidden="true" />
                <input
                  id="conversation-search"
                  onChange={(event) => updateFilters({ query: event.target.value })}
                  placeholder="Buscar un chat o iniciar uno nuevo"
                  type="search"
                  value={filters.query}
                />
              </label>

              <div className="inbox-filter-chips" aria-label="Filtros de conversaciones">
                {[
                  ['Todos', '', inboxCounts.all],
                  ['No leidos', 'requires_human', inboxCounts.requires_human],
                  ['Bot', 'bot_active', inboxCounts.bot_active],
                  ['Humano', 'human_active', inboxCounts.human_active],
                  ['Cerradas', 'closed', inboxCounts.closed]
                ].map(([label, value, count]) => (
                  <button
                    className={filters.estado === value ? 'active' : ''}
                    key={value || 'all'}
                    onClick={() => updateFilters({ estado: value })}
                    type="button"
                  >
                    {label}{count ? ` ${count}` : ''}
                  </button>
                ))}
                <button
                  className="inbox-add-filter"
                  onClick={() => {
                    setEditingConversation(null);
                    setIsFormOpen(true);
                  }}
                  type="button"
                  aria-label="Nueva nota"
                >
                  <Plus size={17} aria-hidden="true" />
                </button>
              </div>

            </div>

            {isLoading ? (
              <LoadingState message="Cargando conversaciones..." />
            ) : (
              <ThreadList
                selectedThread={selectedThread}
                threads={threads}
                onSelect={(thread) => {
                  setSelectedThreadKey(getThreadKey(thread));
                  setIsChatOpen(true);
                  setIsContactOpen(false);
                }}
              />
            )}
            {canSelectCompany ? (
              <div className="inbox-sidebar-bottom">
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
              </div>
            ) : null}
          </aside>

          <div className={isChatOpen ? 'inbox-chat-shell open' : 'inbox-chat-shell'}>
            <ChatPanel
              isSending={isSending}
              onBack={() => {
                setIsChatOpen(false);
                setIsContactOpen(false);
              }}
              onDelete={setPendingDelete}
              onEdit={(conversation) => {
                setEditingConversation(conversation);
                setIsFormOpen(true);
              }}
              onPause={handlePause}
              onOpenContact={() => setIsContactOpen(true)}
              onReply={handleReply}
              onResume={handleResume}
              onClose={handleClose}
              reply={reply}
              setReply={setReply}
              thread={threadDetail}
            />
            <ContactPanel
              isOpen={isContactOpen}
              onDismiss={() => setIsContactOpen(false)}
              onPause={handlePause}
              onResume={handleResume}
              onClose={handleClose}
              thread={threadDetail ?? selectedThread}
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
              <X size={16} aria-hidden="true" />
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
