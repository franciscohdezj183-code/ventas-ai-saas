import { useEffect, useMemo, useState } from 'react';
import { Filter, Plus, Search, ShieldCheck, UserRound, Users } from 'lucide-react';
import { ConfirmModal, ErrorState } from '../../components/ui/index.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import { createUser, deleteUser, fetchUsers, updateUser } from './usersApi.js';
import { UserForm } from './UserForm.jsx';
import { UserTable } from './UserTable.jsx';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

const initialFilters = {
  query: '',
  empresa_id: '',
  rol: '',
  estado: ''
};

export function UsersManager() {
  const [companies, setCompanies] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [users, setUsers] = useState([]);

  const stats = useMemo(() => {
    const active = users.filter((user) => user.estado === 'ACTIVO').length;
    const admins = users.filter((user) => user.rol === 'SUPER_ADMIN').length;

    return {
      total: users.length,
      active,
      inactive: users.length - active,
      admins
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return users.filter((user) => {
      const email = user.correo || user.email || '';
      const matchesQuery =
        !query ||
        user.nombre?.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query) ||
        user.empresa_nombre?.toLowerCase().includes(query);
      const matchesCompany = !filters.empresa_id || String(user.empresa_id) === String(filters.empresa_id);
      const matchesRole = !filters.rol || user.rol === filters.rol;
      const matchesStatus = !filters.estado || user.estado === filters.estado;

      return matchesQuery && matchesCompany && matchesRole && matchesStatus;
    });
  }, [filters, users]);

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
        correo: user.correo || user.email,
        rol: user.rol,
        empresa_id: user.empresa_id,
        estado: user.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
      });
      setPendingToggle(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="resource-page users-page">
      <div className="users-unified-header">
        <div>
          <span className="users-header-icon">
            <Users size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Accesos</p>
            <h1>Usuarios</h1>
            <p>Administra accesos, roles, empresas y estado de operacion del panel.</p>
          </div>
        </div>
        <div>
          <button
            className="primary-button"
            onClick={() => {
              setEditingUser(null);
              setIsFormOpen(true);
            }}
            type="button"
          >
            <Plus size={18} aria-hidden="true" />
            Nuevo usuario
          </button>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}

      <div className="users-summary-grid">
        <article className="user-summary-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
          <p>Usuarios con acceso registrado.</p>
        </article>
        <article className="user-summary-card active">
          <span>Activos</span>
          <strong>{stats.active}</strong>
          <p>Usuarios habilitados para operar.</p>
        </article>
        <article className="user-summary-card inactive">
          <span>Inactivos</span>
          <strong>{stats.inactive}</strong>
          <p>Accesos pausados temporalmente.</p>
        </article>
        <article className="user-summary-card admin">
          <span>SUPER_ADMIN</span>
          <strong>{stats.admins}</strong>
          <p>Usuarios con administracion global.</p>
        </article>
      </div>

      <section className="panel-section users-directory-panel">
        <div className="users-toolbar">
          <label className="product-search" htmlFor="users-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="users-search"
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar usuario, correo o empresa"
              type="search"
              value={filters.query}
            />
          </label>

          <div className="user-filter-group">
            <Filter size={18} aria-hidden="true" />
            <select
              aria-label="Empresa"
              onChange={(event) => setFilters((current) => ({ ...current, empresa_id: event.target.value }))}
              value={filters.empresa_id}
            >
              <option value="">Todas las empresas</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nombre}
                </option>
              ))}
            </select>
            <select
              aria-label="Rol"
              onChange={(event) => setFilters((current) => ({ ...current, rol: event.target.value }))}
              value={filters.rol}
            >
              <option value="">Todos los roles</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              <option value="OWNER">OWNER</option>
            </select>
            <select
              aria-label="Estado"
              onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
              value={filters.estado}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVO">ACTIVO</option>
              <option value="INACTIVO">INACTIVO</option>
            </select>
          </div>

          <span className="users-visible-count">
            {filteredUsers.length} de {users.length} visibles
          </span>
        </div>

        <UserTable
          isLoading={isLoading}
          onDelete={setPendingDelete}
          onEdit={(user) => {
            setEditingUser(user);
            setIsFormOpen(true);
          }}
          onToggle={setPendingToggle}
          users={filteredUsers}
        />
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide" role="dialog" aria-modal="true" aria-labelledby="user-form-title">
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
                {editingUser?.rol === 'SUPER_ADMIN' ? (
                  <ShieldCheck size={22} aria-hidden="true" />
                ) : (
                  <UserRound size={22} aria-hidden="true" />
                )}
              </span>
              <div>
                <p className="eyebrow">Usuario</p>
                <h2 id="user-form-title">{editingUser ? 'Editar usuario' : 'Nuevo usuario'}</h2>
                <p>Define quien puede operar el panel y a que empresa pertenece.</p>
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
        confirmLabel={pendingToggle?.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
        description={
          pendingToggle?.estado === 'ACTIVO'
            ? `Se pausara el acceso de ${pendingToggle?.nombre ?? 'este usuario'} sin eliminarlo.`
            : `Se reactivara el acceso de ${pendingToggle?.nombre ?? 'este usuario'}.`
        }
        onCancel={() => setPendingToggle(null)}
        onConfirm={() => handleToggle(pendingToggle)}
        open={Boolean(pendingToggle)}
        title={pendingToggle?.estado === 'ACTIVO' ? 'Desactivar usuario' : 'Activar usuario'}
      />
    </div>
  );
}
