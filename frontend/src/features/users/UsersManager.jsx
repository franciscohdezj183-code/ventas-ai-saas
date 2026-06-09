import { useEffect, useState } from 'react';
import { fetchCompanies } from '../companies/companiesApi.js';
import { createUser, deleteUser, fetchUsers, updateUser } from './usersApi.js';
import { UserForm } from './UserForm.jsx';
import { UserTable } from './UserTable.jsx';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

export function UsersManager() {
  const [companies, setCompanies] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [users, setUsers] = useState([]);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextUsers, nextCompanies] = await Promise.all([fetchUsers(), fetchCompanies()]);
      setUsers(nextUsers);
      setCompanies(nextCompanies);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingUser) {
        await updateUser(editingUser.id, payload);
      } else {
        await createUser(payload);
      }

      setEditingUser(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(user) {
    const shouldDelete = window.confirm(`Eliminar ${user.nombre}?`);

    if (!shouldDelete) {
      return;
    }

    try {
      setError('');
      await deleteUser(user.id);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  return (
    <div className="companies-manager">
      {error ? <div className="form-alert">{error}</div> : null}

      <UserForm
        companies={companies}
        isSaving={isSaving}
        onCancel={() => setEditingUser(null)}
        onSubmit={handleSubmit}
        user={editingUser}
      />

      <UserTable
        isLoading={isLoading}
        onDelete={handleDelete}
        onEdit={setEditingUser}
        users={users}
      />
    </div>
  );
}
