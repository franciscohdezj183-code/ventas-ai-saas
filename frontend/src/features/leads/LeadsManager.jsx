import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import { createLead, deleteLead, fetchLeads, fetchLeadStats, updateLead } from './leadsApi.js';
import { LeadForm } from './LeadForm.jsx';
import { LeadStats } from './LeadStats.jsx';
import { LeadTable } from './LeadTable.jsx';

const emptyStats = {
  total: 0,
  nuevo: 0,
  en_proceso: 0,
  ganado: 0,
  perdido: 0
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function LeadsManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [companies, setCompanies] = useState([]);
  const [editingLead, setEditingLead] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(emptyStats);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextLeads, nextStats, nextCompanies] = await Promise.all([
        fetchLeads(),
        fetchLeadStats(),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);
      setLeads(nextLeads);
      setStats(nextStats);
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

      if (editingLead) {
        await updateLead(editingLead.id, payload);
      } else {
        await createLead(payload);
      }

      setEditingLead(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(lead) {
    const shouldDelete = window.confirm(`Eliminar lead de ${lead.nombre_cliente}?`);

    if (!shouldDelete) {
      return;
    }

    try {
      setError('');
      await deleteLead(lead.id);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <div className="companies-manager">
      {error ? <div className="form-alert">{error}</div> : null}

      <LeadStats stats={stats} />

      <LeadForm
        canSelectCompany={canSelectCompany}
        companies={companies}
        isSaving={isSaving}
        lead={editingLead}
        onCancel={() => setEditingLead(null)}
        onSubmit={handleSubmit}
      />

      <LeadTable
        isLoading={isLoading}
        leads={leads}
        onDelete={handleDelete}
        onEdit={setEditingLead}
      />
    </div>
  );
}
