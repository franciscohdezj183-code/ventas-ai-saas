import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  Grid2X2,
  ImageOff,
  Layers3,
  List,
  PackagePlus,
  PackageSearch,
  Search,
  SlidersHorizontal,
  Sparkles
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
import { getStockStatus, ProductTable } from './ProductTable.jsx';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function formatPrice(value) {
  return Number(value ?? 0).toFixed(2);
}

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

function getProductSignal(product) {
  if (Number(product.stock ?? 0) <= 0) return 'SIN_STOCK';
  if (Number(product.stock ?? 0) <= 5) return 'BAJO_STOCK';
  if (!product.descripcion) return 'SIN_DESCRIPCION';
  if (!product.imagen) return 'SIN_IMAGEN';
  return 'LISTO';
}

function CatalogHealth({ insights }) {
  const summary = insights.resumen ?? emptyInsights.resumen;
  const health = Number(summary.salud_catalogo ?? 0);

  return (
    <section className="catalog-intelligence-grid" aria-label="Inteligencia del catalogo">
      <article className="catalog-health-card">
        <span><Sparkles size={20} aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">Salud del catalogo</p>
          <strong>{health}%</strong>
          <small>{summary.total_productos} productos evaluados</small>
        </div>
      </article>
      <article>
        <span><AlertTriangle size={18} aria-hidden="true" /></span>
        <div>
          <strong>{summary.sin_stock}</strong>
          <small>agotados</small>
        </div>
      </article>
      <article>
        <span><BarChart3 size={18} aria-hidden="true" /></span>
        <div>
          <strong>{summary.bajo_stock}</strong>
          <small>bajo stock</small>
        </div>
      </article>
      <article>
        <span><ImageOff size={18} aria-hidden="true" /></span>
        <div>
          <strong>{summary.sin_imagen}</strong>
          <small>sin imagen</small>
        </div>
      </article>
      <article>
        <span><Layers3 size={18} aria-hidden="true" /></span>
        <div>
          <strong>{summary.total_servicios}</strong>
          <small>servicios</small>
        </div>
      </article>
    </section>
  );
}

function CatalogRecommendations({ insights, onOpenProduct }) {
  const recommendations = insights.recomendaciones ?? [];
  const priorityProducts = insights.productos_prioritarios ?? [];

  return (
    <section className="catalog-advisor-panel">
      <div className="catalog-advisor-list">
        <div>
          <p className="eyebrow">Asistente de catalogo</p>
          <h2>Acciones recomendadas</h2>
        </div>
        {recommendations.map((recommendation) => (
          <article key={recommendation.titulo}>
            <span>{recommendation.prioridad}</span>
            <div>
              <strong>{recommendation.titulo}</strong>
              <p>{recommendation.detalle}</p>
              <small>{recommendation.accion}</small>
            </div>
          </article>
        ))}
      </div>
      <div className="catalog-priority-products">
        <div>
          <p className="eyebrow">Prioridad operativa</p>
          <h2>Productos a revisar</h2>
        </div>
        {priorityProducts.length ? priorityProducts.map((product) => (
          <button key={product.id} onClick={() => onOpenProduct(product)} type="button">
            <span className={`stock-badge ${getStockStatus(product).tone}`}>{getStockStatus(product).label}</span>
            <strong>{product.nombre}</strong>
            <small>{product.categoria_nombre || 'Sin categoria'} - Stock {product.stock}</small>
          </button>
        )) : (
          <div className="catalog-empty-advice">
            <CheckCircle2 size={20} aria-hidden="true" />
            Catalogo sin alertas prioritarias.
          </div>
        )}
      </div>
    </section>
  );
}

export function ProductsManager() {
  const { user } = useAuth();
  const canSelectCompany = isSuperAdminRole(user?.rol);
  const [categories, setCategories] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ categoria: '', estado: '', query: '', signal: '' });
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
    return products.filter((product) => !filters.signal || getProductSignal(product) === filters.signal);
  }, [filters.signal, products]);

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
  }, [canSelectCompany, filters, page]);

  function updateFilters(nextFilter) {
    setFilters((current) => ({ ...current, ...nextFilter }));
    setPage(1);
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

      setEditingProduct(null);
      setIsProductModalOpen(false);
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
      <div className="products-unified-header">
        <div>
          <span className="products-header-icon">
            <PackageSearch size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Catalogo</p>
            <h1>Productos</h1>
            <p>Administra inventario, precios, categorias e imagenes por empresa.</p>
          </div>
        </div>
        <div>
          <Can permission="products.manage">
            <button
              className="secondary-button"
              onClick={() => setIsImportModalOpen(true)}
              type="button"
            >
              <FileSpreadsheet size={18} aria-hidden="true" />
              Subir Excel
            </button>
          </Can>
          <Can permission="products.manage">
            <button
              className="primary-button"
              onClick={() => {
                setEditingProduct(null);
                setIsProductModalOpen(true);
              }}
              type="button"
            >
              <PackagePlus size={18} aria-hidden="true" />
              Nuevo producto
            </button>
          </Can>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}

      <CatalogHealth insights={insights} />
      <CatalogRecommendations insights={insights} onOpenProduct={setSelectedProduct} />

      <section className="panel-section products-inventory-panel">
        <div className="product-inventory-toolbar">
          <span className="products-visible-count">
            {filteredProducts.length} de {pagination.total} visibles
          </span>
          <label className="product-search" htmlFor="product-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="product-search"
              onChange={(event) => updateFilters({ query: event.target.value })}
              placeholder="Buscar por nombre o SKU"
              type="search"
              value={filters.query}
            />
          </label>

          <div className="product-filter-group">
            <SlidersHorizontal size={18} aria-hidden="true" />
            <select
              aria-label="Filtrar por categoria"
              onChange={(event) => updateFilters({ categoria: event.target.value })}
              value={filters.categoria}
            >
              <option value="">Todas las categorias</option>
              {productCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nombre}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar por estado"
              onChange={(event) => updateFilters({ estado: event.target.value })}
              value={filters.estado}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
            </select>
            <select
              aria-label="Filtrar por senal"
              onChange={(event) => updateFilters({ signal: event.target.value })}
              value={filters.signal}
            >
              <option value="">Todas las senales</option>
              <option value="SIN_STOCK">Sin stock</option>
              <option value="BAJO_STOCK">Bajo stock</option>
              <option value="SIN_DESCRIPCION">Sin descripcion</option>
              <option value="SIN_IMAGEN">Sin imagen</option>
              <option value="LISTO">Listo para vender</option>
            </select>
          </div>

          <div className="view-toggle" aria-label="Cambiar vista">
            <button className={viewMode === 'cards' ? 'active' : ''} onClick={() => setViewMode('cards')} type="button">
              <Grid2X2 size={17} aria-hidden="true" />
              Cards
            </button>
            <button className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')} type="button">
              <List size={17} aria-hidden="true" />
              Tabla
            </button>
          </div>
        </div>

        <ProductTable
          isLoading={isLoading}
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
          <span>
            Pagina {pagination.page} de {pagination.totalPages}
          </span>
          <div>
            <button
              className="secondary-button"
              disabled={pagination.page <= 1 || isLoading}
              onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
              type="button"
            >
              Anterior
            </button>
            <button
              className="secondary-button"
              disabled={pagination.page >= pagination.totalPages || isLoading}
              onClick={() => setPage((currentPage) => currentPage + 1)}
              type="button"
            >
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
          <article className="catalog-modal" role="dialog" aria-modal="true" aria-labelledby="import-products-title">
            <button className="modal-close icon-button" onClick={() => setIsImportModalOpen(false)} type="button" aria-label="Cerrar importacion">
              x
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
          <article className="catalog-modal wide" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
            <button
              className="modal-close icon-button"
              onClick={() => {
                setIsProductModalOpen(false);
                setEditingProduct(null);
              }}
              type="button"
              aria-label="Cerrar formulario"
            >
              x
            </button>
            <div className="catalog-modal-header">
              <span>
                <PackagePlus size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Catalogo</p>
                <h2 id="product-form-title">{editingProduct ? 'Editar producto' : 'Nuevo producto'}</h2>
                <p>Manten nombre, precio, stock, categoria e imagen listos para vender.</p>
              </div>
            </div>
            <ProductForm
              canSelectCompany={canSelectCompany}
              categories={categories}
              companies={companies}
              isSaving={isSaving}
              onCancel={() => {
                setEditingProduct(null);
                setIsProductModalOpen(false);
              }}
              onSubmit={handleSubmit}
              product={editingProduct}
            />
          </article>
        </div>
      ) : null}

      {selectedProduct ? (
        <div className="modal-backdrop" role="presentation">
          <article className="product-detail-modal" role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
            <button className="modal-close icon-button" onClick={() => setSelectedProduct(null)} type="button" aria-label="Cerrar detalle">
              x
            </button>
            <div className="product-detail-media">
              {selectedProduct.imagen ? (
                <img alt={selectedProduct.nombre} src={selectedProduct.imagen} />
              ) : (
                <span>
                  <PackageSearch size={42} aria-hidden="true" />
                </span>
              )}
            </div>
            <div className="product-detail-copy">
              <div>
                <StatusBadge status={selectedProduct.estado}>{selectedProduct.estado}</StatusBadge>
                <h2 id="product-detail-title">{selectedProduct.nombre}</h2>
                <p>{selectedProduct.descripcion || 'Sin descripcion registrada.'}</p>
              </div>
              <dl>
                <div>
                  <dt>Precio</dt>
                  <dd>${formatPrice(selectedProduct.precio)}</dd>
                </div>
                <div>
                  <dt>Stock</dt>
                  <dd>
                    {selectedProduct.stock}
                    <span className={`stock-badge ${getStockStatus(selectedProduct).tone}`}>
                      {getStockStatus(selectedProduct).label}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Categoria</dt>
                  <dd>{selectedProduct.categoria_nombre || 'Sin categoria'}</dd>
                </div>
              </dl>
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setSelectedProduct(null)} type="button">
                  Cerrar
                </button>
                <Can permission="products.manage">
                  <button
                    className="primary-button"
                    onClick={() => {
                      setEditingProduct(selectedProduct);
                      setIsProductModalOpen(true);
                      setSelectedProduct(null);
                    }}
                    type="button"
                  >
                    Editar producto
                  </button>
                </Can>
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </div>
  );
}
