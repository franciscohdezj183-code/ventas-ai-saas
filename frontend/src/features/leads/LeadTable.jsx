import { Edit3, Trash2 } from 'lucide-react';

function statusClass(status) {
  if (status === 'GANADO') {
    return 'status-pill active';
  }

  if (status === 'PERDIDO') {
    return 'status-pill inactive';
  }

  return 'status-pill';
}

export function LeadTable({ isLoading, leads, onDelete, onEdit }) {
  if (isLoading) {
    return <div className="empty-state table-message">Cargando leads...</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Telefono</th>
            <th>Interes</th>
            <th>Estado</th>
            <th>Empresa</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 ? (
            <tr>
              <td colSpan="6" className="empty-state">
                No hay leads registrados todavia.
              </td>
            </tr>
          ) : (
            leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <strong>{lead.nombre_cliente}</strong>
                  <span className="muted-cell">ID {lead.id}</span>
                </td>
                <td>{lead.telefono}</td>
                <td>{lead.interes}</td>
                <td>
                  <span className={statusClass(lead.estado)}>{lead.estado}</span>
                </td>
                <td>{lead.empresa_nombre}</td>
                <td>
                  <div className="table-actions">
                    <button aria-label="Editar lead" onClick={() => onEdit(lead)} type="button">
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    <button aria-label="Eliminar lead" onClick={() => onDelete(lead)} type="button">
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
