import { Edit3, Eye, FolderTree, Power, Trash2 } from 'lucide-react';
import { EmptyState, StatusBadge } from '../../components/ui/index.js';
import { SortablePaginatedTable } from '../../components/ui/SortablePaginatedTable.jsx';

export function getCategoryProductCount(category) {
  const value =
    category.productos_count ??
    category.products_count ??
    category.total_productos ??
    category.product_count ??
    category.cantidad_productos;

  if (value === undefined || value === null || value === '') {
    return null;
  }

  return Number(value);
}

export function getCategoryDate(category) {
  return category.fecha_creacion ?? category.created_at ?? category.createdAt ?? '';
}

export function formatCategoryDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CategoryTypeBadge({ type }) {
  const normalized = String(type ?? 'PRODUCTO').toUpperCase();
  return <span className={`category-type-badge ${normalized.toLowerCase()}`}>{normalized === 'SERVICIO' ? 'Servicio' : 'Producto'}</span>;
}

function CategoryActions({ category, onDelete, onEdit, onToggle, onView }) {
  const isActive = (category.estado ?? 'ACTIVA') === 'ACTIVA';

  return (
    <div className="category-actions">
      <button className="category-action view" aria-label={`Ver detalle de ${category.nombre}`} onClick={() => onView(category)} type="button" title="Ver detalle">
        <Eye size={16} aria-hidden="true" />
      </button>
      <button className="category-action edit" aria-label={`Editar ${category.nombre}`} onClick={() => onEdit(category)} type="button" title="Editar">
        <Edit3 size={16} aria-hidden="true" />
      </button>
      <button
        className="category-action toggle"
        aria-label={isActive ? `Desactivar ${category.nombre}` : `Activar ${category.nombre}`}
        onClick={() => onToggle(category)}
        type="button"
        title={isActive ? 'Desactivar' : 'Activar'}
      >
        <Power size={16} aria-hidden="true" />
      </button>
      <button className="category-action delete" aria-label={`Eliminar ${category.nombre}`} onClick={() => onDelete(category)} type="button" title="Eliminar">
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="categories-table-shell" aria-label="Cargando categorias">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="category-table-skeleton-row" key={index}>
          <span className="category-skeleton-icon" />
          <span className="category-skeleton-line wide" />
          <span className="category-skeleton-line" />
          <span className="category-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

function CategoriesEmpty({ hasFilters, onClearFilters, onCreate }) {
  return (
    <div className="categories-empty-shell">
      <span>
        <FolderTree size={24} aria-hidden="true" />
      </span>
      <EmptyState
        description={hasFilters ? 'Intenta cambiar los filtros o limpiar la busqueda.' : 'Crea tu primera categoria para organizar mejor tus productos.'}
        title={hasFilters ? 'No encontramos categorias.' : 'No hay categorias registradas.'}
      />
      <div className="categories-empty-actions">
        {hasFilters ? (
          <button className="secondary-button" onClick={onClearFilters} type="button">
            Limpiar filtros
          </button>
        ) : (
          <button className="primary-button" onClick={onCreate} type="button">
            Crear primera categoria
          </button>
        )}
      </div>
    </div>
  );
}

export function CategoryTable({
  categories,
  hasFilters,
  isLoading,
  onClearFilters,
  onCreate,
  onDelete,
  onEdit,
  onToggle,
  onView,
  hasProductCounts,
  pageSize,
  pageSizeOptions
}) {
  if (isLoading) {
    return <CategoriesSkeleton />;
  }

  if (!categories.length) {
    return <CategoriesEmpty hasFilters={hasFilters} onClearFilters={onClearFilters} onCreate={onCreate} />;
  }

  const columns = [
    {
      key: 'nombre',
      label: 'Categoria',
      headerClassName: 'category-col-name',
      cellClassName: 'category-col-name',
      render: (category) => (
        <button className="category-table-name" onClick={() => onView(category)} type="button">
          <span className={`category-table-icon ${String(category.tipo ?? 'PRODUCTO').toLowerCase()}`}>
            <FolderTree size={16} aria-hidden="true" />
          </span>
          <span>
            <strong>{category.nombre}</strong>
            <small>ID {category.id}</small>
          </span>
        </button>
      ),
      sortValue: (category) => category.nombre
    },
    {
      key: 'empresa_nombre',
      label: 'Empresa',
      headerClassName: 'category-col-company',
      cellClassName: 'category-col-company',
      render: (category) => category.empresa_nombre || '-'
    },
    {
      key: 'tipo',
      label: 'Tipo',
      headerClassName: 'category-col-type',
      cellClassName: 'category-col-type',
      render: (category) => <CategoryTypeBadge type={category.tipo} />
    },
    hasProductCounts ? {
      key: 'productos',
      label: 'Productos',
      headerClassName: 'category-col-products',
      cellClassName: 'category-col-products',
      render: (category) => getCategoryProductCount(category),
      sortValue: (category) => getCategoryProductCount(category) ?? -1
    } : null,
    {
      key: 'estado',
      label: 'Estado',
      headerClassName: 'category-col-status',
      cellClassName: 'category-col-status',
      render: (category) => <StatusBadge status={category.estado ?? 'ACTIVA'}>{category.estado ?? 'ACTIVA'}</StatusBadge>,
      sortValue: (category) => category.estado ?? 'ACTIVA'
    },
    {
      key: 'creada',
      label: 'Creada',
      headerClassName: 'category-col-created',
      cellClassName: 'category-col-created',
      render: (category) => formatCategoryDate(getCategoryDate(category)),
      sortValue: (category) => getCategoryDate(category)
    },
    {
      key: 'acciones',
      label: 'Acciones',
      headerClassName: 'category-col-actions',
      cellClassName: 'category-col-actions',
      render: (category) => (
        <CategoryActions category={category} onDelete={onDelete} onEdit={onEdit} onToggle={onToggle} onView={onView} />
      ),
      sortable: false
    }
  ].filter(Boolean);

  return (
    <div className="categories-table-shell">
      <SortablePaginatedTable
        columns={columns}
        data={categories}
        emptyMessage="No hay categorias para mostrar."
        footerStart={({ totalRows, visibleRows }) => (
          <span className="categories-footer-count">
            {visibleRows} de {totalRows} visibles
          </span>
        )}
        getRowKey={(category) => category.id}
        initialSortKey="nombre"
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        showPageSizeSelector={false}
      />
    </div>
  );
}
