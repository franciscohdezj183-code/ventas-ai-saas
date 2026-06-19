import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  Clock3,
  MessageCircle,
  Phone,
  Power,
  QrCode,
  RefreshCcw,
  RotateCcw,
  ShieldCheck
} from 'lucide-react';
import { ErrorState, StatusBadge } from '../../components/ui/index.js';
import { Can } from '../../components/Can.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isSuperAdminRole } from '../../config/permissions.js';
import { AIStatusCard } from '../ai/AIStatusCard.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  disconnectWhatsappSession,
  fetchWhatsappQr,
  fetchWhatsappStatus,
  startWhatsappSession
} from './whatsappApi.js';

const statusCopy = {
  CONNECTED: {
    label: 'Conectado',
    tone: 'connected',
    icon: CheckCircle2,
    description: 'WhatsApp esta listo para responder mensajes de clientes.'
  },
  QR_READY: {
    label: 'Esperando QR',
    tone: 'scanning',
    icon: QrCode,
    description: 'Escanea el codigo con WhatsApp para completar la vinculacion.'
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
    description: 'Estamos intentando recuperar la sesion. Si tarda demasiado, genera un QR nuevo.'
  },
  LOADING_SCREEN: {
    label: 'Reconectando',
    tone: 'scanning',
    icon: RefreshCcw,
    description: 'WhatsApp esta cargando la sesion del navegador.'
  },
  AUTH_FAILED: {
    label: 'Error',
    tone: 'error',
    icon: AlertTriangle,
    description: 'No se pudo autenticar la sesion. Reinicia y escanea un QR nuevo.'
  },
  DISCONNECTED: {
    label: 'Desconectado',
    tone: 'disconnected',
    icon: CircleOff,
    description: 'WhatsApp no esta conectado. Inicia sesion para activar la atencion automatica.'
  }
};

const connectionSteps = [
  'Haz clic en Conectar o Reconectar.',
  'Espera a que aparezca el codigo QR en pantalla.',
  'Abre WhatsApp en el telefono del negocio.',
  'Entra a Dispositivos vinculados y escanea el codigo.',
  'Manten el telefono con internet para conservar la sesion.'
];

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function getStatusInfo(status) {
  const value = String(status?.status ?? 'DISCONNECTED').toUpperCase();
  return statusCopy[value] ?? statusCopy.DISCONNECTED;
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

function buildTimeline(status) {
  const events = Array.isArray(status?.events) ? status.events : [];

  if (events.length > 0) {
    return events;
  }

  return [
    status?.last_error
      ? { type: 'ERROR', message: status.last_error, at: status.updated_at }
      : null,
    status?.connected_at
      ? { type: 'CONNECTED', message: 'WhatsApp conectado correctamente', at: status.connected_at }
      : null,
    status?.updated_at
      ? { type: status.status ?? 'DISCONNECTED', message: `Estado actualizado: ${status.status ?? 'DISCONNECTED'}`, at: status.updated_at }
      : null
  ].filter(Boolean);
}

function StatusHero({ status }) {
  const info = getStatusInfo(status);
  const Icon = info.icon;

  return (
    <article className={`whatsapp-main-card ${info.tone}`}>
      <div className="whatsapp-main-status">
        <span className="whatsapp-main-icon">
          <Icon size={28} aria-hidden="true" />
        </span>
        <div>
          <h2>{info.label}</h2>
          <p>{status?.last_error && info.tone === 'error' ? status.last_error : info.description}</p>
        </div>
      </div>

      <div className="whatsapp-main-meta">
        <div>
          <span>Ultima conexion</span>
          <strong>{formatDateTime(status?.connected_at)}</strong>
        </div>
        <div>
          <span>Numero conectado</span>
          <strong>{formatPhone(status?.phone ?? status?.number ?? status?.telefono)}</strong>
        </div>
        <div>
          <span>Ultima actualizacion</span>
          <strong>{formatDateTime(status?.updated_at)}</strong>
        </div>
      </div>
    </article>
  );
}

function ConnectionSteps() {
  return (
    <article className="whatsapp-steps-card">
      <div>
        <h3>Como conectar el canal</h3>
        <p>Sigue estos pasos con el telefono que atendera las conversaciones del negocio.</p>
      </div>
      <ol>
        {connectionSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="whatsapp-user-warning">
        <AlertTriangle size={18} aria-hidden="true" />
        <span>No cierres esta pantalla mientras escaneas. Si el QR vence, usa Reconectar para generar uno nuevo.</span>
      </div>
    </article>
  );
}

function Timeline({ events }) {
  if (events.length === 0) {
    return (
      <div className="whatsapp-empty-note">
        <Clock3 size={18} aria-hidden="true" />
        <span>Los eventos de conexion apareceran aqui cuando inicies una sesion.</span>
      </div>
    );
  }

  return (
    <div className="whatsapp-timeline">
      {events.map((event, index) => (
        <article className="whatsapp-timeline-item" key={`${event.type}-${event.at}-${index}`}>
          <span />
          <div>
            <strong>{event.message}</strong>
            <small>
              <StatusBadge status={event.type}>{event.type}</StatusBadge>
              {formatDateTime(event.at)}
            </small>
          </div>
        </article>
      ))}
    </div>
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

  const selectedCompanyId = canSelectCompany ? empresaId : undefined;
  const statusInfo = getStatusInfo(status);
  const statusValue = String(status?.status ?? 'DISCONNECTED').toUpperCase();
  const timeline = useMemo(() => buildTimeline(status), [status]);
  const hasQr = Boolean(status?.qr_image);
  const isQrFlow = ['INITIALIZING', 'QR_READY', 'AUTHENTICATED'].includes(statusValue);
  const canAct = Boolean(user) && !isBusy && (!canSelectCompany || empresaId);

  async function loadCompanies() {
    if (!user) {
      return;
    }

    if (!canSelectCompany) {
      return;
    }

    setCompanies(await fetchCompanies());
  }

  async function loadStatus() {
    if (!user) {
      setStatus(null);
      return;
    }

    if (canSelectCompany && !empresaId) {
      setStatus(null);
      return;
    }

    const nextStatus = await fetchWhatsappStatus(selectedCompanyId);
    const qr = await fetchWhatsappQr(selectedCompanyId);
    setStatus({ ...nextStatus, qr_image: qr.qr_image });
  }

  useEffect(() => {
    loadCompanies().catch((requestError) => setError(getApiError(requestError)));
  }, [canSelectCompany, user]);

  useEffect(() => {
    loadStatus().catch((requestError) => setError(getApiError(requestError)));
  }, [empresaId, canSelectCompany, user]);

  async function handleStart() {
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
    try {
      setIsBusy(true);
      setError('');
      await disconnectWhatsappSession(selectedCompanyId);
      setStatus(await startWhatsappSession(selectedCompanyId));
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
        <div className="whatsapp-toolbar">
          {canSelectCompany ? (
            <label className="field-group" htmlFor="whatsapp-company">
              <span>Empresa</span>
              <select
                id="whatsapp-company"
                onChange={(event) => setEmpresaId(event.target.value)}
                value={empresaId}
              >
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
              <button className="primary-button" disabled={!canAct} onClick={handleStart} type="button">
                <MessageCircle size={18} aria-hidden="true" />
                Conectar
              </button>
            </Can>
            <Can permission="whatsapp.manage">
              <button className="secondary-button" disabled={!canAct} onClick={handleRestart} type="button">
                <RotateCcw size={18} aria-hidden="true" />
                Reconectar
              </button>
            </Can>
            <Can permission="whatsapp.manage">
              <button className="secondary-button" disabled={!canAct} onClick={handleDisconnect} type="button">
                <Power size={18} aria-hidden="true" />
                Desconectar
              </button>
            </Can>
            <button className="icon-button bordered" disabled={!canAct} onClick={handleRefresh} type="button" aria-label="Actualizar estado">
              <RefreshCcw size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <StatusHero status={status} />

        <div className="whatsapp-operational-grid">
          <article className="whatsapp-qr-card large">
            <div className="whatsapp-qr-header">
              <div>
                <h3>{hasQr ? 'Escanea este QR' : 'QR de conexion'}</h3>
                <p>
                  {hasQr
                    ? 'Abre WhatsApp en tu telefono y escanea el codigo.'
                    : 'Presiona iniciar sesion para generar un codigo QR nuevo.'}
                </p>
              </div>
              <StatusBadge status={status?.status ?? 'DISCONNECTED'}>{statusInfo.label}</StatusBadge>
            </div>

            {hasQr ? (
              <img alt="QR de WhatsApp" src={status.qr_image} />
            ) : (
              <div className={isQrFlow ? 'qr-placeholder large waiting' : 'qr-placeholder large'}>
                <QrCode size={42} aria-hidden="true" />
                <span>{isQrFlow ? 'Generando QR...' : 'Sin QR activo'}</span>
              </div>
            )}

            {hasQr ? (
              <div className="whatsapp-warning">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>Escanea el QR desde el telefono que quedara conectado al negocio.</span>
              </div>
            ) : null}
          </article>

          <div className="whatsapp-side-stack">
            <ConnectionSteps />

            <article className="whatsapp-detail-card compact">
              <h3>Informacion de sesion</h3>
              <dl>
                <div>
                  <dt>Estado tecnico</dt>
                  <dd>{status?.status ?? 'DISCONNECTED'}</dd>
                </div>
                <div>
                  <dt>Numero conectado</dt>
                  <dd>{formatPhone(status?.phone ?? status?.number ?? status?.telefono)}</dd>
                </div>
                <div>
                  <dt>Ultimo error</dt>
                  <dd>{status?.last_error ?? 'Sin errores recientes'}</dd>
                </div>
              </dl>
            </article>

            <AIStatusCard />
          </div>
        </div>

        <article className="whatsapp-detail-card">
          <h3>Eventos recientes</h3>
          <Timeline events={timeline} />
        </article>
      </div>
    </div>
  );
}
