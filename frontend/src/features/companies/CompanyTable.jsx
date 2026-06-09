import { Edit3, Trash2 } from 'lucide-react';

export function CompanyTable({ companies, isLoading, onDelete, onEdit }) {
  if (isLoading) {
    return <div className="empty-state table-message">Cargando empresas...</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Telefono</th>
            <th>Tipo</th>
            <th>Plan</th>
            <th>Activo</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {companies.length === 0 ? (
            <tr>
              <td colSpan="6" className="empty-state">
                No hay empresas registradas todavia.
              </td>
            </tr>
          ) : (
            companies.map((company) => (
              <tr key={company.id}>
                <td>
                  <strong>{company.nombre}</strong>
                  <span className="muted-cell">{company.direccion || company.slug}</span>
                </td>
                <td>{company.telefono || '-'}</td>
                <td>{company.tipo_negocio || '-'}</td>
                <td>
                  <span className="status-pill">{company.plan}</span>
                </td>
                <td>
                  <span className={company.activo ? 'status-pill active' : 'status-pill inactive'}>
                    {company.activo ? 'Si' : 'No'}
                  </span>
                </td>
                <td>
                  <div className="table-actions">
                    <button aria-label="Editar empresa" onClick={() => onEdit(company)} type="button">
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    <button
                      aria-label="Eliminar empresa"
                      onClick={() => onDelete(company)}
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
