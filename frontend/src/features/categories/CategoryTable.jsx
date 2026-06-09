import { Edit3, Trash2 } from 'lucide-react';

export function CategoryTable({ categories, isLoading, onDelete, onEdit }) {
  if (isLoading) {
    return <div className="empty-state table-message">Cargando categorias...</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Categoria</th>
            <th>Empresa</th>
            <th>Creada</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {categories.length === 0 ? (
            <tr>
              <td colSpan="4" className="empty-state">
                No hay categorias registradas todavia.
              </td>
            </tr>
          ) : (
            categories.map((category) => (
              <tr key={category.id}>
                <td>
                  <strong>{category.nombre}</strong>
                  <span className="muted-cell">ID {category.id}</span>
                </td>
                <td>{category.empresa_nombre}</td>
                <td>{new Date(category.fecha_creacion).toLocaleDateString()}</td>
                <td>
                  <div className="table-actions">
                    <button
                      aria-label="Editar categoria"
                      onClick={() => onEdit(category)}
                      type="button"
                    >
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    <button
                      aria-label="Eliminar categoria"
                      onClick={() => onDelete(category)}
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
