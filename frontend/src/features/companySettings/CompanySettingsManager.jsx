import { useEffect, useMemo, useState } from 'react';
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

    const shouldDelete = window.confirm('Restablecer la configuracion personalizada de esta empresa?');

    if (!shouldDelete) {
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
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="empty-state">Cargando configuracion...</div>;
  }

  return (
    <div className="companies-manager">
      {error ? <div className="form-alert">{error}</div> : null}

      <CompanySettingsForm
        canSelectCompany={canSelectCompany}
        companies={companies}
        isSaving={isSaving}
        onCompanyChange={handleCompanyChange}
        onDelete={handleDelete}
        onSubmit={handleSubmit}
        settings={selectedSettings}
      />
    </div>
  );
}
