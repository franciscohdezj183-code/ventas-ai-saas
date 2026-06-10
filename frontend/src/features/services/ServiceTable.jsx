import { Edit3, Trash2 } from 'lucide-react';
import { DataTable } from '../../components/ui/DataTable.jsx';

export function ServiceTable({ isLoading, onDelete, onEdit, services }) {
  const columns = [
    {
      key: 'servicio',
      header: 'Servicio',
      render: (service) => (
        <>
          <strong>{service.nombre}</strong>
          <span className="muted-cell">{service.descripcion || 'Sin descripcion'}</span>
        </>
      )
    },
    { key: 'precio', header: 'Precio', render: (service) => `$${Number(service.precio).toFixed(2)}` },
    { key: 'duracion', header: 'Duracion', render: (service) => `${service.duracion} min` },
    { key: 'empresa', header: 'Empresa', render: (service) => service.empresa_nombre },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (service) => (
        <div className="table-actions">
          <button aria-label="Editar servicio" onClick={() => onEdit(service)} type="button">
            <Edit3 size={16} aria-hidden="true" />
          </button>
          <button aria-label="Eliminar servicio" onClick={() => onDelete(service)} type="button">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      )
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={services}
      emptyDescription="Agrega servicios para que el bot pueda consultar precios y disponibilidad."
      emptyTitle="No hay servicios registrados"
      isLoading={isLoading}
      loadingMessage="Cargando servicios..."
    />
  );
}
