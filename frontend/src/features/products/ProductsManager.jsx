import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  FileSpreadsheet,
  FilterX,
  Grid2X2,
  ImageOff,
  Layers3,
  List,
  PackagePlus,
  PackageSearch,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { ConfirmModal, ErrorState, StatusBadge } from '../../components/ui/index.js';
import { Can } from '../../components/Can.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isSuperAdminRole } from '../../config/permissions.js';
import { fetchCategories } from '../categories/categoriesApi.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  createProduct,
  fetchCatalogInsights,
  fetchProducts,
  importProducts,
  updateProduct
} from './productsApi.js';
import { ProductForm } from './ProductForm.jsx';
import { ProductImport } from './ProductImport.jsx';
import { getCatalogSignal, getStockStatus, ProductTable } from './ProductTable.jsx';

const initialFilters = {
  categoria: '',
  estado: '',
  query: '',
  sort: 'recent',
  stock: ''
};

const emptyInsights = {
  resumen: {
    salud_catalogo: 0,
    total_productos: 0,
    productos_activos: 0,
    sin_stock: 0,
    bajo_stock: 0,
    sin_descripcion: 0,
    sin_imagen: 0,
    total_servicios: 0,
    servicios_sin_descripcion: 0
  },
  recomendaciones: [],
  productos_prioritarios: [],
  salud_por_categoria: []
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    currency: 'MXN',
    style: 'currency'
  });
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function getProductDate(product) {
  return product?.created_at ?? product?.fecha_creacion ?? product?.updated_at ?? '';
}

function getUpdatedDate(product) {
  return product?.updated_at ?? product?.fecha_actualizacion ?? product?.fecha_modificacion ?? getProductDate(product);
}

function getInventoryValue(products) {
  return products.reduce((sum, product) => sum + (Number(product.precio ?? 0) * Number(product.stock ?? 0)), 0);
}

function ProductsHeader({ isSaving, onCreate, onImport }) {
  return (
    <header className="products-hero">
      <div>
        <span className="products-header-icon">
          <PackageSearch size={24} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Catalogo empresarial</p>
          <h1>Productos</h1>
          <p>Administra tu catalogo, precios, categorias, imagenes y disponibilidad de productos.</p>
        </div>
      </div>
      <div className="products-header-actions">
        <Can permission="products.manage">
          <button className="secondary-button" disabled={isSaving} onClick={onImport} type="button">
            <FileSpreadsheet size={18} aria-hidden="true" />
            Subir Excel
          </button>
          <button className="primary-button" disabled={isSaving} onClick={onCreate} type="button">
            <PackagePlus size={18} aria-hidden="true" />
            Nuevo producto
          </button>
        </Can>
      </div>
    </header>
  );
}

function ProductsStats({ categoriesCount, insights, inventoryValue, products }) {
  const summary = insights.resumen ?? emptyInsights.resumen;
  const total = Number(summary.total_productos ?? products.length);
  const active = Number(summary.productos_activos ?? products.filter((product) => product.estado === 'ACTIVO').length);
  const lowStock = Number(summary.bajo_stock ?? products.filter((product) => getStockStatus(product).tone === 'warning').length);
  const outStock = Number(summary.sin_stock ?? products.filter((product) => getStockStatus(product).tone === 'danger').length);
  const cards = [
    { key: 'total', icon: Boxes, label: 'Total de productos', value: total, detail: 'Catalogo registrado', tone: 'info' },
    { key: 'active', icon: CheckCircle2, label: 'Productos activos', value: active, detail: 'Disponibles para vender', tone: 'success' },
    { key: 'low', icon: AlertTriangle, label: 'Bajo stock', value: lowStock, detail: 'Requieren atencion', tone: 'warning' },
    { key: 'out', icon: ImageOff, label: 'Agotados', value: outStock, detail: 'Sin inventario', tone: 'danger' },
    { key: 'categories', icon: Layers3, label: 'Categorias', value: categoriesCount, detail: 'Organizacion del catalogo', tone: 'neutral' },
    { key: 'value', icon: CircleDollarSign, label: 'Valor inventario', value: formatCurrency(inventoryValue), detail: 'Estimado visible', tone: 'money' }
  ];

  return (
    <section className="products-kpi-grid" aria-label="Metricas del catalogo">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article className={`products-kpi-card ${card.tone}`} key={card.key}>
            <span>
              <Icon size={19} aria-hidden="true" />
            </span>
            <div>
              <strong>{card.value}</strong>
              <small>{card.label}</small>
              <p>{card.detail}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ProductsToolbar({ categories, filters, hasFilters, onClear, onFilterChange, setViewMode, viewMode, visible, total }) {
  return (
    <div className="products-toolbar">
      <span className="products-visible-count">{visible} de {total} visibles</span>
      <label className="product-search" htmlFor="product-search">
        <Search size={18} aria-hidden="true" />
        <input
          id="product-search"
          onChange={(event) => onFilterChange({ query: event.target.value })}
          placeholder="Buscar por nombre, descripcion, SKU o categoria"
          type="search"
          value={filters.query}
        />
      </label>

      <div className="product-filter-group">
        <SlidersHorizontal size={18} aria-hidden="true" />
        <select aria-label="Filtrar por categoria" onChange={(event) => onFilterChange({ categoria: event.target.value })} value={filters.categoria}>
          <option value="">Todas las categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.nombre}</option>
          ))}
        </select>
        <select aria-label="Filtrar por estado" onChange={(event) => onFilterChange({ estado: event.target.value })} value={filters.estado}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activo</option>
          <option value="INACTIVO">Inactivo</option>
        </select>
        <select aria-label="Filtrar por stock" onChange={(event) => onFilterChange({ stock: event.target.value })} value={filters.stock}>
          <option value="">Todo el stock</option>
          <option value="DISPONIBLE">Disponible</option>
          <option value="BAJO_STOCK">Bajo stock</option>
          <option value="SIN_STOCK">Agotado</option>
          <option value="SIN_IMAGEN">Sin imagen</option>
        </select>
        <select aria-label="Ordenar productos" onChange={(event) => onFilterChange({ sort: event.target.value })} value={filters.sort}>
          <option value="recent">Mas recientes</option>
          <option value="name">Nombre A-Z</option>
          <option value="price_high">Mayor precio</option>
          <option value="price_low">Menor precio</option>
        </select>
      </div>

      <button className="secondary-button products-clear-button" disabled={!hasFilters} onClick={onClear} type="button">
        <FilterX size={17} aria-hidden="true" />
        Limpiar
      </button>

      <div className="view-toggle" aria-label="Cambiar vista">
        <button className={viewMode === 'cards' ? 'active' : ''} onClick={() => setViewMode('cards')} type="button" aria-label="Vista en grid">
          <Grid2X2 size={17} aria-hidden="true" />
          Grid
        </button>
        <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} type="button" aria-label="Vista en lista">
          <List size={17} aria-hidden="true" />
          Lista
        </button>
      </div>
    </div>
  );
}

function ProductDetailDrawer({ onClose, onEdit, product }) {
  const stockStatus = getStockStatus(product);
  const signal = getCatalogSignal(product);

  return (
    <div className="products-drawer-backdrop" role="presentation">
      <aside className="product-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
        <button className="modal-close icon-button" onClick={onClose} type="button" aria-label="Cerrar detalle">
          <X size={16} aria-hidden="true" />
        </button>
        <div className="product-detail-media">
          {product.imagen ? (
            <img alt={product.nombre} src={product.imagen} />
          ) : (
            <span>
              <PackageSearch size={44} aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="product-detail-copy">
          <div className="product-detail-title">
            <StatusBadge status={product.estado}>{product.estado}</StatusBadge>
            <h2 id="product-detail-title">{product.nombre}</h2>
            <p>{product.descripcion || 'Sin descripcion registrada.'}</p>
          </div>

          <dl className="product-detail-grid">
            <div>
              <dt>Precio</dt>
              <dd>{formatCurrency(product.precio)}</dd>
            </div>
            <div>
              <dt>Stock</dt>
              <dd>
                {Number(product.stock ?? 0)}
                <span className={`stock-badge ${stockStatus.tone}`}>{stockStatus.label}</span>
              </dd>
            </div>
            <div>
              <dt>Categoria</dt>
              <dd>{product.categoria_nombre || 'Sin categoria'}</dd>
            </div>
            <div>
              <dt>SKU</dt>
              <dd>{product.sku || 'Sin SKU'}</dd>
            </div>
            <div>
              <dt>Creacion</dt>
              <dd>{formatDate(getProductDate(product))}</dd>
            </div>
            <div>
              <dt>Actualizacion</dt>
              <dd>{formatDate(getUpdatedDate(product))}</dd>
            </div>
          </dl>

          <section className="product-detail-status">
            <h3>Disponibilidad</h3>
            <div>
              <span className={`catalog-signal ${signal.tone}`}>{signal.label}</span>
              {!product.imagen ? <span className="catalog-signal info">Sin imagen</span> : null}
            </div>
          </section>

          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">Cerrar</button>
            <Can permission="products.manage">
              <button className="primary-button" onClick={() => onEdit(product)} type="button">Editar producto</button>
            </Can>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function ProductsManager() {
  const { user } = useAuth();
  const canSelectCompany = isSuperAdminRole(user?.rol);
  const [categories, setCategories] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [importResult, setImportResult] = useState(null);
  const [insights, setInsights] = useState(emptyInsights);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 24, total: 0, totalPages: 1 });
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [viewMode, setViewMode] = useState('cards');

  const productCategories = useMemo(() => {
    const seen = new Map();

    categories.forEach((category) => {
      if (category.tipo === 'PRODUCTO' && category.estado === 'ACTIVA') {
        seen.set(String(category.id), category.nombre);
      }
    });

    return Array.from(seen, ([id, nombre]) => ({ id, nombre }));
  }, [categories]);

  const filteredProducts = useMemo(() => {
    const visibleProducts = products.filter((product) => {
      if (filters.stock === 'SIN_STOCK') {
        return Number(product.stock ?? 0) <= 0;
      }

      if (filters.stock === 'BAJO_STOCK') {
        const stock = Number(product.stock ?? 0);
        return stock > 0 && stock <= 5;
      }

      if (filters.stock === 'DISPONIBLE') {
        return Number(product.stock ?? 0) > 5;
      }

      if (filters.stock === 'SIN_IMAGEN') {
        return !product.imagen;
      }

      return true;
    });

    return [...visibleProducts].sort((first, second) => {
      if (filters.sort === 'name') {
        return String(first.nombre ?? '').localeCompare(String(second.nombre ?? ''), 'es');
      }

      if (filters.sort === 'price_high') {
        return Number(second.precio ?? 0) - Number(first.precio ?? 0);
      }

      if (filters.sort === 'price_low') {
        return Number(first.precio ?? 0) - Number(second.precio ?? 0);
      }

      return new Date(getProductDate(second)).getTime() - new Date(getProductDate(first)).getTime();
    });
  }, [filters.sort, filters.stock, products]);

  const hasFilters = Object.entries(filters).some(([key, value]) => value && !(key === 'sort' && value === 'recent'));
  const inventoryValue = useMemo(() => getInventoryValue(products), [products]);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [productsResponse, nextCategories, nextCompanies, nextInsights] = await Promise.all([
        fetchProducts({
          page,
          page_size: pagination.pageSize,
          search: filters.query.trim() || undefined,
          categoria_id: filters.categoria || undefined,
          estado: filters.estado || undefined
        }),
        fetchCategories(),
        canSelectCompany ? fetchCompanies() : Promise.resolve([]),
        fetchCatalogInsights()
      ]);
      setProducts(productsResponse.data);
      setPagination(productsResponse.meta ?? { page, pageSize: 24, total: productsResponse.data.length, totalPages: 1 });
      setCategories(nextCategories);
      setCompanies(nextCompanies);
      setInsights({ ...emptyInsights, ...nextInsights });
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [canSelectCompany, filters.categoria, filters.estado, filters.query, page]);

  function updateFilters(nextFilter) {
    setFilters((current) => ({ ...current, ...nextFilter }));
    setPage(1);
  }

  function openCreateForm() {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  }

  function closeProductForm() {
    setEditingProduct(null);
    setIsProductModalOpen(false);
  }

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
      } else {
        await createProduct(payload);
      }

      closeProductForm();
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(product) {
    if (!product) {
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await updateProduct(product.id, {
        nombre: product.nombre,
        descripcion: product.descripcion ?? '',
        precio: Number(product.precio),
        stock: Number(product.stock),
        categoria_id: product.categoria_id ?? '',
        empresa_id: product.empresa_id,
        estado: 'INACTIVO'
      });
      setPendingDeactivate(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImport(payload) {
    try {
      setIsImporting(true);
      setError('');
      const result = await importProducts(payload);
      setImportResult(result);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="resource-page products-page">
      <ProductsHeader
        isSaving={isSaving}
        onCreate={openCreateForm}
        onImport={() => setIsImportModalOpen(true)}
      />

      {error ? <ErrorState message={error || 'No pudimos cargar los productos. Intenta nuevamente.'} onRetry={loadData} /> : null}

      <ProductsStats
        categoriesCount={productCategories.length}
        insights={insights}
        inventoryValue={inventoryValue}
        products={products}
      />

      <section className="products-inventory-panel" aria-label="Catalogo de productos">
        <ProductsToolbar
          categories={productCategories}
          filters={filters}
          hasFilters={hasFilters}
          onClear={() => setFilters(initialFilters)}
          onFilterChange={updateFilters}
          setViewMode={setViewMode}
          total={pagination.total}
          viewMode={viewMode}
          visible={filteredProducts.length}
        />

        <ProductTable
          hasFilters={hasFilters}
          isLoading={isLoading}
          onClearFilters={() => setFilters(initialFilters)}
          onCreate={openCreateForm}
          onDeactivate={setPendingDeactivate}
          onEdit={(product) => {
            setEditingProduct(product);
            setIsProductModalOpen(true);
          }}
          onView={setSelectedProduct}
          products={filteredProducts}
          viewMode={viewMode}
        />

        <div className="pagination-bar">
          <span>Pagina {pagination.page} de {pagination.totalPages}</span>
          <div>
            <button className="secondary-button" disabled={pagination.page <= 1 || isLoading} onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))} type="button">
              Anterior
            </button>
            <button className="secondary-button" disabled={pagination.page >= pagination.totalPages || isLoading} onClick={() => setPage((currentPage) => currentPage + 1)} type="button">
              Siguiente
            </button>
          </div>
        </div>
      </section>

      <ConfirmModal
        destructive
        confirmLabel="Desactivar"
        description={`Se ocultara ${pendingDeactivate?.nombre ?? 'este producto'} del catalogo activo sin eliminar su historial.`}
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={() => handleDeactivate(pendingDeactivate)}
        open={Boolean(pendingDeactivate)}
        title="Desactivar producto"
      />

      {isImportModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal product-import-modal" role="dialog" aria-modal="true" aria-labelledby="import-products-title">
            <button className="modal-close icon-button" onClick={() => setIsImportModalOpen(false)} type="button" aria-label="Cerrar importacion">
              <X size={16} aria-hidden="true" />
            </button>
            <div className="catalog-modal-header">
              <span>
                <FileSpreadsheet size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Excel</p>
                <h2 id="import-products-title">Subir productos</h2>
                <p>Carga tu catalogo desde un archivo XLSX.</p>
              </div>
            </div>
            <ProductImport
              canSelectCompany={canSelectCompany}
              companies={companies}
              importResult={importResult}
              isImporting={isImporting}
              onImport={handleImport}
            />
          </article>
        </div>
      ) : null}

      {isProductModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide product-form-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
            <button className="modal-close icon-button" onClick={closeProductForm} type="button" aria-label="Cerrar formulario">
              <X size={16} aria-hidden="true" />
            </button>
            <div className="catalog-modal-header">
              <span>
                <PackagePlus size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Catalogo</p>
                <h2 id="product-form-title">{editingProduct ? 'Editar producto' : 'Nuevo producto'}</h2>
                <p>Registra informacion basica, precio, inventario e imagen del producto.</p>
              </div>
            </div>
            <ProductForm
              canSelectCompany={canSelectCompany}
              categories={categories}
              companies={companies}
              isSaving={isSaving}
              onCancel={closeProductForm}
              onSubmit={handleSubmit}
              product={editingProduct}
            />
          </article>
        </div>
      ) : null}

      {selectedProduct ? (
        <ProductDetailDrawer
          onClose={() => setSelectedProduct(null)}
          onEdit={(product) => {
            setEditingProduct(product);
            setIsProductModalOpen(true);
            setSelectedProduct(null);
          }}
          product={selectedProduct}
        />
      ) : null}
    </div>
  );
}
