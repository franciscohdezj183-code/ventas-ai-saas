import { useEffect, useMemo, useState } from 'react';
import { Clock3, Edit3, Filter, Plus, Power, Search, Wrench } from 'lucide-react';
import { ConfirmModal, EmptyState, ErrorState, StatusBadge } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCategories } from '../categories/categoriesApi.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import { createService, deleteService, fetchServices, updateService } from './servicesApi.js';
import { ServiceForm } from './ServiceForm.jsx';

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operacion.';
}

const initialFilters = {
  query: '',
  categoria: '',
  estado: ''
};

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', { currency: 'MXN', style: 'currency' }).format(Number(value ?? 0));
}

function formatServicePrice(service) {
  const type = String(service?.tipo_precio ?? 'FIJO').toUpperCase();

  if (type === 'COTIZACION') {
    return 'Cotizacion con asesor';
  }

  if (type === 'DESDE') {
    return `Desde ${formatCurrency(service?.precio)}`;
  }

  if (type === 'POR_M2') {
    return `${formatCurrency(service?.precio)} / m2`;
  }

  return formatCurrency(service?.precio);
}

function PriceTypeBadge({ type }) {
  const value = String(type ?? 'FIJO').toUpperCase();
  const label = {
    FIJO: 'Precio fijo',
    DESDE: 'Desde',
    POR_M2: 'Por m2',
    COTIZACION: 'Cotizacion'
  }[value] ?? 'Precio fijo';

  return <span className={`service-price-type ${value.toLowerCase()}`}>{label}</span>;
}

function DurationBadge({ duration }) {
  return (
    <span className="service-duration-badge">
      <Clock3 size={15} aria-hidden="true" />
      {duration ? `${duration} min` : 'Sin duracion'}
    </span>
  );
}

export function ServicesManager() {
  const { user } = useAuth();
  const canSelectCompany = user?.rol === 'SUPER_ADMIN';
  const [categories, setCategories] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editingService, setEditingService] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [services, setServices] = useState([]);

  const filteredServices = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return services.filter((service) => {
      const matchesQuery =
        !query ||
        service.nombre?.toLowerCase().includes(query) ||
        service.descripcion?.toLowerCase().includes(query) ||
        service.empresa_nombre?.toLowerCase().includes(query);
      const matchesCategory = !filters.categoria || String(service.categoria_id ?? '') === filters.categoria;
      const matchesStatus = !filters.estado || service.estado === filters.estado;

      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [filters, services]);

  const stats = useMemo(() => {
    const active = services.filter((service) => service.estado === 'ACTIVO').length;
    return {
      total: services.length,
      active,
      inactive: services.length - active
    };
  }, [services]);

  async function loadData() {
    try {
      setIsLoading(true);
      setError('');
      const [nextServices, nextCompanies, nextCategories] = await Promise.all([
        fetchServices(),
        canSelectCompany ? fetchCompanies() : Promise.resolve([]),
        fetchCategories()
      ]);
      setServices(nextServices);
      setCompanies(nextCompanies);
      setCategories(nextCategories.filter((category) => (category.tipo ?? 'SERVICIO') === 'SERVICIO'));
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

      if (editingService) {
        await updateService(editingService.id, payload);
      } else {
        await createService(payload);
      }

      setEditingService(null);
      setIsFormOpen(false);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(service) {
    if (!service) {
      return;
    }

    try {
      setError('');
      await deleteService(service.id);
      setPendingDelete(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function handleToggle(service) {
    if (!service) {
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await updateService(service.id, {
        nombre: service.nombre,
        descripcion: service.descripcion,
        precio: service.precio,
        tipo_precio: service.tipo_precio ?? 'FIJO',
        duracion: service.duracion,
        categoria_id: service.categoria_id || undefined,
        estado: service.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO',
        empresa_id: service.empresa_id
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
    <div className="resource-page services-page">
      <div className="services-unified-header">
        <div>
          <span className="services-header-icon">
            <Wrench size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Catalogo</p>
            <h1>Servicios</h1>
            <p>Administra servicios, precios y duraciones para respuestas comerciales precisas.</p>
          </div>
        </div>
        <div>
          <div className="services-header-metric">
            <strong>{stats.total}</strong>
            <span>servicios registrados</span>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setEditingService(null);
              setIsFormOpen(true);
            }}
            type="button"
          >
            <Plus size={18} aria-hidden="true" />
            Nuevo servicio
          </button>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadData} /> : null}

      <div className="services-summary-grid">
        <article className="service-summary-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
          <p>Servicios disponibles en el catalogo.</p>
        </article>
        <article className="service-summary-card active">
          <span>Activos</span>
          <strong>{stats.active}</strong>
          <p>Visibles para cotizacion y respuestas.</p>
        </article>
        <article className="service-summary-card inactive">
          <span>Inactivos</span>
          <strong>{stats.inactive}</strong>
          <p>Pausados temporalmente.</p>
        </article>
      </div>

      <section className="panel-section services-directory-panel">
        <div className="services-toolbar">
          <label className="product-search" htmlFor="services-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="services-search"
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar servicio, descripcion o empresa"
              type="search"
              value={filters.query}
            />
          </label>

          <div className="service-filter-group">
            <Filter size={18} aria-hidden="true" />
            <select
              aria-label="Categoria"
              onChange={(event) => setFilters((current) => ({ ...current, categoria: event.target.value }))}
              value={filters.categoria}
            >
              <option value="">Todas las categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nombre}
                </option>
              ))}
            </select>
            <select
              aria-label="Estado"
              onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
              value={filters.estado}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVO">ACTIVO</option>
              <option value="INACTIVO">INACTIVO</option>
            </select>
          </div>

          <span className="services-visible-count">
            {filteredServices.length} de {services.length} visibles
          </span>
        </div>

        {isLoading ? (
          <EmptyState title="Cargando servicios" description="Estamos preparando el catalogo de servicios." />
        ) : filteredServices.length ? (
          <div className="service-card-grid">
            {filteredServices.map((service) => (
              <article className="service-card" key={service.id}>
                <header>
                  <div>
                    <span className="service-card-icon">
                      <Wrench size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h2>{service.nombre}</h2>
                      <p>{service.categoria_nombre || 'Sin categoria'}</p>
                      <PriceTypeBadge type={service.tipo_precio} />
                    </div>
                  </div>
                  <StatusBadge status={service.estado}>{service.estado}</StatusBadge>
                </header>
                <p className="service-card-description">{service.descripcion || 'Sin descripcion configurada.'}</p>
                <div className="service-card-meta">
                  <div>
                    <span>Precio</span>
                    <strong>{formatServicePrice(service)}</strong>
                  </div>
                  <div>
                    <span>Duracion</span>
                    <DurationBadge duration={service.duracion} />
                  </div>
                </div>
                <footer>
                  <span>{service.empresa_nombre}</span>
                  <div className="table-actions">
                    <button
                      aria-label="Editar servicio"
                      onClick={() => {
                        setEditingService(service);
                        setIsFormOpen(true);
                      }}
                      type="button"
                    >
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    <button
                      aria-label={service.estado === 'ACTIVO' ? 'Desactivar servicio' : 'Activar servicio'}
                      onClick={() => setPendingToggle(service)}
                      type="button"
                    >
                      <Power size={16} aria-hidden="true" />
                    </button>
                  </div>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No hay servicios para mostrar"
            description="Crea un servicio o ajusta los filtros para ver el catalogo."
          />
        )}
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide" role="dialog" aria-modal="true" aria-labelledby="service-form-title">
            <button
              className="modal-close icon-button"
              onClick={() => {
                setEditingService(null);
                setIsFormOpen(false);
              }}
              type="button"
              aria-label="Cerrar formulario"
            >
              x
            </button>
            <div className="catalog-modal-header">
              <span>
                <Wrench size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Servicio</p>
                <h2 id="service-form-title">{editingService ? 'Editar servicio' : 'Nuevo servicio'}</h2>
                <p>Registra servicios que el bot pueda ofrecer y cotizar.</p>
              </div>
            </div>
            <ServiceForm
              canSelectCompany={canSelectCompany}
              categories={categories}
              companies={companies}
              isSaving={isSaving}
              onCancel={() => {
                setEditingService(null);
                setIsFormOpen(false);
              }}
              onSubmit={handleSubmit}
              service={editingService}
            />
          </article>
        </div>
      ) : null}

      <ConfirmModal
        destructive
        confirmLabel="Eliminar"
        description={`Se eliminara ${pendingDelete?.nombre ?? 'este servicio'} del catalogo.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => handleDelete(pendingDelete)}
        open={Boolean(pendingDelete)}
        title="Eliminar servicio"
      />

      <ConfirmModal
        confirmLabel={pendingToggle?.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
        description={
          pendingToggle?.estado === 'ACTIVO'
            ? `Se pausara ${pendingToggle?.nombre ?? 'este servicio'} sin eliminarlo.`
            : `Se reactivara ${pendingToggle?.nombre ?? 'este servicio'} para el catalogo.`
        }
        onCancel={() => setPendingToggle(null)}
        onConfirm={() => handleToggle(pendingToggle)}
        open={Boolean(pendingToggle)}
        title={pendingToggle?.estado === 'ACTIVO' ? 'Desactivar servicio' : 'Activar servicio'}
      />
    </div>
  );
}
