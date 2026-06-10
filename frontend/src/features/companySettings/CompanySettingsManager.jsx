import { useEffect, useMemo, useState } from 'react';
import { Bot, Building2, MessageSquare, Smartphone } from 'lucide-react';
import { ConfirmModal, ErrorState, LoadingState } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  deleteCompanySetting,
  fetchCompanySetting,
  fetchCompanySettings,
  saveCompanySetting
} from './companySettingsApi.js';
import { CompanySettingsForm } from './CompanySettingsForm.jsx';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function CompanySettingsManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [companies, setCompanies] = useState([]);
  const [settingsList, setSettingsList] = useState([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingReset, setPendingReset] = useState(null);

  const selectedSettings = useMemo(() => {
    if (canSelectCompany) {
      return settingsList.find((settings) => String(settings.empresa_id) === String(selectedEmpresaId)) ?? null;
    }

    return settingsList[0] ?? null;
  }, [canSelectCompany, selectedEmpresaId, settingsList]);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextSettings, nextCompanies] = await Promise.all([
        fetchCompanySettings(),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);

      setSettingsList(nextSettings);
      setCompanies(nextCompanies);

      if (canSelectCompany && !selectedEmpresaId && nextSettings[0]?.empresa_id) {
        setSelectedEmpresaId(String(nextSettings[0].empresa_id));
      }
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [canSelectCompany]);

  async function handleCompanyChange(empresaId) {
    setSelectedEmpresaId(empresaId);

    if (!empresaId || settingsList.some((settings) => String(settings.empresa_id) === String(empresaId))) {
      return;
    }

    try {
      setError('');
      const nextSettings = await fetchCompanySetting(empresaId);
      setSettingsList((currentSettings) => [...currentSettings, nextSettings]);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');
      const savedSettings = await saveCompanySetting(payload);

      setSettingsList((currentSettings) => {
        const exists = currentSettings.some(
          (settings) => String(settings.empresa_id) === String(savedSettings.empresa_id)
        );

        if (!exists) {
          return [...currentSettings, savedSettings];
        }

        return currentSettings.map((settings) =>
          String(settings.empresa_id) === String(savedSettings.empresa_id) ? savedSettings : settings
        );
      });
      setSelectedEmpresaId(String(savedSettings.empresa_id));
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(form) {
    const empresaId = form.empresa_id || selectedSettings?.empresa_id;

    if (!empresaId) {
      return;
    }

    setPendingReset(empresaId);
  }

  async function confirmDelete() {
    const empresaId = pendingReset;

    if (!empresaId) {
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await deleteCompanySetting(empresaId);
      const nextSettings = await fetchCompanySetting(empresaId);

      setSettingsList((currentSettings) =>
        currentSettings.map((settings) =>
          String(settings.empresa_id) === String(empresaId) ? nextSettings : settings
        )
      );
      setPendingReset(null);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <LoadingState message="Cargando configuracion..." />;
  }

  return (
    <div className="resource-page settings-page">
      <div className="settings-unified-header">
        <div>
          <span className="settings-header-icon">
            <Bot size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Operacion</p>
            <h1>Configuracion de empresa</h1>
            <p>Personaliza el bot, politicas comerciales, horarios y canales por empresa.</p>
          </div>
        </div>
        <div className="settings-header-summary">
          <div>
            <Building2 size={18} aria-hidden="true" />
            <span>{selectedSettings?.empresa_nombre ?? 'Empresa'}</span>
          </div>
          <div className={selectedSettings?.activo_ia ? 'active' : ''}>
            <MessageSquare size={18} aria-hidden="true" />
            <span>{selectedSettings?.activo_ia ? 'IA activa' : 'IA pausada'}</span>
          </div>
          <div className={selectedSettings?.activo_whatsapp ? 'active' : ''}>
            <Smartphone size={18} aria-hidden="true" />
            <span>{selectedSettings?.activo_whatsapp ? 'WhatsApp activo' : 'WhatsApp pausado'}</span>
          </div>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}

      <CompanySettingsForm
        canSelectCompany={canSelectCompany}
        companies={companies}
        isSaving={isSaving}
        onCompanyChange={handleCompanyChange}
        onDelete={handleDelete}
        onSubmit={handleSubmit}
        settings={selectedSettings}
      />

      <ConfirmModal
        destructive
        confirmLabel="Restablecer"
        description="Se eliminaran los valores personalizados y se usara la configuracion base."
        onCancel={() => setPendingReset(null)}
        onConfirm={confirmDelete}
        open={Boolean(pendingReset)}
        title="Restablecer configuracion"
      />
    </div>
  );
}
