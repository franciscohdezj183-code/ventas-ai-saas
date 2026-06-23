import { Edit3, Trash2 } from 'lucide-react';
import { DataTable } from '../../components/ui/DataTable.jsx';

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', { currency: 'MXN', style: 'currency' }).format(Number(value ?? 0));
}

function formatPrice(service) {
  const type = String(service.tipo_precio ?? 'FIJO').toUpperCase();

  if (type === 'COTIZACION') return 'Cotización con asesor';
  if (type === 'DESDE') return `Desde ${formatCurrency(service.precio)}`;
  if (type === 'POR_M2') return `${formatCurrency(service.precio)} / m²`;
  if (type === 'POR_HORA') return `${formatCurrency(service.precio)} / hora`;
  if (type === 'POR_UNIDAD') return `${formatCurrency(service.precio)} / unidad`;

  return formatCurrency(service.precio);
}

function formatUnit(unit) {
  return {
    servicio: 'Servicio',
    pieza: 'Pieza',
    paquete: 'Paquete',
    m2: 'm²',
    hora: 'Hora',
    asesor: 'Asesor'
  }[String(unit ?? '')] ?? 'No aplica';
}

function formatRequiredData(service) {
  const data = [
    service.requiere_medidas ? 'Medidas' : null,
    service.requiere_cantidad ? 'Cantidad' : null
  ].filter(Boolean);

  return data.length ? data.join(', ') : 'No aplica';
}

export function ServiceTable({ isLoading, onDelete, onEdit, services }) {
  const columns = [
    {
      key: 'servicio',
      header: 'Servicio',
      render: (service) => (
        <>
          <strong>{service.nombre}</strong>
          <span className="muted-cell">{service.descripcion || 'Sin descripción'}</span>
        </>
      )
    },
    { key: 'categoria', header: 'Categoría', render: (service) => service.categoria_nombre || 'Sin categoría' },
    { key: 'precio', header: 'Precio/Modalidad', render: formatPrice },
    { key: 'unidad', header: 'Unidad', render: (service) => formatUnit(service.unidad_medida) },
    { key: 'requiere_datos', header: 'Requiere datos', render: formatRequiredData },
    { key: 'duracion', header: 'Duración', render: (service) => (Number(service.duracion) > 0 ? `${service.duracion} min` : 'No aplica') },
    { key: 'estado', header: 'Estado', render: (service) => service.estado },
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
      emptyDescription="Agrega servicios para que el bot pueda consultar precios, modalidad y datos requeridos."
      emptyTitle="No hay servicios registrados"
      isLoading={isLoading}
      loadingMessage="Cargando servicios..."
    />
  );
}
