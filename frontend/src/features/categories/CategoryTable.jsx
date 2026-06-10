import { Edit3, Power, Tag, Trash2 } from 'lucide-react';
import { DataTable, StatusBadge } from '../../components/ui/index.js';

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : '-';
}

export function CategoryTable({ categories, isLoading, onDelete, onEdit, onToggle }) {
  const columns = [
    {
      key: 'categoria',
      header: 'Categoria',
      render: (category) => (
        <div className="category-table-name">
          <span className="category-table-icon">
            <Tag size={16} aria-hidden="true" />
          </span>
          <div>
            <strong>{category.nombre}</strong>
            <span className="muted-cell">ID {category.id}</span>
          </div>
        </div>
      )
    },
    { key: 'empresa', header: 'Empresa', render: (category) => category.empresa_nombre },
    {
      key: 'tipo',
      header: 'Tipo',
      render: (category) => <span className={`category-type-badge ${String(category.tipo ?? 'PRODUCTO').toLowerCase()}`}>{category.tipo ?? 'PRODUCTO'}</span>
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (category) => <StatusBadge status={category.estado ?? 'ACTIVA'}>{category.estado ?? 'ACTIVA'}</StatusBadge>
    },
    {
      key: 'creada',
      header: 'Creada',
      render: (category) => formatDate(category.fecha_creacion)
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (category) => (
        <div className="table-actions">
          <button aria-label="Editar categoria" onClick={() => onEdit(category)} type="button">
            <Edit3 size={16} aria-hidden="true" />
          </button>
          <button
            aria-label={category.estado === 'ACTIVA' ? 'Desactivar categoria' : 'Activar categoria'}
            onClick={() => onToggle(category)}
            title={category.estado === 'ACTIVA' ? 'Desactivar' : 'Activar'}
            type="button"
          >
            <Power size={16} aria-hidden="true" />
          </button>
          <button aria-label="Eliminar categoria" onClick={() => onDelete(category)} type="button">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      )
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={categories}
      emptyDescription="Crea categorias para ordenar productos y servicios."
      emptyTitle="No hay categorias registradas"
      isLoading={isLoading}
      loadingMessage="Cargando categorias..."
      className="categories-data-table"
    />
  );
}
