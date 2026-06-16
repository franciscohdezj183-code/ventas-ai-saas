import { Eye, ImageIcon, Pencil, PowerOff } from 'lucide-react';
import { Can } from '../../components/Can.jsx';
import { DataTable, EmptyState, StatusBadge } from '../../components/ui/index.js';

export function getStockStatus(product) {
  const stock = Number(product.stock ?? 0);

  if (stock <= 0) {
    return { label: 'Agotado', tone: 'danger' };
  }

  if (stock <= 5) {
    return { label: 'Bajo stock', tone: 'warning' };
  }

  return { label: 'Disponible', tone: 'success' };
}

function getCatalogSignal(product) {
  if (Number(product.stock ?? 0) <= 0) {
    return { label: 'Resurtir', tone: 'danger' };
  }

  if (Number(product.stock ?? 0) <= 5) {
    return { label: 'Vigilar stock', tone: 'warning' };
  }

  if (!product.descripcion) {
    return { label: 'Falta descripcion', tone: 'warning' };
  }

  if (!product.imagen) {
    return { label: 'Falta imagen', tone: 'info' };
  }

  return { label: 'Listo para vender', tone: 'success' };
}

function formatPrice(value) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    currency: 'MXN',
    style: 'currency'
  });
}

function ProductImage({ product, size = 'sm' }) {
  return product.imagen ? (
    <img alt={product.nombre} className={`product-image ${size}`} src={product.imagen} />
  ) : (
    <span className={`product-image placeholder ${size}`}>
      <ImageIcon size={size === 'lg' ? 28 : 18} aria-hidden="true" />
    </span>
  );
}

function ProductActions({ onDeactivate, onEdit, onView, product }) {
  return (
    <div className="table-actions product-actions">
      <button aria-label="Ver detalle" onClick={() => onView(product)} type="button">
        <Eye size={16} aria-hidden="true" />
      </button>
      <Can permission="products.manage">
        <button aria-label="Editar producto" onClick={() => onEdit(product)} type="button">
          <Pencil size={16} aria-hidden="true" />
        </button>
      </Can>
      <Can permission="products.manage">
        <button aria-label="Desactivar producto" onClick={() => onDeactivate(product)} type="button">
          <PowerOff size={16} aria-hidden="true" />
        </button>
      </Can>
    </div>
  );
}

function ProductCards({ onDeactivate, onEdit, onView, products }) {
  if (!products.length) {
    return (
      <EmptyState
        description="Apareceran aqui cuando crees productos o importes tu catalogo desde Excel."
        title="Tu catalogo esta vacio"
      />
    );
  }

  return (
    <div className="product-card-grid">
      {products.map((product) => {
        const stockStatus = getStockStatus(product);

        return (
          <article className="product-card" key={product.id}>
            <ProductImage product={product} size="lg" />
            <div className="product-card-body">
              <div className="product-card-heading">
                <div>
                  <strong>{product.nombre}</strong>
                  <span>{product.categoria_nombre || 'Sin categoria'}</span>
                </div>
                <StatusBadge status={product.estado}>{product.estado}</StatusBadge>
              </div>

              <p>{product.descripcion || 'Sin descripcion registrada.'}</p>

              <div className="product-card-meta">
                <div>
                  <span>Precio</span>
                  <strong>{formatPrice(product.precio)}</strong>
                </div>
                <div>
                  <span>Stock</span>
                  <strong>{product.stock}</strong>
                </div>
              </div>

              <div className="product-intelligence-row">
                <span className={`stock-badge ${stockStatus.tone}`}>{stockStatus.label}</span>
                <span className={`catalog-signal ${getCatalogSignal(product).tone}`}>
                  {getCatalogSignal(product).label}
                </span>
              </div>
            </div>

            <ProductActions
              onDeactivate={onDeactivate}
              onEdit={onEdit}
              onView={onView}
              product={product}
            />
          </article>
        );
      })}
    </div>
  );
}

export function ProductTable({
  isLoading,
  onDeactivate,
  onEdit,
  onView,
  products,
  viewMode = 'table'
}) {
  const columns = [
    {
      key: 'producto',
      header: 'Producto',
      render: (product) => (
        <div className="product-cell">
          <ProductImage product={product} />
          <div>
            <strong>{product.nombre}</strong>
            <span className="muted-cell">{product.sku || product.descripcion || 'Sin SKU'}</span>
          </div>
        </div>
      )
    },
    { key: 'categoria', header: 'Categoria', render: (product) => product.categoria_nombre || '-' },
    { key: 'precio', header: 'Precio', render: (product) => formatPrice(product.precio) },
    {
      key: 'stock',
      header: 'Stock',
      render: (product) => {
        const stockStatus = getStockStatus(product);

        return (
          <div className="stock-cell">
            <strong>{product.stock}</strong>
            <span className={`stock-badge ${stockStatus.tone}`}>{stockStatus.label}</span>
          </div>
        );
      }
    },
    { key: 'estado', header: 'Estado', render: (product) => <StatusBadge status={product.estado}>{product.estado}</StatusBadge> },
    {
      key: 'senal',
      header: 'Senal',
      render: (product) => {
        const signal = getCatalogSignal(product);
        return <span className={`catalog-signal ${signal.tone}`}>{signal.label}</span>;
      }
    },
    {
      key: 'acciones',
      header: 'Acciones',
      render: (product) => (
        <ProductActions
          onDeactivate={onDeactivate}
          onEdit={onEdit}
          onView={onView}
          product={product}
        />
      )
    }
  ];

  if (viewMode === 'cards' && !isLoading) {
    return (
      <ProductCards
        onDeactivate={onDeactivate}
        onEdit={onEdit}
        onView={onView}
        products={products}
      />
    );
  }

  return (
    <DataTable
      className="products-table"
      columns={columns}
      data={products}
      emptyDescription="Crea tu primer producto o importa un catalogo desde Excel."
      emptyTitle="No hay productos registrados"
      isLoading={isLoading}
      loadingMessage="Cargando productos..."
    />
  );
}
