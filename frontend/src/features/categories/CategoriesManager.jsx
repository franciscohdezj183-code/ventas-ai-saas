import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  CheckCircle2,
  FilterX,
  FolderTree,
  Layers3,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { ConfirmModal, ErrorState, StatusBadge } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isSuperAdminRole } from '../../config/permissions.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory
} from './categoriesApi.js';
import { CategoryForm } from './CategoryForm.jsx';
import {
  CategoryTable,
  formatCategoryDate,
  getCategoryDate,
  getCategoryProductCount
} from './CategoryTable.jsx';

const initialFilters = {
  empresa_id: '',
  estado: '',
  products: '',
  query: '',
  sort: 'recent',
  tipo: ''
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

function getUpdatedDate(category) {
  return category.updated_at ?? category.fecha_actualizacion ?? category.fecha_modificacion ?? getCategoryDate(category);
}

function CategoryTypeBadge({ type }) {
  const normalized = String(type ?? 'PRODUCTO').toUpperCase();
  return <span className={`category-type-badge ${normalized.toLowerCase()}`}>{normalized === 'SERVICIO' ? 'Servicio' : 'Producto'}</span>;
}

function CategoriesHeader({ onCreate }) {
  return (
    <header className="categories-hero">
      <div>
        <span className="categories-header-icon">
          <FolderTree size={24} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Organizacion del catalogo</p>
          <h1>Categorias</h1>
          <p>Organiza tus productos por grupos para que tu catalogo sea mas facil de administrar.</p>
        </div>
      </div>
      <button className="primary-button" onClick={onCreate} type="button">
        <Plus size={18} aria-hidden="true" />
        Nueva categoria
      </button>
    </header>
  );
}

function CategoriesStats({ categories, hasProductCounts }) {
  const active = categories.filter((category) => (category.estado ?? 'ACTIVA') === 'ACTIVA').length;
  const emptyCategories = hasProductCounts ? categories.filter((category) => getCategoryProductCount(category) === 0).length : null;
  const topCategory = hasProductCounts
    ? [...categories].sort((first, second) => (getCategoryProductCount(second) ?? 0) - (getCategoryProductCount(first) ?? 0))[0]
    : null;
  const topCount = topCategory ? getCategoryProductCount(topCategory) : null;
  const cards = [
    { key: 'total', icon: Layers3, label: 'Total de categorias', value: categories.length, detail: 'Grupos creados', tone: 'info' },
    { key: 'active', icon: CheckCircle2, label: 'Categorias activas', value: active, detail: 'Disponibles para operar', tone: 'success' },
    {
      key: 'empty',
      icon: Package,
      label: 'Sin productos',
      value: emptyCategories ?? '-',
      detail: hasProductCounts ? 'Disponibles para ordenar' : 'Dato no disponible',
      tone: 'warning'
    },
    {
      key: 'top',
      icon: ArrowDownAZ,
      label: 'Mas productos',
      value: topCount ?? '-',
      detail: topCategory?.nombre ?? 'Dato no disponible',
      tone: 'neutral'
    }
  ];

  return (
    <section className="categories-kpi-grid" aria-label="Metricas de categorias">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article className={`category-kpi-card ${card.tone}`} key={card.key}>
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

function CategoriesToolbar({
  canSelectCompany,
  companies,
  filters,
  hasFilters,
  hasProductCounts,
  onClear,
  onFilterChange,
  onPageSizeChange,
  pageSize,
  pageSizeOptions,
  total
}) {
  return (
    <div className="categories-toolbar">
      <label className="categories-page-size" htmlFor="categories-page-size">
        <span>Filas por pagina</span>
        <select id="categories-page-size" onChange={(event) => onPageSizeChange(Number(event.target.value))} value={pageSize}>
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>
      <label className="categories-search" htmlFor="categories-search">
        <Search size={18} aria-hidden="true" />
        <input
          id="categories-search"
          onChange={(event) => onFilterChange({ query: event.target.value })}
          placeholder="Buscar por nombre o empresa"
          type="search"
          value={filters.query}
        />
      </label>

      <div className="category-filter-group">
        <SlidersHorizontal size={18} aria-hidden="true" />
        <select aria-label="Tipo" onChange={(event) => onFilterChange({ tipo: event.target.value })} value={filters.tipo}>
          <option value="">Todos los tipos</option>
          <option value="PRODUCTO">Producto</option>
          <option value="SERVICIO">Servicio</option>
        </select>
        <select aria-label="Estado" onChange={(event) => onFilterChange({ estado: event.target.value })} value={filters.estado}>
          <option value="">Todos los estados</option>
          <option value="ACTIVA">Activa</option>
          <option value="INACTIVA">Inactiva</option>
        </select>
        {hasProductCounts ? (
          <select aria-label="Productos asociados" onChange={(event) => onFilterChange({ products: event.target.value })} value={filters.products}>
            <option value="">Todos</option>
            <option value="with">Con productos</option>
            <option value="empty">Sin productos</option>
          </select>
        ) : null}
        <select aria-label="Ordenar categorias" onChange={(event) => onFilterChange({ sort: event.target.value })} value={filters.sort}>
          <option value="recent">Mas recientes</option>
          <option value="name">Nombre A-Z</option>
          {hasProductCounts ? <option value="products">Mas productos</option> : null}
        </select>
      </div>

      {canSelectCompany ? (
        <select className="category-company-filter" aria-label="Empresa" onChange={(event) => onFilterChange({ empresa_id: event.target.value })} value={filters.empresa_id}>
          <option value="">Todas las empresas</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>{company.nombre}</option>
          ))}
        </select>
      ) : null}

      <button className="secondary-button categories-clear-button" disabled={!hasFilters} onClick={onClear} type="button">
        <FilterX size={17} aria-hidden="true" />
        Limpiar
      </button>

    </div>
  );
}

function CategoryDetailDrawer({ category, onClose, onEdit }) {
  const productCount = getCategoryProductCount(category);

  return (
    <div className="categories-drawer-backdrop" role="presentation">
      <aside className="category-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="category-detail-title">
        <button className="modal-close icon-button" onClick={onClose} type="button" aria-label="Cerrar detalle">
          <X size={16} aria-hidden="true" />
        </button>
        <div className="category-detail-header">
          <span>
            <FolderTree size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Detalle de categoria</p>
            <h2 id="category-detail-title">{category.nombre}</h2>
            <p>{category.empresa_nombre || 'Categoria del catalogo'}</p>
          </div>
        </div>

        <dl className="category-detail-grid">
          <div>
            <dt>Estado</dt>
            <dd><StatusBadge status={category.estado ?? 'ACTIVA'}>{category.estado ?? 'ACTIVA'}</StatusBadge></dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd><CategoryTypeBadge type={category.tipo} /></dd>
          </div>
          <div>
            <dt>Productos</dt>
            <dd>{productCount === null ? 'No disponible' : productCount}</dd>
          </div>
          <div>
            <dt>Empresa</dt>
            <dd>{category.empresa_nombre || '-'}</dd>
          </div>
          <div>
            <dt>Creacion</dt>
            <dd>{formatCategoryDate(getCategoryDate(category))}</dd>
          </div>
          <div>
            <dt>Actualizacion</dt>
            <dd>{formatCategoryDate(getUpdatedDate(category))}</dd>
          </div>
        </dl>

        <section className="category-detail-note">
          <h3>Resumen</h3>
          <p>
            {productCount === null
              ? 'La API actual no entrega un conteo de productos para esta categoria.'
              : productCount === 0
                ? 'Esta categoria todavia no tiene productos asociados.'
                : `Esta categoria organiza ${productCount} producto${productCount === 1 ? '' : 's'} del catalogo.`}
          </p>
        </section>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">Cerrar</button>
          <button className="primary-button" onClick={() => onEdit(category)} type="button">Editar categoria</button>
        </div>
      </aside>
    </div>
  );
}

export function CategoriesManager() {
  const { user } = useAuth();
  const canSelectCompany = isSuperAdminRole(user?.rol);
  const [categories, setCategories] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editingCategory, setEditingCategory] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [categoryPageSize, setCategoryPageSize] = useState(10);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const pageSizeOptions = [5, 10, 20];

  const hasProductCounts = useMemo(() => categories.some((category) => getCategoryProductCount(category) !== null), [categories]);

  const filteredCategories = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    const matches = categories.filter((category) => {
      const tipo = category.tipo ?? 'PRODUCTO';
      const estado = category.estado ?? 'ACTIVA';
      const count = getCategoryProductCount(category);
      const matchesQuery =
        !query ||
        category.nombre?.toLowerCase().includes(query) ||
        category.empresa_nombre?.toLowerCase().includes(query);
      const matchesType = !filters.tipo || tipo === filters.tipo;
      const matchesStatus = !filters.estado || estado === filters.estado;
      const matchesCompany = !filters.empresa_id || String(category.empresa_id) === String(filters.empresa_id);
      const matchesProducts =
        !filters.products ||
        !hasProductCounts ||
        (filters.products === 'empty' ? count === 0 : Number(count ?? 0) > 0);

      return matchesQuery && matchesType && matchesStatus && matchesCompany && matchesProducts;
    });

    return [...matches].sort((first, second) => {
      if (filters.sort === 'name') {
        return String(first.nombre ?? '').localeCompare(String(second.nombre ?? ''), 'es');
      }

      if (filters.sort === 'products') {
        return Number(getCategoryProductCount(second) ?? 0) - Number(getCategoryProductCount(first) ?? 0);
      }

      return new Date(getCategoryDate(second)).getTime() - new Date(getCategoryDate(first)).getTime();
    });
  }, [categories, filters, hasProductCounts]);

  const hasFilters = Object.entries(filters).some(([key, value]) => value && !(key === 'sort' && value === 'recent'));

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextCategories, nextCompanies] = await Promise.all([
        fetchCategories(),
        canSelectCompany ? fetchCompanies() : Promise.resolve([])
      ]);
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

  function updateFilters(nextFilter) {
    setFilters((current) => ({ ...current, ...nextFilter }));
  }

  function openCreateForm() {
    setEditingCategory(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setEditingCategory(null);
    setIsFormOpen(false);
  }

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
      } else {
        await createCategory(payload);
      }

      closeForm();
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(category) {
    if (!category) {
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await deleteCategory(category.id);
      setPendingDelete(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggle(category) {
    if (!category) {
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await updateCategory(category.id, {
        nombre: category.nombre,
        tipo: category.tipo ?? 'PRODUCTO',
        estado: (category.estado ?? 'ACTIVA') === 'ACTIVA' ? 'INACTIVA' : 'ACTIVA',
        empresa_id: category.empresa_id
      });
      setPendingToggle(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="resource-page categories-page">
      <CategoriesHeader onCreate={openCreateForm} />

      {error ? <ErrorState message={error || 'No pudimos cargar las categorias. Intenta nuevamente.'} onRetry={loadData} /> : null}

      <CategoriesStats categories={categories} hasProductCounts={hasProductCounts} />

      <section className="categories-directory-panel" aria-label="Categorias registradas">
        <CategoriesToolbar
          canSelectCompany={canSelectCompany}
          companies={companies}
          filters={filters}
          hasFilters={hasFilters}
          hasProductCounts={hasProductCounts}
          onClear={() => setFilters(initialFilters)}
          onFilterChange={updateFilters}
          onPageSizeChange={setCategoryPageSize}
          pageSize={categoryPageSize}
          pageSizeOptions={pageSizeOptions}
          total={categories.length}
        />

        <CategoryTable
          categories={filteredCategories}
          hasProductCounts={hasProductCounts}
          hasFilters={hasFilters}
          isLoading={isLoading}
          onClearFilters={() => setFilters(initialFilters)}
          onCreate={openCreateForm}
          onDelete={setPendingDelete}
          onEdit={(category) => {
            setEditingCategory(category);
            setIsFormOpen(true);
          }}
          onToggle={setPendingToggle}
          onView={setSelectedCategory}
          pageSize={categoryPageSize}
          pageSizeOptions={pageSizeOptions}
        />
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide category-form-modal" role="dialog" aria-modal="true" aria-labelledby="category-form-title">
            <button className="modal-close icon-button" onClick={closeForm} type="button" aria-label="Cerrar formulario">
              <X size={16} aria-hidden="true" />
            </button>
            <div className="category-drawer-header">
              <span>
                <FolderTree size={24} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Categoria</p>
                <h2 id="category-form-title">{editingCategory ? 'Editar categoria' : 'Nueva categoria'}</h2>
                <p>Usa nombres claros para ordenar el catalogo sin confundir al equipo.</p>
              </div>
            </div>
            <CategoryForm
              canSelectCompany={canSelectCompany}
              category={editingCategory}
              companies={companies}
              isSaving={isSaving}
              onCancel={closeForm}
              onSubmit={handleSubmit}
            />
          </article>
        </div>
      ) : null}

      {selectedCategory ? (
        <CategoryDetailDrawer
          category={selectedCategory}
          onClose={() => setSelectedCategory(null)}
          onEdit={(category) => {
            setEditingCategory(category);
            setIsFormOpen(true);
            setSelectedCategory(null);
          }}
        />
      ) : null}

      <ConfirmModal
        destructive
        confirmLabel="Eliminar"
        description={`Se eliminara ${pendingDelete?.nombre ?? 'esta categoria'} del catalogo.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => handleDelete(pendingDelete)}
        open={Boolean(pendingDelete)}
        title="Eliminar categoria"
      />

      <ConfirmModal
        confirmLabel={(pendingToggle?.estado ?? 'ACTIVA') === 'ACTIVA' ? 'Desactivar' : 'Activar'}
        description={
          (pendingToggle?.estado ?? 'ACTIVA') === 'ACTIVA'
            ? `Se ocultara ${pendingToggle?.nombre ?? 'esta categoria'} del catalogo activo.`
            : `Se activara ${pendingToggle?.nombre ?? 'esta categoria'} nuevamente.`
        }
        onCancel={() => setPendingToggle(null)}
        onConfirm={() => handleToggle(pendingToggle)}
        open={Boolean(pendingToggle)}
        title={(pendingToggle?.estado ?? 'ACTIVA') === 'ACTIVA' ? 'Desactivar categoria' : 'Activar categoria'}
      />
    </div>
  );
}
