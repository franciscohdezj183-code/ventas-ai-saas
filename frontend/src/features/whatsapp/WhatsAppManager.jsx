import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleOff,
  Clock3,
  MessageCircle,
  MessageSquareText,
  Phone,
  Power,
  QrCode,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles
} from 'lucide-react';
import { ErrorState, StatusBadge } from '../../components/ui/index.js';
import { Can } from '../../components/Can.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isSuperAdminRole } from '../../config/permissions.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  disconnectWhatsappSession,
  fetchWhatsappQr,
  fetchWhatsappStatus,
  restartWhatsappSession,
  startWhatsappSession
} from './whatsappApi.js';
import {
  createSingleFlight,
  createWhatsappCommandPoller,
  isQueuedCommandResponse
} from './whatsappCommandFlow.js';

const statusCopy = {
  CONNECTED: {
    label: 'Conectado',
    tone: 'connected',
    icon: CheckCircle2,
    description: 'WhatsApp esta listo para recibir y responder mensajes de clientes.'
  },
  QR_READY: {
    label: 'QR listo',
    tone: 'scanning',
    icon: QrCode,
    description: 'Escanea el codigo con el telefono del negocio para completar la vinculacion.'
  },
  INITIALIZING: {
    label: 'Preparando sesion',
    tone: 'scanning',
    icon: Clock3,
    description: 'Estamos abriendo la sesion. El QR aparecera en unos segundos.'
  },
  AUTHENTICATED: {
    label: 'Autenticado',
    tone: 'scanning',
    icon: ShieldCheck,
    description: 'WhatsApp valido la sesion. Esperando conexion final.'
  },
  RECONNECTING: {
    label: 'Reconectando',
    tone: 'scanning',
    icon: RefreshCcw,
    description: 'Estamos intentando recuperar la sesion.'
  },
  LOADING_SCREEN: {
    label: 'Cargando sesion',
    tone: 'scanning',
    icon: RefreshCcw,
    description: 'WhatsApp esta cargando la sesion del navegador.'
  },
  AUTH_FAILED: {
    label: 'Error de autenticacion',
    tone: 'error',
    icon: AlertTriangle,
    description: 'No se pudo autenticar la sesion. Reinicia y escanea un QR nuevo.'
  },
  DISCONNECTED: {
    label: 'Desconectado',
    tone: 'disconnected',
    icon: CircleOff,
    description: 'Conecta WhatsApp para activar la atencion desde este canal.'
  }
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function getStatusValue(status) {
  return String(status?.status ?? 'DISCONNECTED').toUpperCase();
}

function getStatusInfo(status) {
  return statusCopy[getStatusValue(status)] ?? statusCopy.DISCONNECTED;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin registro';
}

function formatPhone(value) {
  if (!value) {
    return 'No disponible';
  }

  const clean = String(value).replace('@c.us', '');
  return clean.startsWith('+') ? clean : `+${clean}`;
}

function getFirstValue(source, keys, fallback = '-') {
  for (const key of keys) {
    const value = source?.[key];

    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return fallback;
}

function WhatsAppHeader({
  canAct,
  canSelectCompany,
  companies,
  empresaId,
  isBusy,
  operationPending,
  onCompanyChange,
  onDisconnect,
  onRefresh,
  onRestart,
  onStart,
  user
}) {
  return (
    <header className="whatsapp-hero">
      <div className="whatsapp-hero-copy">
        <span className="whatsapp-hero-icon">
          <MessageCircle size={26} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Central WhatsApp Business</p>
          <h1>WhatsApp</h1>
          <p>Administra la conexion, el QR, la sesion y el canal automatizado desde una vista clara.</p>
        </div>
      </div>

      <div className="whatsapp-command-panel">
        {canSelectCompany ? (
          <label className="whatsapp-company-select" htmlFor="whatsapp-company">
            <span>Empresa</span>
            <select id="whatsapp-company" onChange={(event) => onCompanyChange(event.target.value)} value={empresaId}>
              <option value="">Selecciona una empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="whatsapp-owner-context">
            <Phone size={18} aria-hidden="true" />
            <span>{user?.empresa?.nombre ?? 'Empresa actual'}</span>
          </div>
        )}

        <div className="whatsapp-actions">
          <Can permission="whatsapp.manage">
            <button className="primary-button" disabled={!canAct} onClick={onStart} type="button">
              <MessageCircle size={18} aria-hidden="true" />
              Conectar
            </button>
          </Can>
          <Can permission="whatsapp.manage">
            <button className="secondary-button" disabled={!canAct} onClick={onRestart} type="button">
              <RotateCcw size={18} aria-hidden="true" />
              Reconectar
            </button>
          </Can>
          <Can permission="whatsapp.manage">
            <button className="secondary-button" disabled={!canAct} onClick={onDisconnect} type="button">
              <Power size={18} aria-hidden="true" />
              Desconectar
            </button>
          </Can>
          <button className="icon-button bordered" disabled={!canAct || isBusy} onClick={onRefresh} type="button" aria-label="Actualizar estado">
            <RefreshCcw size={18} aria-hidden="true" />
          </button>
        </div>
        {operationPending ? (
          <p className="whatsapp-command-pending">Comando en proceso</p>
        ) : null}
      </div>
    </header>
  );
}

function StatusOverview({ hasQr, status }) {
  const info = getStatusInfo(status);
  const Icon = info.icon;

  return (
    <section className={`whatsapp-status-overview ${info.tone}`}>
      <div className="whatsapp-status-copy">
        <span className="whatsapp-status-icon">
          <Icon size={28} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Estado de conexion</p>
          <h2>{info.label}</h2>
          <p>{status?.last_error && info.tone === 'error' ? status.last_error : info.description}</p>
        </div>
      </div>

      <dl className="whatsapp-status-facts">
        <div>
          <dt>Numero conectado</dt>
          <dd>{formatPhone(status?.phone ?? status?.number ?? status?.telefono)}</dd>
        </div>
        <div>
          <dt>QR</dt>
          <dd>{hasQr ? 'Disponible para escanear' : 'Sin QR activo'}</dd>
        </div>
        <div>
          <dt>Sesion</dt>
          <dd>{status?.status ?? 'DISCONNECTED'}</dd>
        </div>
      </dl>
    </section>
  );
}

function WhatsAppMetrics({ hasQr, status }) {
  const statusValue = getStatusValue(status);
  const metrics = [
    {
      key: 'chats',
      icon: MessageSquareText,
      label: 'Chats',
      value: getFirstValue(status, ['chats_count', 'total_chats', 'conversations_count', 'chats']),
      detail: 'Conversaciones registradas'
    },
    {
      key: 'messages',
      icon: MessageCircle,
      label: 'Mensajes hoy',
      value: getFirstValue(status, ['messages_today', 'mensajes_hoy', 'today_messages', 'sent_today']),
      detail: 'Actividad del dia'
    },
    {
      key: 'bot',
      icon: Bot,
      label: 'Bot',
      value: getFirstValue(status, ['bot_status', 'bot_estado'], statusValue === 'CONNECTED' ? 'Activo' : 'En espera'),
      detail: 'Atencion automatizada'
    },
    {
      key: 'ai',
      icon: Sparkles,
      label: 'IA',
      value: getFirstValue(status, ['ai_status', 'ia_estado'], '-'),
      detail: 'Estado comercial'
    },
    {
      key: 'qr',
      icon: QrCode,
      label: 'QR',
      value: hasQr ? 'Listo' : 'No activo',
      detail: 'Vinculacion del telefono'
    }
  ];

  return (
    <section className="whatsapp-metric-grid" aria-label="Resumen de WhatsApp">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <article className="whatsapp-metric-card" key={metric.key}>
            <span>
              <Icon size={19} aria-hidden="true" />
            </span>
            <div>
              <strong>{metric.value}</strong>
              <small>{metric.label}</small>
              <p>{metric.detail}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function QRPanel({ hasQr, isQrFlow, status, statusInfo }) {
  return (
    <article className="whatsapp-qr-console">
      <div className="whatsapp-web-login-copy">
        <div className="whatsapp-web-heading">
          <div>
            <p className="eyebrow">Vinculacion</p>
            <h3>Inicia sesion en WhatsApp Web</h3>
            <p>Envia mensajes privados a tus clientes a traves de WhatsApp en tu negocio.</p>
          </div>
          <StatusBadge status={status?.status ?? 'DISCONNECTED'}>{statusInfo.label}</StatusBadge>
        </div>

        <ol className="whatsapp-web-steps">
          <li>Abre WhatsApp en tu telefono.</li>
          <li>Toca Menu en Android o Ajustes en iPhone.</li>
          <li>Toca Dispositivos vinculados y luego Vincular un dispositivo.</li>
          <li>Apunta tu telefono hacia esta pantalla para escanear el codigo QR.</li>
        </ol>

        <div className="whatsapp-web-note">
          <Smartphone size={18} aria-hidden="true" />
          <span>Usa el telefono que quedara conectado al negocio.</span>
        </div>
      </div>

      <div className="whatsapp-qr-stage">
        {hasQr ? (
          <img alt="QR de WhatsApp" src={status.qr_image} />
        ) : (
          <div className={isQrFlow ? 'qr-placeholder large waiting' : 'qr-placeholder large'}>
            <QrCode size={42} aria-hidden="true" />
            <span>{isQrFlow ? 'Generando QR...' : 'Sin QR activo'}</span>
          </div>
        )}
      </div>
    </article>
  );
}

export function WhatsAppManager() {
  const { user } = useAuth();
  const canSelectCompany = isSuperAdminRole(user?.rol);
  const [companies, setCompanies] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [operationPending, setOperationPending] = useState(null);
  const [status, setStatus] = useState(null);
  const commandSingleFlightRef = useRef(createSingleFlight());
  const pollerRef = useRef(null);
  const mountedRef = useRef(false);
  const statusRequestRef = useRef(null);

  const selectedCompanyId = canSelectCompany ? empresaId : undefined;
  const statusInfo = getStatusInfo(status);
  const statusValue = getStatusValue(status);
  const hasQr = Boolean(status?.qr_image);
  const isQrFlow = ['INITIALIZING', 'QR_READY', 'AUTHENTICATED'].includes(statusValue);
  const canAct = Boolean(user) && !isBusy && !operationPending && (!canSelectCompany || empresaId);

  async function loadCompanies() {
    if (!user || !canSelectCompany) {
      return;
    }

    setCompanies(await fetchCompanies());
  }

  async function loadStatus(companyId = selectedCompanyId) {
    if (!user) {
      setStatus(null);
      return;
    }

    if (canSelectCompany && !companyId) {
      setStatus(null);
      return;
    }

    if (statusRequestRef.current) {
      return statusRequestRef.current;
    }

    statusRequestRef.current = Promise.all([
      fetchWhatsappStatus(companyId),
      fetchWhatsappQr(companyId)
    ])
      .then(([nextStatus, qr]) => {
        const statusWithQr = { ...nextStatus, qr_image: qr.qr_image };
        if (mountedRef.current) {
          setStatus(statusWithQr);
        }
        return statusWithQr;
      })
      .finally(() => {
        statusRequestRef.current = null;
      });

    return statusRequestRef.current;
  }

  function stopCommandPolling() {
    pollerRef.current?.stop();
    pollerRef.current = null;
  }

  function waitForQueuedCommand(command, companyId = selectedCompanyId) {
    stopCommandPolling();
    setOperationPending(command);
    pollerRef.current = createWhatsappCommandPoller({
      loadStatus: () => loadStatus(companyId),
      onStatus: (nextStatus) => {
        if (mountedRef.current) {
          setStatus(nextStatus);
        }
      },
      onDone: () => {
        if (mountedRef.current) {
          setOperationPending(null);
        }
      },
      onError: (requestError) => {
        if (mountedRef.current) {
          setError(getApiError(requestError));
          setOperationPending(null);
        }
      }
    });
    pollerRef.current.start();
  }

  async function applyCommandResult(commandResult, companyId = selectedCompanyId) {
    if (isQueuedCommandResponse(commandResult)) {
      waitForQueuedCommand(commandResult, companyId);
      return;
    }

    setOperationPending(null);
    setStatus(commandResult);
    await loadStatus(companyId);
  }

  useEffect(() => {
    loadCompanies().catch((requestError) => setError(getApiError(requestError)));
  }, [canSelectCompany, user]);

  useEffect(() => {
    stopCommandPolling();
    setOperationPending(null);
    loadStatus().catch((requestError) => setError(getApiError(requestError)));
  }, [empresaId, canSelectCompany, user]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      stopCommandPolling();
    };
  }, []);

  async function handleStart() {
    return commandSingleFlightRef.current(async () => {
      try {
        setIsBusy(true);
        setError('');
        await applyCommandResult(await startWhatsappSession(selectedCompanyId));
      } catch (requestError) {
        setError(getApiError(requestError));
      } finally {
        setIsBusy(false);
      }
    });
  }

  async function handleRestart() {
    return commandSingleFlightRef.current(async () => {
      try {
        setIsBusy(true);
        setError('');
        await applyCommandResult(await restartWhatsappSession(selectedCompanyId));
      } catch (requestError) {
        setError(getApiError(requestError));
      } finally {
        setIsBusy(false);
      }
    });
  }

  async function handleRefresh() {
    try {
      setIsBusy(true);
      setError('');
      await loadStatus();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisconnect() {
    return commandSingleFlightRef.current(async () => {
      try {
        setIsBusy(true);
        setError('');
        await applyCommandResult(await disconnectWhatsappSession(selectedCompanyId));
      } catch (requestError) {
        setError(getApiError(requestError));
      } finally {
        setIsBusy(false);
      }
    });
  }

  return (
    <div className="whatsapp-page">
      {error ? <ErrorState message={error} onRetry={handleRefresh} /> : null}

      <div className="whatsapp-manager">
        <WhatsAppHeader
          canAct={canAct}
          canSelectCompany={canSelectCompany}
          companies={companies}
          empresaId={empresaId}
          isBusy={isBusy}
          operationPending={operationPending}
          onCompanyChange={setEmpresaId}
          onDisconnect={handleDisconnect}
          onRefresh={handleRefresh}
          onRestart={handleRestart}
          onStart={handleStart}
          user={user}
        />

        <WhatsAppMetrics hasQr={hasQr} status={status} />

        <section className="whatsapp-console-grid">
          <QRPanel hasQr={hasQr} isQrFlow={isQrFlow} status={status} statusInfo={statusInfo} />
          <div className="whatsapp-console-side">
            <StatusOverview hasQr={hasQr} status={status} />
          </div>
        </section>
      </div>
    </div>
  );
}
