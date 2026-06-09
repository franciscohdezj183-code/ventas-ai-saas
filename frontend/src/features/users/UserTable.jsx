import { Edit3, Trash2 } from 'lucide-react';

export function UserTable({ isLoading, onDelete, onEdit, users }) {
  if (isLoading) {
    return <div className="empty-state table-message">Cargando usuarios...</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Empresa</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan="5" className="empty-state">
                No hay usuarios registrados todavia.
              </td>
            </tr>
          ) : (
            users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.nombre}</strong>
                  <span className="muted-cell">{user.correo}</span>
                </td>
                <td>{user.empresa_nombre}</td>
                <td>
                  <span className="status-pill">{user.rol}</span>
                </td>
                <td>
                  <span className="status-pill active">{user.estado}</span>
                </td>
                <td>
                  <div className="table-actions">
                    <button aria-label="Editar usuario" onClick={() => onEdit(user)} type="button">
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    <button
                      aria-label="Eliminar usuario"
                      onClick={() => onDelete(user)}
                      type="button"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
