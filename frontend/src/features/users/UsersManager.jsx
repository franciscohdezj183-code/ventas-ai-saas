import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, UserRound } from 'lucide-react';
import { ConfirmModal } from '../../components/ui/index.js';
import { isSuperAdminRole, normalizeRole } from '../../config/permissions.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import { createUser, deleteUser, fetchUsers, updateUser } from './usersApi.js';
import { GlobalUsersPage } from './GlobalUsersPage.jsx';
import { UserForm } from './UserForm.jsx';

const initialFilters = {
  query: '',
  empresa_id: '',
  rol: '',
  estado: '',
  sort: 'created_desc',
  pageSize: 8
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function getEmail(user) {
  return user?.correo || user?.email || '';
}

function getCompanyName(user) {
  return user?.empresa_nombre || user?.empresa?.nombre || '';
}

function getCreatedTime(user) {
  const value = user?.fecha_creacion || user?.created_at || user?.createdAt || '';
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function getLastAccessTime(user) {
  const value = user?.ultimo_acceso || user?.last_login || user?.lastLogin || user?.updated_at || '';
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function getStatus(user) {
  return user?.estado === 'ACTIVO' ? 'ACTIVO' : 'INACTIVO';
}

function sortUsers(users, sort) {
  const nextUsers = [...users];

  return nextUsers.sort((firstUser, secondUser) => {
    if (sort === 'name_asc') {
      return String(firstUser.nombre || '').localeCompare(String(secondUser.nombre || ''), 'es');
    }

    if (sort === 'name_desc') {
      return String(secondUser.nombre || '').localeCompare(String(firstUser.nombre || ''), 'es');
    }

    if (sort === 'created_asc') {
      return getCreatedTime(firstUser) - getCreatedTime(secondUser);
    }

    if (sort === 'last_access_desc') {
      return getLastAccessTime(secondUser) - getLastAccessTime(firstUser);
    }

    return getCreatedTime(secondUser) - getCreatedTime(firstUser);
  });
}

export function UsersManager() {
  const [companies, setCompanies] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingUser, setEditingUser] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);

  const stats = useMemo(() => {
    const active = users.filter((user) => getStatus(user) === 'ACTIVO').length;
    const admins = users.filter((user) => isSuperAdminRole(user.rol)).length;

    return {
      total: users.length,
      active,
      inactive: users.length - active,
      admins
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    const nextUsers = users.filter((user) => {
      const matchesQuery =
        !query ||
        String(user.nombre || '').toLowerCase().includes(query) ||
        getEmail(user).toLowerCase().includes(query) ||
        getCompanyName(user).toLowerCase().includes(query);
      const matchesCompany = !filters.empresa_id || String(user.empresa_id) === String(filters.empresa_id);
      const matchesRole = !filters.rol || normalizeRole(user.rol) === normalizeRole(filters.rol);
      const matchesStatus = !filters.estado || getStatus(user) === filters.estado;

      return matchesQuery && matchesCompany && matchesRole && matchesStatus;
    });

    return sortUsers(nextUsers, filters.sort);
  }, [filters, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / filters.pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedUsers = useMemo(() => {
    const start = (safePage - 1) * filters.pageSize;
    return filteredUsers.slice(start, start + filters.pageSize);
  }, [filteredUsers, filters.pageSize, safePage]);

  const hasFilters = Boolean(filters.query || filters.empresa_id || filters.rol || filters.estado || filters.sort !== initialFilters.sort);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextUsers, nextCompanies] = await Promise.all([fetchUsers(), fetchCompanies()]);
      setUsers(Array.isArray(nextUsers) ? nextUsers : []);
      setCompanies(Array.isArray(nextCompanies) ? nextCompanies : []);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function handleFilterChange(name, value) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]: value
    }));
    setCurrentPage(1);
  }

  function handleClearFilters() {
    setFilters(initialFilters);
    setCurrentPage(1);
  }

  function handleCreate() {
    setEditingUser(null);
    setIsFormOpen(true);
  }

  function handleEdit(user) {
    setSelectedUser(null);
    setEditingUser(user);
    setIsFormOpen(true);
  }

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
      setIsFormOpen(false);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(user) {
    if (!user) {
      return;
    }

    try {
      setError('');
      await deleteUser(user.id);
      setPendingDelete(null);
      setSelectedUser(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function handleToggle(user) {
    if (!user) {
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await updateUser(user.id, {
        nombre: user.nombre,
        correo: getEmail(user),
        rol: user.rol,
        empresa_id: user.empresa_id,
        estado: getStatus(user) === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
      });
      setPendingToggle(null);
      setSelectedUser(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <GlobalUsersPage
        companies={companies}
        currentPage={safePage}
        error={error}
        filters={filters}
        hasFilters={hasFilters}
        isLoading={isLoading}
        onClearFilters={handleClearFilters}
        onCreate={handleCreate}
        onDelete={setPendingDelete}
        onEdit={handleEdit}
        onFilterChange={handleFilterChange}
        onPageChange={setCurrentPage}
        onRefresh={loadData}
        onToggle={setPendingToggle}
        onView={setSelectedUser}
        pageSize={filters.pageSize}
        paginatedUsers={paginatedUsers}
        selectedUser={selectedUser}
        stats={stats}
        totalFiltered={filteredUsers.length}
        usersTotal={users.length}
      />

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide global-users-form-modal" role="dialog" aria-modal="true" aria-labelledby="user-form-title">
            <button
              className="modal-close icon-button"
              onClick={() => {
                setEditingUser(null);
                setIsFormOpen(false);
              }}
              type="button"
              aria-label="Cerrar formulario"
            >
              x
            </button>
            <div className="catalog-modal-header">
              <span>
                {isSuperAdminRole(editingUser?.rol) ? (
                  <ShieldCheck size={22} aria-hidden="true" />
                ) : (
                  <UserRound size={22} aria-hidden="true" />
                )}
              </span>
              <div>
                <p className="eyebrow">Usuario global</p>
                <h2 id="user-form-title">{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</h2>
                <p>Define quien puede operar el panel, su rol y la empresa vinculada.</p>
              </div>
            </div>
            <UserForm
              companies={companies}
              isSaving={isSaving}
              onCancel={() => {
                setEditingUser(null);
                setIsFormOpen(false);
              }}
              onSubmit={handleSubmit}
              user={editingUser}
            />
          </article>
        </div>
      ) : null}

      <ConfirmModal
        destructive
        confirmLabel="Eliminar"
        description={`Se eliminara el acceso de ${pendingDelete?.nombre ?? 'este usuario'}.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => handleDelete(pendingDelete)}
        open={Boolean(pendingDelete)}
        title="Eliminar usuario"
      />

      <ConfirmModal
        confirmLabel={getStatus(pendingToggle) === 'ACTIVO' ? 'Desactivar' : 'Activar'}
        description={
          getStatus(pendingToggle) === 'ACTIVO'
            ? `Se pausara el acceso de ${pendingToggle?.nombre ?? 'este usuario'} sin eliminarlo.`
            : `Se reactivara el acceso de ${pendingToggle?.nombre ?? 'este usuario'}.`
        }
        onCancel={() => setPendingToggle(null)}
        onConfirm={() => handleToggle(pendingToggle)}
        open={Boolean(pendingToggle)}
        title={getStatus(pendingToggle) === 'ACTIVO' ? 'Desactivar usuario' : 'Activar usuario'}
      />
    </>
  );
}
