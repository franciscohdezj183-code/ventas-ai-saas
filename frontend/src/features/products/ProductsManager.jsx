import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Grid2X2, List, PackagePlus, PackageSearch, Search, SlidersHorizontal } from 'lucide-react';
import { ConfirmModal, ErrorState, StatusBadge } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCategories } from '../categories/categoriesApi.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  createProduct,
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

export function ProductsManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [categories, setCategories] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ categoria: '', estado: '', query: '' });
  const [importResult, setImportResult] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState(null);
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [viewMode, setViewMode] = useState('cards');

  const productCategories = useMemo(() => {
    const seen = new Map();

    products.forEach((product) => {
      if (product.categoria_id && product.categoria_nombre) {
        seen.set(String(product.categoria_id), product.categoria_nombre);
      }
    });

    return Array.from(seen, ([id, nombre]) => ({ id, nombre }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesQuery =
        !query ||
        product.nombre?.toLowerCase().includes(query) ||
        product.sku?.toLowerCase().includes(query);
      const matchesCategory = !filters.categoria || String(product.categoria_id ?? '') === filters.categoria;
      const matchesStatus = !filters.estado || product.estado === filters.estado;

      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [filters, products]);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextProducts, nextCategories, nextCompanies] = await Promise.all([
        fetchProducts(),
        fetchCategories(),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);
      setProducts(nextProducts);
      setCategories(nextCategories);
      setCompanies(nextCompanies);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [canSelectCompany]);

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
          <div className="products-header-metric">
            <strong>{products.length}</strong>
            <span>productos registrados</span>
          </div>
          <button
            className="secondary-button"
            onClick={() => setIsImportModalOpen(true)}
            type="button"
          >
            <FileSpreadsheet size={18} aria-hidden="true" />
            Subir Excel
          </button>
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
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}

      <section className="panel-section products-inventory-panel">
        <div className="product-inventory-toolbar">
          <span className="products-visible-count">{filteredProducts.length} de {products.length} visibles</span>
          <label className="product-search" htmlFor="product-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="product-search"
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar por nombre o SKU"
              type="search"
              value={filters.query}
            />
          </label>

          <div className="product-filter-group">
            <SlidersHorizontal size={18} aria-hidden="true" />
            <select
              aria-label="Filtrar por categoria"
              onChange={(event) => setFilters((current) => ({ ...current, categoria: event.target.value }))}
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
              onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
              value={filters.estado}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
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
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </div>
  );
}
