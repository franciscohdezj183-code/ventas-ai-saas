import { useEffect, useMemo, useState } from 'react';
import { Filter, FolderTree, Plus, Search } from 'lucide-react';
import { ConfirmModal, ErrorState } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory
} from './categoriesApi.js';
import { CategoryForm } from './CategoryForm.jsx';
import { CategoryTable } from './CategoryTable.jsx';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

const initialFilters = {
  query: '',
  tipo: '',
  estado: '',
  empresa_id: ''
};

export function CategoriesManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
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

  const stats = useMemo(() => {
    const product = categories.filter((category) => (category.tipo ?? 'PRODUCTO') === 'PRODUCTO').length;
    const service = categories.filter((category) => category.tipo === 'SERVICIO').length;
    const active = categories.filter((category) => (category.estado ?? 'ACTIVA') === 'ACTIVA').length;

    return {
      total: categories.length,
      product,
      service,
      active
    };
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return categories.filter((category) => {
      const tipo = category.tipo ?? 'PRODUCTO';
      const estado = category.estado ?? 'ACTIVA';
      const matchesQuery =
        !query ||
        category.nombre?.toLowerCase().includes(query) ||
        category.empresa_nombre?.toLowerCase().includes(query);
      const matchesType = !filters.tipo || tipo === filters.tipo;
      const matchesStatus = !filters.estado || estado === filters.estado;
      const matchesCompany = !filters.empresa_id || String(category.empresa_id) === String(filters.empresa_id);

      return matchesQuery && matchesType && matchesStatus && matchesCompany;
    });
  }, [categories, filters]);

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

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingCategory) {
        await updateCategory(editingCategory.id, payload);
      } else {
        await createCategory(payload);
      }

      setEditingCategory(null);
      setIsFormOpen(false);
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
      setError('');
      await deleteCategory(category.id);
      setPendingDelete(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
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
      <div className="categories-unified-header">
        <div>
          <span className="categories-header-icon">
            <FolderTree size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Catalogo</p>
            <h1>Categorias</h1>
            <p>Organiza productos y servicios para mejorar busquedas y respuestas del bot.</p>
          </div>
        </div>
        <div>
          <button
            className="primary-button"
            onClick={() => {
              setEditingCategory(null);
              setIsFormOpen(true);
            }}
            type="button"
          >
            <Plus size={18} aria-hidden="true" />
            Crear categoria
          </button>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}

      <div className="categories-summary-grid">
        <article className="category-summary-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
          <p>Categorias creadas para catalogo.</p>
        </article>
        <article className="category-summary-card product">
          <span>PRODUCTO</span>
          <strong>{stats.product}</strong>
          <p>Ordenan inventario y consultas de venta.</p>
        </article>
        <article className="category-summary-card service">
          <span>SERVICIO</span>
          <strong>{stats.service}</strong>
          <p>Agrupan servicios ofrecidos por empresa.</p>
        </article>
        <article className="category-summary-card active">
          <span>Activas</span>
          <strong>{stats.active}</strong>
          <p>Disponibles para operar en el catalogo.</p>
        </article>
      </div>

      <section className="panel-section categories-directory-panel">
        <div className="categories-toolbar">
          <label className="product-search" htmlFor="categories-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="categories-search"
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar categoria o empresa"
              type="search"
              value={filters.query}
            />
          </label>

          <div className="category-filter-group">
            <Filter size={18} aria-hidden="true" />
            <select
              aria-label="Tipo"
              onChange={(event) => setFilters((current) => ({ ...current, tipo: event.target.value }))}
              value={filters.tipo}
            >
              <option value="">Todos los tipos</option>
              <option value="PRODUCTO">PRODUCTO</option>
              <option value="SERVICIO">SERVICIO</option>
            </select>
            <select
              aria-label="Estado"
              onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
              value={filters.estado}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVA">ACTIVA</option>
              <option value="INACTIVA">INACTIVA</option>
            </select>
          </div>

          {canSelectCompany ? (
            <select
              className="category-company-filter"
              aria-label="Empresa"
              onChange={(event) => setFilters((current) => ({ ...current, empresa_id: event.target.value }))}
              value={filters.empresa_id}
            >
              <option value="">Todas las empresas</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nombre}
                </option>
              ))}
            </select>
          ) : null}

          <span className="categories-visible-count">
            {filteredCategories.length} de {categories.length} visibles
          </span>
        </div>

        <CategoryTable
          categories={filteredCategories}
          isLoading={isLoading}
          onDelete={setPendingDelete}
          onEdit={(category) => {
            setEditingCategory(category);
            setIsFormOpen(true);
          }}
          onToggle={setPendingToggle}
        />
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide" role="dialog" aria-modal="true" aria-labelledby="category-form-title">
            <button
              className="modal-close icon-button"
              onClick={() => {
                setEditingCategory(null);
                setIsFormOpen(false);
              }}
              type="button"
              aria-label="Cerrar formulario"
            >
              x
            </button>
            <div className="catalog-modal-header">
              <span>
                <FolderTree size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Categoria</p>
                <h2 id="category-form-title">{editingCategory ? 'Editar categoria' : 'Crear categoria'}</h2>
                <p>Usa nombres claros para que los clientes encuentren opciones rapido.</p>
              </div>
            </div>
            <CategoryForm
              canSelectCompany={canSelectCompany}
              category={editingCategory}
              companies={companies}
              isSaving={isSaving}
              onCancel={() => {
                setEditingCategory(null);
                setIsFormOpen(false);
              }}
              onSubmit={handleSubmit}
            />
          </article>
        </div>
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
