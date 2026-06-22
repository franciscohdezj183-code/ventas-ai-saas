import {
  Activity,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit3,
  Eye,
  Filter,
  Mail,
  Plus,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import { Can } from '../../components/Can.jsx';

const roleLabels = {
  super_admin: 'Super admin',
  owner: 'Owner',
  seller: 'Seller',
  support: 'Support',
  viewer: 'Viewer'
};

const roleDescriptions = {
  super_admin: 'Control global de la plataforma',
  owner: 'Administracion de empresa',
  seller: 'Ventas y clientes',
  support: 'Soporte y conversaciones',
  viewer: 'Solo lectura'
};

function getEmail(user) {
  return user?.correo || user?.email || 'Sin correo';
}

function getCompanyName(user) {
  return user?.empresa_nombre || user?.empresa?.nombre || 'Sin empresa';
}

function getPhone(user) {
  return user?.telefono || user?.phone || user?.celular || '';
}

function getCreatedAt(user) {
  return user?.fecha_creacion || user?.created_at || user?.createdAt || '';
}

function getLastAccess(user) {
  return user?.ultimo_acceso || user?.last_login || user?.lastLogin || user?.updated_at || '';
}

function getStatus(user) {
  return user?.estado === 'ACTIVO' ? 'ACTIVO' : 'INACTIVO';
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return 'US';
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function formatDate(value) {
  if (!value) {
    return 'Sin registro';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin registro';
  }

  return date.toLocaleDateString('es-MX', { dateStyle: 'medium' });
}

function formatRelative(value) {
  if (!value) {
    return 'Sin acceso';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin acceso';
  }

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / 86400000));

  if (diffDays === 0) {
    return 'Hoy';
  }

  if (diffDays === 1) {
    return 'Ayer';
  }

  if (diffDays < 30) {
    return `Hace ${diffDays} d`;
  }

  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths === 1 ? 'Hace 1 mes' : `Hace ${diffMonths} meses`;
}

function SummaryCard({ detail, icon: Icon, label, tone = '', value }) {
  return (
    <article className={`global-user-kpi ${tone}`}>
      <div className="global-user-kpi-top">
        <span>
          <Icon size={18} aria-hidden="true" />
        </span>
        <small>Activo</small>
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function RoleBadge({ role }) {
  const normalizedRole = String(role || 'viewer').toLowerCase();
  return <span className={`global-user-role ${normalizedRole}`}>{roleLabels[normalizedRole] ?? role}</span>;
}

function StateBadge({ status }) {
  const normalizedStatus = status === 'ACTIVO' ? 'active' : 'inactive';
  return <span className={`global-user-state ${normalizedStatus}`}>{status}</span>;
}

function UserIdentity({ user }) {
  return (
    <div className="global-user-identity">
      <span>{getInitials(user.nombre)}</span>
      <div>
        <strong>{user.nombre || 'Usuario sin nombre'}</strong>
        <small>{getEmail(user)}</small>
      </div>
    </div>
  );
}

function UserActions({ onDelete, onEdit, onToggle, onView, user }) {
  const isActive = getStatus(user) === 'ACTIVO';

  return (
    <div className="global-user-actions">
      <button aria-label="Ver usuario" className="global-user-icon-button" onClick={() => onView(user)} title="Ver detalle" type="button">
        <Eye size={15} aria-hidden="true" />
      </button>
      <Can permission="users.manage">
        <button aria-label="Editar usuario" className="global-user-icon-button" onClick={() => onEdit(user)} title="Editar" type="button">
          <Edit3 size={15} aria-hidden="true" />
        </button>
      </Can>
      <Can permission="users.manage">
        <button
          aria-label={isActive ? 'Desactivar usuario' : 'Activar usuario'}
          className={`global-user-icon-button ${isActive ? 'warning' : 'success'}`}
          onClick={() => onToggle(user)}
          title={isActive ? 'Desactivar' : 'Activar'}
          type="button"
        >
          <Power size={15} aria-hidden="true" />
        </button>
      </Can>
      <Can permission="users.manage">
        <button aria-label="Eliminar usuario" className="global-user-icon-button danger" onClick={() => onDelete(user)} title="Eliminar" type="button">
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </Can>
    </div>
  );
}

function UsersToolbar({ companies, filters, onCreate, onFilterChange, onRefresh, total, visible }) {
  return (
    <section className="global-users-toolbar" aria-label="Filtros de usuarios globales">
      <label className="global-users-search" htmlFor="global-users-search">
        <Search size={17} aria-hidden="true" />
        <input
          id="global-users-search"
          onChange={(event) => onFilterChange('query', event.target.value)}
          placeholder="Buscar por nombre, correo o empresa"
          type="search"
          value={filters.query}
        />
      </label>

      <div className="global-users-filter-strip">
        <span>
          <Filter size={16} aria-hidden="true" />
        </span>
        <select aria-label="Empresa" onChange={(event) => onFilterChange('empresa_id', event.target.value)} value={filters.empresa_id}>
          <option value="">Todas las empresas</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.nombre}
            </option>
          ))}
        </select>
        <select aria-label="Rol" onChange={(event) => onFilterChange('rol', event.target.value)} value={filters.rol}>
          <option value="">Todos los roles</option>
          <option value="super_admin">Super admin</option>
          <option value="owner">Owner</option>
          <option value="seller">Seller</option>
          <option value="support">Support</option>
          <option value="viewer">Viewer</option>
        </select>
        <select aria-label="Estado" onChange={(event) => onFilterChange('estado', event.target.value)} value={filters.estado}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activos</option>
          <option value="INACTIVO">Inactivos</option>
        </select>
        <select aria-label="Orden" onChange={(event) => onFilterChange('sort', event.target.value)} value={filters.sort}>
          <option value="created_desc">Mas recientes</option>
          <option value="created_asc">Mas antiguos</option>
          <option value="name_asc">Nombre A-Z</option>
          <option value="name_desc">Nombre Z-A</option>
          <option value="last_access_desc">Ultimo acceso</option>
        </select>
        <select aria-label="Filas por pagina" onChange={(event) => onFilterChange('pageSize', Number(event.target.value))} value={filters.pageSize}>
          <option value={8}>8 por pagina</option>
          <option value={12}>12 por pagina</option>
          <option value={20}>20 por pagina</option>
        </select>
      </div>

      <div className="global-users-toolbar-actions">
        <span>
          {visible} de {total}
        </span>
        <button className="global-user-secondary-button" onClick={onRefresh} type="button">
          <RefreshCw size={15} aria-hidden="true" />
          Actualizar
        </button>
        <Can permission="users.manage">
          <button className="global-user-primary-button" onClick={onCreate} type="button">
            <Plus size={16} aria-hidden="true" />
            Nuevo usuario
          </button>
        </Can>
      </div>
    </section>
  );
}

function UsersTable({ onDelete, onEdit, onToggle, onView, users }) {
  return (
    <div className="global-users-table-wrap">
      <table className="global-users-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Empresa</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Contacto</th>
            <th>Fecha creacion</th>
            <th>Ultimo acceso</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <UserIdentity user={user} />
              </td>
              <td>
                <div className="global-user-company">
                  <BriefcaseBusiness size={15} aria-hidden="true" />
                  <span>{getCompanyName(user)}</span>
                </div>
              </td>
              <td>
                <RoleBadge role={user.rol} />
              </td>
              <td>
                <StateBadge status={getStatus(user)} />
              </td>
              <td>
                <div className="global-user-contact">
                  <span>{getEmail(user)}</span>
                  <small>{getPhone(user) || 'Sin telefono'}</small>
                </div>
              </td>
              <td>{formatDate(getCreatedAt(user))}</td>
              <td>{formatRelative(getLastAccess(user))}</td>
              <td>
                <UserActions onDelete={onDelete} onEdit={onEdit} onToggle={onToggle} onView={onView} user={user} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsersMobileList({ onDelete, onEdit, onToggle, onView, users }) {
  return (
    <div className="global-users-mobile-list">
      {users.map((user) => (
        <article className="global-user-mobile-card" key={user.id}>
          <div className="global-user-mobile-head">
            <UserIdentity user={user} />
            <StateBadge status={getStatus(user)} />
          </div>
          <div className="global-user-mobile-meta">
            <span>Empresa</span>
            <strong>{getCompanyName(user)}</strong>
            <span>Rol</span>
            <RoleBadge role={user.rol} />
            <span>Contacto</span>
            <strong>{getEmail(user)}</strong>
            <span>Ultimo acceso</span>
            <strong>{formatRelative(getLastAccess(user))}</strong>
          </div>
          <UserActions onDelete={onDelete} onEdit={onEdit} onToggle={onToggle} onView={onView} user={user} />
        </article>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters, onClear, onCreate }) {
  return (
    <section className="global-users-empty">
      <span>
        <Users size={24} aria-hidden="true" />
      </span>
      <h2>{hasFilters ? 'No encontramos usuarios' : 'No hay usuarios registrados'}</h2>
      <p>{hasFilters ? 'Ajusta busqueda, empresa, rol o estado para ampliar los resultados.' : 'Crea el primer acceso para operar el panel por empresa.'}</p>
      <div>
        {hasFilters ? (
          <button className="global-user-secondary-button" onClick={onClear} type="button">
            Limpiar filtros
          </button>
        ) : null}
        <Can permission="users.manage">
          <button className="global-user-primary-button" onClick={onCreate} type="button">
            <Plus size={16} aria-hidden="true" />
            Crear usuario
          </button>
        </Can>
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="global-users-skeleton" aria-label="Cargando usuarios">
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function Pagination({ onPageChange, page, pageSize, total }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((item) => {
    return item === 1 || item === totalPages || Math.abs(item - page) <= 1;
  });

  return (
    <footer className="global-users-pagination">
      <p>
        Mostrando {start}-{end} de {total} usuarios
      </p>
      <div>
        <button aria-label="Primera pagina" disabled={page === 1} onClick={() => onPageChange(1)} type="button">
          <ChevronsLeft size={15} aria-hidden="true" />
        </button>
        <button aria-label="Pagina anterior" disabled={page === 1} onClick={() => onPageChange(page - 1)} type="button">
          <ChevronLeft size={15} aria-hidden="true" />
        </button>
        {pages.map((item, index) => {
          const previous = pages[index - 1];
          const needsGap = previous && item - previous > 1;

          return (
            <span className="global-users-page-group" key={item}>
              {needsGap ? <em>...</em> : null}
              <button aria-current={item === page ? 'page' : undefined} onClick={() => onPageChange(item)} type="button">
                {item}
              </button>
            </span>
          );
        })}
        <button aria-label="Pagina siguiente" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} type="button">
          <ChevronRight size={15} aria-hidden="true" />
        </button>
        <button aria-label="Ultima pagina" disabled={page === totalPages} onClick={() => onPageChange(totalPages)} type="button">
          <ChevronsRight size={15} aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}

function UserDrawer({ onClose, onDelete, onEdit, onToggle, user }) {
  if (!user) {
    return null;
  }

  return (
    <div className="global-user-drawer-backdrop" role="presentation">
      <aside className="global-user-drawer" aria-label="Detalle de usuario">
        <button className="global-user-drawer-close" onClick={onClose} type="button" aria-label="Cerrar detalle">
          <X size={18} aria-hidden="true" />
        </button>
        <div className="global-user-drawer-hero">
          <span>{getInitials(user.nombre)}</span>
          <div>
            <p>Detalle de usuario</p>
            <h2>{user.nombre || 'Usuario sin nombre'}</h2>
            <small>{getEmail(user)}</small>
          </div>
        </div>

        <div className="global-user-drawer-status">
          <StateBadge status={getStatus(user)} />
          <RoleBadge role={user.rol} />
        </div>

        <dl className="global-user-detail-grid">
          <div>
            <dt>Empresa</dt>
            <dd>{getCompanyName(user)}</dd>
          </div>
          <div>
            <dt>Rol operativo</dt>
            <dd>{roleDescriptions[String(user.rol || '').toLowerCase()] ?? 'Acceso personalizado'}</dd>
          </div>
          <div>
            <dt>Telefono</dt>
            <dd>{getPhone(user) || 'Sin telefono'}</dd>
          </div>
          <div>
            <dt>Creacion</dt>
            <dd>{formatDate(getCreatedAt(user))}</dd>
          </div>
          <div>
            <dt>Ultimo acceso</dt>
            <dd>{formatRelative(getLastAccess(user))}</dd>
          </div>
          <div>
            <dt>ID interno</dt>
            <dd>#{user.id}</dd>
          </div>
        </dl>

        <div className="global-user-drawer-actions">
          <Can permission="users.manage">
            <button className="global-user-primary-button" onClick={() => onEdit(user)} type="button">
              <Edit3 size={16} aria-hidden="true" />
              Editar usuario
            </button>
          </Can>
          <Can permission="users.manage">
            <button className="global-user-secondary-button" onClick={() => onToggle(user)} type="button">
              <Power size={16} aria-hidden="true" />
              {getStatus(user) === 'ACTIVO' ? 'Desactivar' : 'Activar'}
            </button>
          </Can>
          <Can permission="users.manage">
            <button className="global-user-danger-button" onClick={() => onDelete(user)} type="button">
              <Trash2 size={16} aria-hidden="true" />
              Eliminar
            </button>
          </Can>
        </div>
      </aside>
    </div>
  );
}

export function GlobalUsersPage({
  companies,
  currentPage,
  error,
  filters,
  hasFilters,
  isLoading,
  onClearFilters,
  onCreate,
  onDelete,
  onEdit,
  onFilterChange,
  onPageChange,
  onRefresh,
  onToggle,
  onView,
  pageSize,
  paginatedUsers,
  selectedUser,
  stats,
  totalFiltered,
  usersTotal
}) {
  const isEmpty = !isLoading && totalFiltered === 0;

  return (
    <div className="resource-page global-users-page premium-dashboard">
      <section className="global-users-hero">
        <div>
          <span className="global-users-hero-icon">
            <Users size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Accesos globales</p>
            <h1>Usuarios Globales</h1>
            <p>Administra cuentas, roles, empresas y estado operativo desde un centro claro y profesional.</p>
          </div>
        </div>
        <div className="global-users-hero-actions">
          <button className="global-user-secondary-button" onClick={onRefresh} type="button">
            <RefreshCw size={15} aria-hidden="true" />
            Actualizar
          </button>
          <Can permission="users.manage">
            <button className="global-user-primary-button" onClick={onCreate} type="button">
              <Plus size={16} aria-hidden="true" />
              Nuevo usuario
            </button>
          </Can>
        </div>
      </section>

      <section className="global-users-kpis" aria-label="Resumen de usuarios">
        <SummaryCard detail="Cuentas registradas" icon={Users} label="Total usuarios" value={stats.total} />
        <SummaryCard detail="Listos para operar" icon={UserCheck} label="Activos" tone="success" value={stats.active} />
        <SummaryCard detail="Acceso pausado" icon={Power} label="Inactivos" tone="warning" value={stats.inactive} />
        <SummaryCard detail="Control de plataforma" icon={ShieldCheck} label="Super admin" tone="admin" value={stats.admins} />
      </section>

      {error ? (
        <section className="global-users-alert">
          <Activity size={18} aria-hidden="true" />
          <div>
            <strong>No se pudo completar la operacion</strong>
            <p>{error}</p>
          </div>
          <button className="global-user-secondary-button" onClick={onRefresh} type="button">
            Reintentar
          </button>
        </section>
      ) : null}

      <section className="global-users-directory">
        <header className="global-users-directory-header">
          <div>
            <h2>Directorio operativo</h2>
            <p>Gestion visual de usuarios con busqueda, filtros, acciones y paginacion.</p>
          </div>
          <div>
            <Mail size={15} aria-hidden="true" />
            {stats.active} accesos activos
          </div>
        </header>

        <UsersToolbar
          companies={companies}
          filters={filters}
          onCreate={onCreate}
          onFilterChange={onFilterChange}
          onRefresh={onRefresh}
          total={usersTotal}
          visible={totalFiltered}
        />

        {isLoading ? <LoadingState /> : null}
        {isEmpty ? <EmptyState hasFilters={hasFilters} onClear={onClearFilters} onCreate={onCreate} /> : null}
        {!isLoading && !isEmpty ? (
          <>
            <UsersTable onDelete={onDelete} onEdit={onEdit} onToggle={onToggle} onView={onView} users={paginatedUsers} />
            <UsersMobileList onDelete={onDelete} onEdit={onEdit} onToggle={onToggle} onView={onView} users={paginatedUsers} />
            <Pagination onPageChange={onPageChange} page={currentPage} pageSize={pageSize} total={totalFiltered} />
          </>
        ) : null}
      </section>

      <UserDrawer
        onClose={() => onView(null)}
        onDelete={onDelete}
        onEdit={onEdit}
        onToggle={onToggle}
        user={selectedUser}
      />
    </div>
  );
}
