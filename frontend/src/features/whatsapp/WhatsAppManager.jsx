import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleOff,
  Clock3,
  LoaderCircle,
  MessageCircle,
  MessageSquareText,
  Phone,
  Power,
  QrCode,
  RefreshCcw,
  RotateCcw,
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
  getWhatsappSocketToken,
  restartWhatsappSession,
  resolveSocketUrl,
  startWhatsappSession
} from './whatsappApi.js';

const statusCopy = {
  ready: {
    label: 'Conectado',
    tone: 'connected',
    icon: CheckCircle2,
    description: 'WhatsApp esta listo para recibir y responder mensajes de clientes.'
  },
  idle: {
    label: 'Sin iniciar',
    tone: 'disconnected',
    icon: CircleOff,
    description: 'Inicia la vinculacion para generar un codigo QR.'
  },
  qr: {
    label: 'QR disponible',
    tone: 'scanning',
    icon: QrCode,
    description: 'Escanea el codigo con el telefono del negocio para completar la vinculacion.'
  },
  initializing: {
    label: 'Iniciando',
    tone: 'scanning',
    icon: Clock3,
    description: 'Estamos preparando la vinculacion.'
  },
  authenticated: {
    label: 'Autenticando',
    tone: 'scanning',
    icon: LoaderCircle,
    description: 'WhatsApp valido la sesion. Esperando conexion final.'
  },
  disconnected: {
    label: 'Desconectado',
    tone: 'disconnected',
    icon: CircleOff,
    description: 'Conecta WhatsApp para activar la atencion desde este canal.'
  },
  failed: {
    label: 'Error',
    tone: 'error',
    icon: AlertTriangle,
    description: 'La sesion requiere atencion. Intenta reiniciar la conexion.'
  },
  destroyed: {
    label: 'Sesion destruida',
    tone: 'disconnected',
    icon: CircleOff,
    description: 'La sesion local se elimino. Inicia una nueva vinculacion para generar QR.'
  },
  CONNECTED: {
    label: 'Conectado',
    tone: 'connected',
    icon: CheckCircle2,
    description: 'WhatsApp esta listo para recibir y responder mensajes de clientes.'
  },
  NOT_STARTED: {
    label: 'Sin iniciar',
    tone: 'disconnected',
    icon: CircleOff,
    description: 'Inicia la vinculacion para generar un codigo QR.'
  },
  QR_READY: {
    label: 'QR disponible',
    tone: 'scanning',
    icon: QrCode,
    description: 'Escanea el codigo con el telefono del negocio para completar la vinculacion.'
  },
  QR_EXPIRED: {
    label: 'QR expirado',
    tone: 'error',
    icon: AlertTriangle,
    description: 'El codigo expiro. Reinicia la vinculacion para generar uno nuevo.'
  },
  INITIALIZING: {
    label: 'Iniciando',
    tone: 'scanning',
    icon: LoaderCircle,
    description: 'Estamos preparando la vinculacion.'
  },
  WAITING_QR: {
    label: 'Esperando QR',
    tone: 'scanning',
    icon: LoaderCircle,
    description: 'Estamos generando el codigo QR. Normalmente tarda unos segundos.'
  },
  AUTHENTICATED: {
    label: 'Autenticando',
    tone: 'scanning',
    icon: LoaderCircle,
    description: 'WhatsApp valido la sesion. Esperando conexion final.'
  },
  RECONNECTING: {
    label: 'Reconectando',
    tone: 'scanning',
    icon: LoaderCircle,
    description: 'Estamos intentando recuperar la sesion.'
  },
  LOADING_SCREEN: {
    label: 'Cargando sesion',
    tone: 'scanning',
    icon: LoaderCircle,
    description: 'WhatsApp esta cargando la sesion del navegador.'
  },
  AUTH_FAILED: {
    label: 'Error de autenticacion',
    tone: 'error',
    icon: AlertTriangle,
    description: 'No se pudo autenticar la sesion. Reinicia y escanea un QR nuevo.'
  },
  ERROR: {
    label: 'Error',
    tone: 'error',
    icon: AlertTriangle,
    description: 'La sesion requiere atencion. Intenta reiniciar la conexion.'
  },
  DISCONNECTED: {
    label: 'Desconectado',
    tone: 'disconnected',
    icon: CircleOff,
    description: 'Conecta WhatsApp para activar la atencion desde este canal.'
  }
};

function getApiError(error) {
  if (error?.response?.status === 401) {
    return 'Tu sesion del sistema expiro. Inicia sesion nuevamente.';
  }

  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function getStatusValue(status) {
  if (!status || !status.status) {
    return 'idle';
  }

  return String(status.status);
}

function getStatusCompanyId(payload) {
  return payload?.companyId ?? payload?.empresaId ?? payload?.empresa_id;
}

function mergeWhatsappStatus(currentStatus, payload) {
  const qrImage = payload?.qrImage ?? payload?.qr_image ?? currentStatus?.qrImage ?? currentStatus?.qr_image ?? null;
  const qrText = payload?.qrText ?? payload?.qr ?? currentStatus?.qrText ?? currentStatus?.qr ?? null;

  return {
    ...currentStatus,
    ...payload,
    qr: qrText,
    qrText,
    qrImage,
    qr_image: qrImage,
    qr_available: Boolean(qrImage)
  };
}

function getStatusInfo(status) {
  return statusCopy[getStatusValue(status)] ?? statusCopy.DISCONNECTED;
}

function isConnectedStatus(statusValue) {
  return ['ready', 'CONNECTED'].includes(statusValue);
}

function isAuthenticatingStatus(statusValue) {
  return [
    'initializing',
    'authenticated',
    'INITIALIZING',
    'WAITING_QR',
    'AUTHENTICATED',
    'RECONNECTING',
    'LOADING_SCREEN'
  ].includes(statusValue);
}

function shouldFetchQrForStatus(statusValue) {
  return ['initializing', 'qr', 'INITIALIZING', 'WAITING_QR', 'QR_READY'].includes(statusValue);
}

function getPollingInterval(statusValue) {
  if (['initializing', 'qr', 'authenticated', 'INITIALIZING', 'WAITING_QR', 'QR_READY', 'AUTHENTICATED'].includes(statusValue)) {
    return 3000;
  }

  return null;
}

function shouldShowTechnicalDetails(user) {
  return isSuperAdminRole(user?.rol) || import.meta.env.DEV || window.localStorage?.getItem('whatsapp_debug') === 'true';
}

function friendlyStatusMessage(status, info) {
  if (status?.user_message) {
    return status.user_message;
  }

  if (info.tone === 'error') {
    return 'No se pudo completar la vinculacion. Reinicia la sesion y vuelve a intentar.';
  }

  return info.description;
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

function formatTimeRemaining(value) {
  if (!value) {
    return null;
  }

  const remainingSeconds = Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
  return remainingSeconds > 0 ? `${remainingSeconds}s` : 'expirado';
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

function WhatsAppHeader({ canAct, canDisconnect, canRestart, canSelectCompany, canStart, companies, empresaId, isBusy, onCompanyChange, onDisconnect, onRefresh, onRestart, onStart, user }) {
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
            <button className="primary-button" disabled={!canStart} onClick={onStart} type="button">
              <MessageCircle size={18} aria-hidden="true" />
              Conectar
            </button>
          </Can>
          <Can permission="whatsapp.manage">
            <button className="secondary-button" disabled={!canRestart} onClick={onRestart} type="button">
              <RotateCcw size={18} aria-hidden="true" />
              Reconectar
            </button>
          </Can>
          <Can permission="whatsapp.manage">
            <button className="secondary-button" disabled={!canDisconnect} onClick={onDisconnect} type="button">
              <Power size={18} aria-hidden="true" />
              Desconectar
            </button>
          </Can>
          <button className="icon-button bordered" disabled={!canAct || isBusy} onClick={onRefresh} type="button" aria-label="Actualizar estado">
            <RefreshCcw size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

function StatusOverview({ hasQr, showTechnicalDetails, status }) {
  const info = getStatusInfo(status);
  const Icon = info.icon;
  const message = friendlyStatusMessage(status, info);
  const isConnected = isConnectedStatus(getStatusValue(status));
  const isAuthenticating = isAuthenticatingStatus(getStatusValue(status));

  return (
    <section className={`whatsapp-status-overview ${info.tone}`}>
      <div className="whatsapp-status-copy">
        <span className={`whatsapp-status-icon ${isConnected ? 'connected' : ''} ${isAuthenticating ? 'loading' : ''}`}>
          <Icon size={28} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Estado de conexion</p>
          <h2>{info.label}</h2>
          <p>{showTechnicalDetails && status?.last_error && info.tone === 'error' ? status.last_error : message}</p>
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
      value: getFirstValue(status, ['bot_status', 'bot_estado'], statusValue === 'ready' ? 'Activo' : 'En espera'),
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

function QRPanel({ hasQr, isQrFlow, qrTimeRemaining, status, statusInfo }) {
  const statusValue = getStatusValue(status);
  const isConnected = isConnectedStatus(statusValue);
  const isAuthenticating = isAuthenticatingStatus(statusValue);
  const waitMessage = status?.qr_wait_warning
    ? 'WhatsApp esta tardando mas de lo normal. Puedes esperar un momento o usar Reconectar.'
    : statusInfo.description;
  const placeholderMessage = isConnected
    ? 'Sesion conectada'
    : isAuthenticating || isQrFlow
      ? waitMessage
      : statusInfo.description;

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
          <>
            <img alt="QR de WhatsApp" src={status.qrImage ?? status.qr_image} />
            {qrTimeRemaining ? <small className="whatsapp-qr-expiration">Expira en {qrTimeRemaining}</small> : null}
          </>
        ) : (
          <div className={`qr-placeholder large ${isConnected ? 'connected' : isAuthenticating || isQrFlow ? 'waiting' : ''}`}>
            {isConnected ? (
              <CheckCircle2 className="qr-status-icon" size={56} aria-hidden="true" />
            ) : isAuthenticating || isQrFlow ? (
              <LoaderCircle className="qr-status-spinner" size={56} aria-hidden="true" />
            ) : (
              <QrCode size={42} aria-hidden="true" />
            )}
            <span>{placeholderMessage}</span>
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
  const [status, setStatus] = useState(null);
  const isLoadingStatusRef = useRef(false);
  const socketRef = useRef(null);

  const selectedCompanyId = canSelectCompany ? empresaId : undefined;
  const showTechnicalDetails = shouldShowTechnicalDetails(user);
  const statusInfo = getStatusInfo(status);
  const statusValue = getStatusValue(status);
  const hasQr = Boolean(status?.qrImage ?? status?.qr_image);
  const isQrFlow = ['initializing', 'qr', 'authenticated', 'INITIALIZING', 'WAITING_QR', 'QR_READY', 'AUTHENTICATED'].includes(statusValue);
  const pollingInterval = getPollingInterval(statusValue);
  const canAct = Boolean(user) && !isBusy && (!canSelectCompany || empresaId);
  const canStart = canAct && ['idle', 'destroyed'].includes(statusValue);
  const canRestart = canAct && ['failed', 'disconnected'].includes(statusValue);
  const canDisconnect = canAct && !['idle', 'destroyed'].includes(statusValue);
  const qrTimeRemaining = formatTimeRemaining(status?.qr_expires_at);

  async function loadCompanies() {
    if (!user || !canSelectCompany) {
      return;
    }

    setCompanies(await fetchCompanies());
  }

  async function loadStatus() {
    if (isLoadingStatusRef.current) {
      return;
    }

    if (!user) {
      setStatus(null);
      return;
    }

    if (canSelectCompany && !empresaId) {
      setStatus(null);
      return;
    }

    try {
      isLoadingStatusRef.current = true;
      const nextStatus = await fetchWhatsappStatus(selectedCompanyId);
      const nextStatusValue = getStatusValue(nextStatus);
      const qr = shouldFetchQrForStatus(nextStatusValue) ? await fetchWhatsappQr(selectedCompanyId) : null;
      setStatus({
        ...nextStatus,
        qrImage: qr?.qrImage ?? nextStatus.qrImage ?? null,
        qr_image: qr?.qrImage ?? nextStatus.qrImage ?? null,
        qr_available: Boolean(qr?.qrImage ?? nextStatus.qrImage),
        last_qr_at: qr?.last_qr_at ?? nextStatus.last_qr_at,
        qr_expires_at: qr?.qr_expires_at ?? nextStatus.qr_expires_at,
        qr_wait_warning: qr?.qr_wait_warning ?? nextStatus.qr_wait_warning,
        user_message: qr?.user_message ?? nextStatus.user_message
      });
    } finally {
      isLoadingStatusRef.current = false;
    }
  }

  useEffect(() => {
    loadCompanies().catch((requestError) => setError(getApiError(requestError)));
  }, [canSelectCompany, user]);

  useEffect(() => {
    loadStatus().catch((requestError) => setError(getApiError(requestError)));
  }, [empresaId, canSelectCompany, user]);

  useEffect(() => {
    if (!user || (canSelectCompany && !empresaId) || !pollingInterval) {
      return undefined;
    }

    const timer = setInterval(() => {
      loadStatus().catch((requestError) => setError(getApiError(requestError)));
    }, pollingInterval);

    return () => clearInterval(timer);
  }, [empresaId, canSelectCompany, user, pollingInterval]);

  useEffect(() => {
    const token = getWhatsappSocketToken();

    if (!user || !token || (canSelectCompany && !empresaId)) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return undefined;
    }

    const selectedId = canSelectCompany ? Number(empresaId) : (user?.empresaId ?? user?.empresa?.id);
    const socket = io(resolveSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setError('');

      if (canSelectCompany && selectedId) {
        socket.emit('whatsapp:join', { companyId: selectedId });
      }
    });

    socket.on('whatsapp:status', (payload) => {
      if (selectedId && Number(getStatusCompanyId(payload)) !== Number(selectedId)) {
        return;
      }

      setStatus((currentStatus) => mergeWhatsappStatus(currentStatus, payload));
    });

    socket.on('whatsapp:qr', (payload) => {
      if (selectedId && Number(getStatusCompanyId(payload)) !== Number(selectedId)) {
        return;
      }

      setStatus((currentStatus) => mergeWhatsappStatus(currentStatus, payload));
    });

    socket.on('whatsapp:error', (payload) => {
      if (selectedId && Number(getStatusCompanyId(payload)) !== Number(selectedId)) {
        return;
      }

      setError(payload?.message ?? 'No se pudo actualizar la sesion de WhatsApp.');
    });

    socket.on('connect_error', () => {
      socket.disconnect();
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [canSelectCompany, empresaId, user]);

  async function handleStart() {
    if (!canStart) {
      return;
    }

    try {
      setIsBusy(true);
      setError('');
      setStatus(await startWhatsappSession(selectedCompanyId));
      await loadStatus();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRestart() {
    if (!canRestart) {
      return;
    }

    try {
      setIsBusy(true);
      setError('');
      setStatus(await restartWhatsappSession(selectedCompanyId));
      await loadStatus();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsBusy(false);
    }
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
    if (!canDisconnect) {
      return;
    }

    try {
      setIsBusy(true);
      setError('');
      setStatus(await disconnectWhatsappSession(selectedCompanyId));
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="whatsapp-page">
      {error ? <ErrorState message={error} onRetry={handleRefresh} /> : null}

      <div className="whatsapp-manager">
        <WhatsAppHeader
          canAct={canAct}
          canDisconnect={canDisconnect}
          canRestart={canRestart}
          canSelectCompany={canSelectCompany}
          canStart={canStart}
          companies={companies}
          empresaId={empresaId}
          isBusy={isBusy}
          onCompanyChange={setEmpresaId}
          onDisconnect={handleDisconnect}
          onRefresh={handleRefresh}
          onRestart={handleRestart}
          onStart={handleStart}
          user={user}
        />

        <WhatsAppMetrics hasQr={hasQr} status={status} />

        <section className="whatsapp-console-grid">
          <QRPanel hasQr={hasQr} isQrFlow={isQrFlow} qrTimeRemaining={qrTimeRemaining} status={status} statusInfo={statusInfo} />
          <div className="whatsapp-console-side">
            <StatusOverview hasQr={hasQr} showTechnicalDetails={showTechnicalDetails} status={status} />
          </div>
        </section>
      </div>
    </div>
  );
}
