import { useEffect, useMemo, useState } from 'react';
import {
  DollarSign,
  Edit3,
  Eye,
  FilterX,
  Layers3,
  PackageCheck,
  PauseCircle,
  Plus,
  Power,
  Search,
  SlidersHorizontal,
  Trash2,
  Wrench,
  X
} from 'lucide-react';
import { ConfirmModal, EmptyState, ErrorState, StatusBadge } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isSuperAdminRole } from '../../config/permissions.js';
import { fetchCategories } from '../categories/categoriesApi.js';
import { fetchCompanies } from '../companies/companiesApi.js';
import { createService, deleteService, fetchServices, updateService } from './servicesApi.js';
import { ServiceForm } from './ServiceForm.jsx';
import { SortablePaginatedTable } from '../../components/ui/SortablePaginatedTable.jsx';

const initialFilters = {
  categoria: '',
  estado: '',
  price: '',
  query: ''
};

function getApiError(error) {
  return error?.response?.data?.message ?? 'No se pudo completar la operación.';
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase();
}

function getServiceDate(service) {
  return service.fecha_creacion ?? service.created_at ?? service.createdAt ?? '';
}

function getUpdatedDate(service) {
  return service.updated_at ?? service.fecha_actualizacion ?? service.updatedAt ?? getServiceDate(service);
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', { currency: 'MXN', style: 'currency' }).format(Number(value ?? 0));
}

function formatServicePrice(service) {
  const type = String(service?.tipo_precio ?? 'FIJO').toUpperCase();

  if (type === 'COTIZACION') {
    return 'Cotización con asesor';
  }

  if (type === 'DESDE') {
    return `Desde ${formatCurrency(service?.precio)}`;
  }

  if (type === 'POR_M2') {
    return `${formatCurrency(service?.precio)} / m²`;
  }

  if (type === 'POR_HORA') {
    return `${formatCurrency(service?.precio)} / hora`;
  }

  if (type === 'POR_UNIDAD') {
    return `${formatCurrency(service?.precio)} / unidad`;
  }

  return formatCurrency(service?.precio);
}

function getPriceTypeLabel(type) {
  return {
    FIJO: 'Precio fijo',
    DESDE: 'Desde',
    POR_UNIDAD: 'Por unidad',
    POR_M2: 'Por m2',
    POR_HORA: 'Por hora',
    COTIZACION: 'Cotización'
  }[String(type ?? 'FIJO').toUpperCase()] ?? 'Precio fijo';
}

function formatDuration(duration) {
  const value = Number(duration);
  return value > 0 ? `${value} min` : 'No aplica';
}

function formatUnit(unit) {
  return {
    servicio: 'Servicio',
    pieza: 'Pieza',
    paquete: 'Paquete',
    m2: 'm²',
    hora: 'Hora',
    asesor: 'Asesor'
  }[String(unit ?? '')] ?? 'No aplica';
}

function RequiredDataBadges({ service }) {
  const badges = [
    service.requiere_medidas ? 'Medidas' : null,
    service.requiere_cantidad ? 'Cantidad' : null
  ].filter(Boolean);

  if (!badges.length) {
    return <span className="service-muted-value">No aplica</span>;
  }

  return (
    <span className="service-required-badges">
      {badges.map((badge) => (
        <span key={badge}>{badge}</span>
      ))}
    </span>
  );
}

function hasFilters(filters) {
  return Object.values(filters).some(Boolean);
}

function ServicesHeader({ onCreate }) {
  return (
    <header className="services-hero">
      <div>
        <span className="services-header-icon">
          <Wrench size={24} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Catálogo de servicios</p>
          <h1>Servicios</h1>
          <p>Administra los servicios que ofreces, sus precios, disponibilidad y detalles principales.</p>
        </div>
      </div>
      <button className="primary-button" onClick={onCreate} type="button">
        <Plus size={18} aria-hidden="true" />
        Nuevo servicio
      </button>
    </header>
  );
}

function ServicesStats({ categories, isLoading, services }) {
  const stats = useMemo(() => {
    const active = services.filter((service) => service.estado === 'ACTIVO').length;
    const pricedServices = services.filter((service) => String(service.tipo_precio ?? 'FIJO').toUpperCase() !== 'COTIZACION');
    const averagePrice = pricedServices.length
      ? pricedServices.reduce((total, service) => total + Number(service.precio ?? 0), 0) / pricedServices.length
      : null;
    const usedCategories = new Set(services.map((service) => service.categoria_id).filter(Boolean));

    return {
      active,
      averagePrice,
      categories: usedCategories.size || categories.length,
      inactive: services.length - active,
      total: services.length
    };
  }, [categories.length, services]);

  const cards = [
    { key: 'total', icon: PackageCheck, label: 'Total de servicios', value: stats.total, detail: 'Catálogo disponible' },
    { key: 'active', icon: Power, label: 'Servicios activos', value: stats.active, detail: 'Listos para ofrecer', tone: 'success' },
    { key: 'inactive', icon: PauseCircle, label: 'Servicios inactivos', value: stats.inactive, detail: 'Pausados temporalmente', tone: 'warning' },
    { key: 'price', icon: DollarSign, label: 'Precio promedio', value: stats.averagePrice === null ? '-' : formatCurrency(stats.averagePrice), detail: 'Servicios con precio' },
    { key: 'categories', icon: Layers3, label: 'Categorías', value: stats.categories || '-', detail: stats.categories ? 'Organización disponible' : 'Dato no disponible' }
  ];

  return (
    <section className="services-stats-grid" aria-label="Métricas de servicios">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article className={`service-stat-card ${card.tone ?? ''}`} key={card.key}>
            {isLoading ? (
              <>
                <span className="service-skeleton service-skeleton-icon" />
                <div>
                  <span className="service-skeleton service-skeleton-line short" />
                  <span className="service-skeleton service-skeleton-line" />
                </div>
              </>
            ) : (
              <>
                <span>
                  <Icon size={19} aria-hidden="true" />
                </span>
                <div>
                  <strong>{card.value}</strong>
                  <small>{card.label}</small>
                  <p>{card.detail}</p>
                </div>
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}

function ServicesToolbar({
  categories,
  filters,
  onClear,
  onFilterChange,
  onPageSizeChange,
  pageSize,
  pageSizeOptions
}) {
  return (
    <div className="services-toolbar">
      <label className="services-page-size" htmlFor="services-page-size">
        <span>Filas por página</span>
        <select id="services-page-size" onChange={(event) => onPageSizeChange(Number(event.target.value))} value={pageSize}>
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>

      <label className="services-search" htmlFor="services-search">
        <Search size={18} aria-hidden="true" />
        <input
          id="services-search"
          onChange={(event) => onFilterChange({ query: event.target.value })}
          placeholder="Buscar por nombre, descripción o categoría"
          type="search"
          value={filters.query}
        />
      </label>

      <div className="service-filter-group">
        <SlidersHorizontal size={18} aria-hidden="true" />
        <select aria-label="Categoría" onChange={(event) => onFilterChange({ categoria: event.target.value })} value={filters.categoria}>
          <option value="">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.nombre}
            </option>
          ))}
        </select>
        <select aria-label="Estado" onChange={(event) => onFilterChange({ estado: event.target.value })} value={filters.estado}>
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activos</option>
          <option value="INACTIVO">Inactivos</option>
        </select>
        <select aria-label="Precio" onChange={(event) => onFilterChange({ price: event.target.value })} value={filters.price}>
          <option value="">Todos los precios</option>
          <option value="quoted">Cotización</option>
          <option value="priced">Con precio</option>
        </select>
      </div>

      <button className="secondary-button services-clear-button" disabled={!hasFilters(filters)} onClick={onClear} type="button">
        <FilterX size={17} aria-hidden="true" />
        Limpiar
      </button>
    </div>
  );
}

function PriceTypeBadge({ type }) {
  const value = String(type ?? 'FIJO').toUpperCase();
  return <span className={`service-price-type ${value.toLowerCase()}`}>{getPriceTypeLabel(value)}</span>;
}

function ServiceActions({ service, onDelete, onEdit, onToggle, onView }) {
  const isActive = service.estado === 'ACTIVO';

  return (
    <div className="service-actions">
      <button className="service-action view" aria-label={`Ver detalle de ${service.nombre}`} onClick={() => onView(service)} type="button" title="Ver detalle">
        <Eye size={16} aria-hidden="true" />
      </button>
      <button className="service-action edit" aria-label={`Editar ${service.nombre}`} onClick={() => onEdit(service)} type="button" title="Editar">
        <Edit3 size={16} aria-hidden="true" />
      </button>
      <button
        className={isActive ? 'service-action suspend' : 'service-action activate'}
        aria-label={isActive ? `Desactivar ${service.nombre}` : `Activar ${service.nombre}`}
        onClick={() => onToggle(service)}
        type="button"
        title={isActive ? 'Desactivar' : 'Activar'}
      >
        <Power size={16} aria-hidden="true" />
      </button>
      <button className="service-action delete" aria-label={`Eliminar ${service.nombre}`} onClick={() => onDelete(service)} type="button" title="Eliminar">
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function ServicesSkeleton() {
  return (
    <div className="service-table-skeleton" aria-label="Cargando servicios">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="service-table-skeleton-row" key={index}>
          <span className="service-skeleton service-skeleton-title" />
          <span className="service-skeleton service-skeleton-line" />
          <span className="service-skeleton service-skeleton-line short" />
          <span className="service-skeleton service-skeleton-line" />
          <span className="service-skeleton service-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

function ServicesTable({ onDelete, onEdit, onToggle, onView, pageSize, pageSizeOptions, services }) {
  const columns = [
    {
      key: 'nombre',
      label: 'Servicio',
      headerClassName: 'service-col-name',
      cellClassName: 'service-col-name',
      render: (service) => (
        <button className="service-table-name" onClick={() => onView(service)} type="button">
          <span className="service-table-icon">
            <Wrench size={16} aria-hidden="true" />
          </span>
          <span>
            <strong>{service.nombre}</strong>
            <small>{service.descripcion || 'Sin descripción'}</small>
          </span>
        </button>
      ),
      sortValue: (service) => service.nombre
    },
    {
      key: 'categoria',
      label: 'Categoría',
      headerClassName: 'service-col-category',
      cellClassName: 'service-col-category',
      render: (service) => service.categoria_nombre || 'Sin categoría',
      sortValue: (service) => service.categoria_nombre || ''
    },
    {
      key: 'precio',
      label: 'Precio/Modalidad',
      headerClassName: 'service-col-price',
      cellClassName: 'service-col-price',
      render: (service) => (
        <span className="service-table-price">
          {formatServicePrice(service)}
          <PriceTypeBadge type={service.tipo_precio} />
        </span>
      ),
      sortValue: (service) => Number(service.precio ?? 0)
    },
    {
      key: 'unidad',
      label: 'Unidad',
      headerClassName: 'service-col-unit',
      cellClassName: 'service-col-unit',
      render: (service) => formatUnit(service.unidad_medida),
      sortValue: (service) => service.unidad_medida || ''
    },
    {
      key: 'requiere_datos',
      label: 'Requiere datos',
      headerClassName: 'service-col-required',
      cellClassName: 'service-col-required',
      render: (service) => <RequiredDataBadges service={service} />,
      sortValue: (service) => `${service.requiere_medidas ? '1' : '0'}${service.requiere_cantidad ? '1' : '0'}`
    },
    {
      key: 'duracion',
      label: 'Duración',
      headerClassName: 'service-col-duration',
      cellClassName: 'service-col-duration',
      render: (service) => formatDuration(service.duracion),
      sortValue: (service) => Number(service.duracion ?? 0)
    },
    {
      key: 'estado',
      label: 'Estado',
      headerClassName: 'service-col-status',
      cellClassName: 'service-col-status',
      render: (service) => <StatusBadge status={service.estado}>{service.estado ?? 'Sin estado'}</StatusBadge>,
      sortValue: (service) => service.estado ?? ''
    },
    {
      key: 'empresa',
      label: 'Empresa',
      headerClassName: 'service-col-company',
      cellClassName: 'service-col-company',
      render: (service) => service.empresa_nombre || '-',
      sortValue: (service) => service.empresa_nombre || ''
    },
    {
      key: 'acciones',
      label: 'Acciones',
      headerClassName: 'service-col-actions',
      cellClassName: 'service-col-actions',
      render: (service) => (
        <ServiceActions service={service} onDelete={onDelete} onEdit={onEdit} onToggle={onToggle} onView={onView} />
      ),
      sortable: false
    }
  ];

  return (
    <div className="services-table-shell">
      <SortablePaginatedTable
        columns={columns}
        data={services}
        emptyMessage="No hay servicios para mostrar."
        footerStart={({ totalRows, visibleRows }) => (
          <span className="services-footer-count">
            {visibleRows} de {totalRows} visibles
          </span>
        )}
        getRowKey={(service) => service.id}
        initialSortKey="nombre"
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        showPageSizeSelector={false}
      />
    </div>
  );
}

function ServicesEmptyState({ filters, onClear, onCreate }) {
  const filtered = hasFilters(filters);

  return (
    <div className="services-empty-shell">
      <EmptyState
        icon={filtered ? Search : Wrench}
        title={filtered ? 'No encontramos servicios.' : 'No hay servicios registrados.'}
        description={filtered ? 'Intenta cambiar los filtros o limpiar la búsqueda.' : 'Agrega tu primer servicio para mostrar claramente lo que ofrece tu negocio.'}
        action={filtered ? (
          <button className="secondary-button" onClick={onClear} type="button">
            Limpiar filtros
          </button>
        ) : (
          <button className="primary-button" onClick={onCreate} type="button">
            <Plus size={17} aria-hidden="true" />
            Crear primer servicio
          </button>
        )}
      />
    </div>
  );
}

function ServiceDetailDrawer({ onClose, onEdit, service }) {
  return (
    <div className="services-drawer-backdrop" role="presentation">
      <aside className="service-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="service-detail-title">
        <button className="modal-close icon-button" onClick={onClose} type="button" aria-label="Cerrar detalle">
          <X size={16} aria-hidden="true" />
        </button>
        <div className="service-detail-header">
          <span>
            <Wrench size={24} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Detalle del servicio</p>
            <h2 id="service-detail-title">{service.nombre}</h2>
            <p>{service.categoria_nombre || 'Sin categoría'}</p>
          </div>
        </div>

        <dl className="service-detail-grid">
          <div>
            <dt>Estado</dt>
            <dd><StatusBadge status={service.estado}>{service.estado ?? '-'}</StatusBadge></dd>
          </div>
          <div>
            <dt>Precio</dt>
            <dd>{formatServicePrice(service)}</dd>
          </div>
          <div>
            <dt>Tipo de precio</dt>
            <dd><PriceTypeBadge type={service.tipo_precio} /></dd>
          </div>
          <div>
            <dt>Unidad</dt>
            <dd>{formatUnit(service.unidad_medida)}</dd>
          </div>
          <div>
            <dt>Requiere datos</dt>
            <dd><RequiredDataBadges service={service} /></dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>{formatDuration(service.duracion)}</dd>
          </div>
          <div>
            <dt>Empresa</dt>
            <dd>{service.empresa_nombre || '-'}</dd>
          </div>
          <div>
            <dt>Creación</dt>
            <dd>{formatDate(getServiceDate(service))}</dd>
          </div>
          <div>
            <dt>Actualización</dt>
            <dd>{formatDate(getUpdatedDate(service))}</dd>
          </div>
        </dl>

        <section className="service-detail-description">
          <h3>Descripción</h3>
          <p>{service.descripcion || 'Este servicio aún no tiene descripción.'}</p>
        </section>

        <section className="service-detail-description">
          <h3>Incluye</h3>
          <p>{service.incluye || 'No especificado.'}</p>
        </section>

        <section className="service-detail-description">
          <h3>No incluye</h3>
          <p>{service.no_incluye || 'No especificado.'}</p>
        </section>

        <section className="service-detail-description">
          <h3>Notas de cotización</h3>
          <p>{service.notas_cotizacion || 'No especificado.'}</p>
        </section>

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">Cerrar</button>
          <button className="primary-button" onClick={() => onEdit(service)} type="button">Editar servicio</button>
        </div>
      </aside>
    </div>
  );
}

export function ServicesManager() {
  const { user } = useAuth();
  const canSelectCompany = isSuperAdminRole(user?.rol);
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
  const [selectedService, setSelectedService] = useState(null);
  const [servicePageSize, setServicePageSize] = useState(10);
  const [services, setServices] = useState([]);
  const pageSizeOptions = [5, 10, 20];

  const filteredServices = useMemo(() => {
    const query = normalizeText(filters.query.trim());

    const matches = services.filter((service) => {
      const priceType = String(service.tipo_precio ?? 'FIJO').toUpperCase();
      const matchesQuery =
        !query ||
        normalizeText(service.nombre).includes(query) ||
        normalizeText(service.descripcion).includes(query) ||
        normalizeText(service.categoria_nombre).includes(query) ||
        normalizeText(service.empresa_nombre).includes(query);
      const matchesCategory = !filters.categoria || String(service.categoria_id ?? '') === filters.categoria;
      const matchesStatus = !filters.estado || service.estado === filters.estado;
      const matchesPrice =
        !filters.price ||
        (filters.price === 'quoted' ? priceType === 'COTIZACION' : priceType !== 'COTIZACION');

      return matchesQuery && matchesCategory && matchesStatus && matchesPrice;
    });

    return matches;
  }, [filters, services]);

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

  function openCreateForm() {
    setEditingService(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setEditingService(null);
    setIsFormOpen(false);
  }

  function updateFilters(nextFilter) {
    setFilters((current) => ({ ...current, ...nextFilter }));
  }

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingService) {
        await updateService(editingService.id, payload);
      } else {
        await createService(payload);
      }

      closeForm();
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
      setIsSaving(true);
      setError('');
      await deleteService(service.id);
      setPendingDelete(null);
      await loadData();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
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
        unidad_medida: service.unidad_medida || undefined,
        duracion_minutos: service.duracion_minutos ?? service.duracion ?? undefined,
        requiere_medidas: Boolean(service.requiere_medidas),
        requiere_cantidad: Boolean(service.requiere_cantidad),
        incluye: service.incluye,
        no_incluye: service.no_incluye,
        notas_cotizacion: service.notas_cotizacion,
        precio_minimo: service.precio_minimo,
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
      <ServicesHeader onCreate={openCreateForm} />

      {error ? <ErrorState message={error || 'No pudimos cargar los servicios. Intenta nuevamente.'} onRetry={loadData} /> : null}

      <ServicesStats categories={categories} isLoading={isLoading} services={services} />

      <section className="services-directory-panel" aria-label="Servicios registrados">
        <ServicesToolbar
          categories={categories}
          filters={filters}
          onClear={() => setFilters(initialFilters)}
          onFilterChange={updateFilters}
          onPageSizeChange={setServicePageSize}
          pageSize={servicePageSize}
          pageSizeOptions={pageSizeOptions}
        />

        {isLoading ? (
          <ServicesSkeleton />
        ) : filteredServices.length ? (
          <ServicesTable
            onDelete={setPendingDelete}
            onEdit={(nextService) => {
              setEditingService(nextService);
              setIsFormOpen(true);
            }}
            onToggle={setPendingToggle}
            onView={setSelectedService}
            pageSize={servicePageSize}
            pageSizeOptions={pageSizeOptions}
            services={filteredServices}
          />
        ) : (
          <ServicesEmptyState filters={filters} onClear={() => setFilters(initialFilters)} onCreate={openCreateForm} />
        )}
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide service-form-modal" role="dialog" aria-modal="true" aria-labelledby="service-form-title">
            <button className="modal-close icon-button" onClick={closeForm} type="button" aria-label="Cerrar formulario">
              <X size={16} aria-hidden="true" />
            </button>
            <div className="catalog-modal-header">
              <span>
                <Wrench size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Servicio</p>
                <h2 id="service-form-title">{editingService ? 'Editar servicio' : 'Nuevo servicio'}</h2>
                <p>Registra datos claros para que el equipo pueda vender, cotizar y dar seguimiento.</p>
              </div>
            </div>
            <ServiceForm
              canSelectCompany={canSelectCompany}
              categories={categories}
              companies={companies}
              isSaving={isSaving}
              onCancel={closeForm}
              onSubmit={handleSubmit}
              service={editingService}
            />
          </article>
        </div>
      ) : null}

      {selectedService ? (
        <ServiceDetailDrawer
          service={selectedService}
          onClose={() => setSelectedService(null)}
          onEdit={(service) => {
            setEditingService(service);
            setSelectedService(null);
            setIsFormOpen(true);
          }}
        />
      ) : null}

      <ConfirmModal
        destructive
        confirmLabel="Eliminar"
        description={`Se eliminará ${pendingDelete?.nombre ?? 'este servicio'} del catálogo.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => handleDelete(pendingDelete)}
        open={Boolean(pendingDelete)}
        title="Eliminar servicio"
      />

      <ConfirmModal
        confirmLabel={pendingToggle?.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
        description={
          pendingToggle?.estado === 'ACTIVO'
            ? `Se pausará ${pendingToggle?.nombre ?? 'este servicio'} sin eliminarlo.`
            : `Se reactivará ${pendingToggle?.nombre ?? 'este servicio'} para el catálogo.`
        }
        onCancel={() => setPendingToggle(null)}
        onConfirm={() => handleToggle(pendingToggle)}
        open={Boolean(pendingToggle)}
        title={pendingToggle?.estado === 'ACTIVO' ? 'Desactivar servicio' : 'Activar servicio'}
      />
    </div>
  );
}
