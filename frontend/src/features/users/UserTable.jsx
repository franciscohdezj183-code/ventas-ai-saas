import { Edit3, Power, Trash2 } from 'lucide-react';
import { DataTable, StatusBadge } from '../../components/ui/index.js';

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : '-';
}

function getInitial(name = '') {
  return name.trim().charAt(0).toUpperCase() || 'U';
}

export function UserTable({ isLoading, onDelete, onEdit, onToggle, users }) {
  const columns = [
    {
      key: 'usuario',
      header: 'Usuario',
      render: (user) => (
        <div className="user-table-identity">
          <span className="user-avatar-initial">{getInitial(user.nombre)}</span>
          <div>
            <strong>{user.nombre}</strong>
            <span className="muted-cell">{user.correo || user.email}</span>
          </div>
        </div>
      )
    },
    { key: 'empresa', header: 'Empresa', render: (user) => user.empresa_nombre },
    { key: 'rol', header: 'Rol', render: (user) => <span className={`role-pill ${String(user.rol).toLowerCase()}`}>{user.rol}</span> },
    { key: 'estado', header: 'Estado', render: (user) => <StatusBadge status={user.estado}>{user.estado}</StatusBadge> },
    { key: 'fecha_creacion', header: 'Creado', render: (user) => formatDate(user.fecha_creacion) },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (user) => (
        <div className="table-actions">
          <button aria-label="Editar usuario" onClick={() => onEdit(user)} type="button">
            <Edit3 size={16} aria-hidden="true" />
          </button>
          <button
            aria-label={user.estado === 'ACTIVO' ? 'Desactivar usuario' : 'Activar usuario'}
            onClick={() => onToggle(user)}
            title={user.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
            type="button"
          >
            <Power size={16} aria-hidden="true" />
          </button>
          <button aria-label="Eliminar usuario" onClick={() => onDelete(user)} type="button">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      )
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={users}
      emptyDescription="Agrega usuarios para delegar la operacion por empresa."
      emptyTitle="No hay usuarios registrados"
      isLoading={isLoading}
      loadingMessage="Cargando usuarios..."
      className="users-data-table"
    />
  );
}
