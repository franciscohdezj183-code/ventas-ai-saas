import { AlertTriangle, Eye, ImageIcon, Pencil, PowerOff, Tag } from 'lucide-react';
import { Can } from '../../components/Can.jsx';
import { EmptyState, StatusBadge } from '../../components/ui/index.js';

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

export function getCatalogSignal(product) {
  if (Number(product.stock ?? 0) <= 0) {
    return { label: 'Resurtir', tone: 'danger' };
  }

  if (Number(product.stock ?? 0) <= 5) {
    return { label: 'Vigilar stock', tone: 'warning' };
  }

  if (!product.descripcion) {
    return { label: 'Sin descripcion', tone: 'warning' };
  }

  if (!product.imagen) {
    return { label: 'Sin imagen', tone: 'info' };
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
    <span className={`product-image placeholder ${size}`} aria-label="Producto sin imagen">
      <ImageIcon size={size === 'lg' ? 30 : 18} aria-hidden="true" />
    </span>
  );
}

function ProductActions({ onDeactivate, onEdit, onView, product }) {
  return (
    <div className="product-actions">
      <button className="product-action view" aria-label={`Ver detalle de ${product.nombre}`} onClick={() => onView(product)} type="button" title="Ver detalle">
        <Eye size={16} aria-hidden="true" />
      </button>
      <Can permission="products.manage">
        <button className="product-action edit" aria-label={`Editar ${product.nombre}`} onClick={() => onEdit(product)} type="button" title="Editar">
          <Pencil size={16} aria-hidden="true" />
        </button>
        <button className="product-action deactivate" aria-label={`Desactivar ${product.nombre}`} onClick={() => onDeactivate(product)} type="button" title="Desactivar">
          <PowerOff size={16} aria-hidden="true" />
        </button>
      </Can>
    </div>
  );
}

function ProductBadges({ product }) {
  const stockStatus = getStockStatus(product);
  const signal = getCatalogSignal(product);

  return (
    <div className="product-badge-row">
      <span className={`stock-badge ${stockStatus.tone}`}>{stockStatus.label}</span>
      <span className={`catalog-signal ${signal.tone}`}>{signal.label}</span>
      {!product.imagen ? <span className="catalog-signal info">Sin imagen</span> : null}
    </div>
  );
}

function ProductCard({ onDeactivate, onEdit, onView, product }) {
  return (
    <article className="product-card">
      <button className="product-card-media" onClick={() => onView(product)} type="button" aria-label={`Ver detalle de ${product.nombre}`}>
        <ProductImage product={product} size="lg" />
      </button>

      <div className="product-card-body">
        <div className="product-card-heading">
          <div>
            <strong>{product.nombre}</strong>
            <span>
              <Tag size={13} aria-hidden="true" />
              {product.categoria_nombre || 'Sin categoria'}
            </span>
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
            <strong>{Number(product.stock ?? 0)}</strong>
          </div>
        </div>

        <ProductBadges product={product} />

        <div className="product-card-footer">
          <span>{product.sku || 'Sin SKU'}</span>
          <ProductActions onDeactivate={onDeactivate} onEdit={onEdit} onView={onView} product={product} />
        </div>
      </div>
    </article>
  );
}

function ProductListRow({ onDeactivate, onEdit, onView, product }) {
  return (
    <article className="product-list-row">
      <button className="product-list-media" onClick={() => onView(product)} type="button" aria-label={`Ver detalle de ${product.nombre}`}>
        <ProductImage product={product} />
      </button>
      <div className="product-list-main">
        <div>
          <strong>{product.nombre}</strong>
          <span>{product.descripcion || product.sku || 'Sin descripcion registrada.'}</span>
        </div>
        <ProductBadges product={product} />
      </div>
      <div className="product-list-cell">
        <span>Categoria</span>
        <strong>{product.categoria_nombre || 'Sin categoria'}</strong>
      </div>
      <div className="product-list-cell">
        <span>Precio</span>
        <strong>{formatPrice(product.precio)}</strong>
      </div>
      <div className="product-list-cell">
        <span>Stock</span>
        <strong>{Number(product.stock ?? 0)}</strong>
      </div>
      <ProductActions onDeactivate={onDeactivate} onEdit={onEdit} onView={onView} product={product} />
    </article>
  );
}

function ProductsSkeleton({ viewMode }) {
  const length = viewMode === 'cards' ? 8 : 6;

  return (
    <div className={viewMode === 'cards' ? 'product-card-grid' : 'product-list'} aria-label="Cargando productos">
      {Array.from({ length }).map((_, index) => (
        <article className={viewMode === 'cards' ? 'product-card product-skeleton-card' : 'product-list-row product-skeleton-card'} key={index}>
          <span className="product-skeleton-media" />
          <div className="product-skeleton-copy">
            <span className="product-skeleton-line wide" />
            <span className="product-skeleton-line" />
            <span className="product-skeleton-line short" />
          </div>
        </article>
      ))}
    </div>
  );
}

function ProductsEmptyState({ hasFilters, onClearFilters, onCreate }) {
  return (
    <div className="products-empty-shell">
      <span>
        <AlertTriangle size={22} aria-hidden="true" />
      </span>
      <EmptyState
        description={hasFilters ? 'Intenta cambiar los filtros o limpiar la busqueda.' : 'Agrega tu primer producto para comenzar a construir tu catalogo.'}
        title={hasFilters ? 'No encontramos productos.' : 'No hay productos registrados.'}
      />
      <div className="products-empty-actions">
        {hasFilters ? (
          <button className="secondary-button" onClick={onClearFilters} type="button">
            Limpiar filtros
          </button>
        ) : (
          <Can permission="products.manage">
            <button className="primary-button" onClick={onCreate} type="button">
              Crear primer producto
            </button>
          </Can>
        )}
      </div>
    </div>
  );
}

export function ProductTable({
  hasFilters,
  isLoading,
  onClearFilters,
  onCreate,
  onDeactivate,
  onEdit,
  onView,
  products,
  viewMode = 'cards'
}) {
  if (isLoading) {
    return <ProductsSkeleton viewMode={viewMode} />;
  }

  if (!products.length) {
    return <ProductsEmptyState hasFilters={hasFilters} onClearFilters={onClearFilters} onCreate={onCreate} />;
  }

  if (viewMode === 'list') {
    return (
      <div className="product-list" aria-label="Lista de productos">
        {products.map((product) => (
          <ProductListRow
            key={product.id}
            onDeactivate={onDeactivate}
            onEdit={onEdit}
            onView={onView}
            product={product}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="product-card-grid" aria-label="Catalogo de productos">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          onDeactivate={onDeactivate}
          onEdit={onEdit}
          onView={onView}
          product={product}
        />
      ))}
    </div>
  );
}
