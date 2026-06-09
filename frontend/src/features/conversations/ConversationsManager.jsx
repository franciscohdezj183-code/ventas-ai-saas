import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  createConversation,
  deleteConversation,
  fetchConversations,
  updateConversation
} from './conversationsApi.js';
import { ConversationFilters } from './ConversationFilters.jsx';
import { ConversationForm } from './ConversationForm.jsx';
import { ConversationTable } from './ConversationTable.jsx';

const initialFilters = {
  telefono_cliente: '',
  empresa_id: ''
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function ConversationsManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [companies, setCompanies] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [editingConversation, setEditingConversation] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadData(nextFilters = filters) {
    try {
      setIsLoading(true);
      setError('');
      const requestFilters = {
        telefono_cliente: nextFilters.telefono_cliente || undefined,
        empresa_id: canSelectCompany && nextFilters.empresa_id ? nextFilters.empresa_id : undefined
      };
      const [nextConversations, nextCompanies] = await Promise.all([
        fetchConversations(requestFilters),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);
      setConversations(nextConversations);
      setCompanies(nextCompanies);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData(initialFilters);
  }, [canSelectCompany]);

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value
    }));
  }

  function handleSearch(event) {
    event.preventDefault();
    loadData(filters);
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
      await loadData(filters);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(conversation) {
    const shouldDelete = window.confirm(`Eliminar conversacion ${conversation.id}?`);

    if (!shouldDelete) {
      return;
    }

    try {
      setError('');
      await deleteConversation(conversation.id);
      await loadData(filters);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <div className="companies-manager">
      {error ? <div className="form-alert">{error}</div> : null}

      <ConversationFilters
        canSelectCompany={canSelectCompany}
        companies={companies}
        filters={filters}
        onChange={handleFilterChange}
        onSearch={handleSearch}
      />

      <ConversationForm
        canSelectCompany={canSelectCompany}
        companies={companies}
        conversation={editingConversation}
        isSaving={isSaving}
        onCancel={() => setEditingConversation(null)}
        onSubmit={handleSubmit}
      />

      <ConversationTable
        conversations={conversations}
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={setEditingConversation}
      />
    </div>
  );
}
