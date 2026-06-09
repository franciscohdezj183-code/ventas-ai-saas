import { useEffect, useState } from 'react';
import { MessageCircle, Power, QrCode, RefreshCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { AIStatusCard } from '../ai/AIStatusCard.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  disconnectWhatsappSession,
  fetchWhatsappQr,
  fetchWhatsappStatus,
  startWhatsappSession
} from './whatsappApi.js';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function WhatsAppManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [companies, setCompanies] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const selectedCompanyId = canSelectCompany ? empresaId : undefined;

  async function loadCompanies() {
    if (!canSelectCompany) {
      return;
    }

    setCompanies(await fetchCompanies());
  }

  async function loadStatus() {
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
  }, [canSelectCompany]);

  useEffect(() => {
    loadStatus().catch((requestError) => setError(getApiError(requestError)));
  }, [empresaId, canSelectCompany]);

  async function handleStart() {
    try {
      setIsBusy(true);
      setError('');
      await startWhatsappSession(selectedCompanyId);
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
    <div className="whatsapp-manager">
      {error ? <div className="form-alert">{error}</div> : null}

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
        ) : null}

        <div className="whatsapp-actions">
          <button
            className="primary-button"
            disabled={isBusy || (canSelectCompany && !empresaId)}
            onClick={handleStart}
            type="button"
          >
            <MessageCircle size={18} aria-hidden="true" />
            Iniciar sesion
          </button>
          <button
            className="secondary-button"
            disabled={isBusy || (canSelectCompany && !empresaId)}
            onClick={handleRefresh}
            type="button"
          >
            <RefreshCcw size={18} aria-hidden="true" />
            Actualizar
          </button>
          <button
            className="secondary-button"
            disabled={isBusy || (canSelectCompany && !empresaId)}
            onClick={handleDisconnect}
            type="button"
          >
            <Power size={18} aria-hidden="true" />
            Desconectar
          </button>
        </div>
      </div>

      <section className="whatsapp-status-grid">
        <AIStatusCard />

        <article className="whatsapp-status-card">
          <QrCode size={22} aria-hidden="true" />
          <div>
            <span>Estado</span>
            <strong>{status?.status ?? 'DISCONNECTED'}</strong>
            <small>{status?.last_error ?? 'Sesion por empresa con reconexion automatica.'}</small>
          </div>
        </article>

        <article className="whatsapp-qr-card">
          {status?.qr_image ? (
            <img alt="QR de WhatsApp" src={status.qr_image} />
          ) : (
            <div className="qr-placeholder">QR no disponible</div>
          )}
          <p>Escanea este codigo desde WhatsApp para vincular la empresa seleccionada.</p>
        </article>
      </section>
    </div>
  );
}
