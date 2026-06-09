import { useEffect, useState } from 'react';
import { CompanyForm } from './CompanyForm.jsx';
import { CompanyTable } from './CompanyTable.jsx';
import {
  createCompany,
  deleteCompany,
  fetchCompanies,
  updateCompany
} from './companiesApi.js';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function CompaniesManager() {
  const [companies, setCompanies] = useState([]);
  const [editingCompany, setEditingCompany] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadCompanies() {
    try {
      setIsLoading(true);
      setError('');
      setCompanies(await fetchCompanies());
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingCompany) {
        await updateCompany(editingCompany.id, payload);
      } else {
        await createCompany(payload);
      }

      setEditingCompany(null);
      await loadCompanies();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(company) {
    const shouldDelete = window.confirm(`Eliminar ${company.nombre}?`);

    if (!shouldDelete) {
      return;
    }

    try {
      setError('');
      await deleteCompany(company.id);
      await loadCompanies();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <div className="companies-manager">
      {error ? <div className="form-alert">{error}</div> : null}

      <CompanyForm
        company={editingCompany}
        isSaving={isSaving}
        onCancel={() => setEditingCompany(null)}
        onSubmit={handleSubmit}
      />

      <CompanyTable
        companies={companies}
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={setEditingCompany}
      />
    </div>
  );
}
