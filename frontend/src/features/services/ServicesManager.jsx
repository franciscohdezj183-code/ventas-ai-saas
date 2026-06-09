import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import { createService, deleteService, fetchServices, updateService } from './servicesApi.js';
import { ServiceForm } from './ServiceForm.jsx';
import { ServiceTable } from './ServiceTable.jsx';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function ServicesManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [companies, setCompanies] = useState([]);
  const [editingService, setEditingService] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [services, setServices] = useState([]);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextServices, nextCompanies] = await Promise.all([
        fetchServices(),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);
      setServices(nextServices);
      setCompanies(nextCompanies);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [canSelectCompany]);

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingService) {
        await updateService(editingService.id, payload);
      } else {
        await createService(payload);
      }

      setEditingService(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(service) {
    const shouldDelete = window.confirm(`Eliminar ${service.nombre}?`);

    if (!shouldDelete) {
      return;
    }

    try {
      setError('');
      await deleteService(service.id);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <div className="companies-manager">
      {error ? <div className="form-alert">{error}</div> : null}

      <ServiceForm
        canSelectCompany={canSelectCompany}
        companies={companies}
        isSaving={isSaving}
        onCancel={() => setEditingService(null)}
        onSubmit={handleSubmit}
        service={editingService}
      />

      <ServiceTable
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={setEditingService}
        services={services}
      />
    </div>
  );
}
