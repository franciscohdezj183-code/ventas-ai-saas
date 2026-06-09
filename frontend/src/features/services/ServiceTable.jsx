import { Edit3, Trash2 } from 'lucide-react';

export function ServiceTable({ isLoading, onDelete, onEdit, services }) {
  if (isLoading) {
    return <div className="empty-state table-message">Cargando servicios...</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Servicio</th>
            <th>Precio</th>
            <th>Duracion</th>
            <th>Empresa</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {services.length === 0 ? (
            <tr>
              <td colSpan="5" className="empty-state">
                No hay servicios registrados todavia.
              </td>
            </tr>
          ) : (
            services.map((service) => (
              <tr key={service.id}>
                <td>
                  <strong>{service.nombre}</strong>
                  <span className="muted-cell">{service.descripcion || 'Sin descripcion'}</span>
                </td>
                <td>${Number(service.precio).toFixed(2)}</td>
                <td>{service.duracion} min</td>
                <td>{service.empresa_nombre}</td>
                <td>
                  <div className="table-actions">
                    <button aria-label="Editar servicio" onClick={() => onEdit(service)} type="button">
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    <button
                      aria-label="Eliminar servicio"
                      onClick={() => onDelete(service)}
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
