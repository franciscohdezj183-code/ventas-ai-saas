import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Edit3,
  Eye,
  FilterX,
  PackageCheck,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  ShoppingBag,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import { Can } from '../../components/Can.jsx';
import { EmptyState, ErrorState } from '../../components/ui/index.js';
import { createOrder, deleteOrder, fetchOrders, updateOrder } from './ordersApi.js';

const emptyForm = {
  cliente_nombre: '',
  telefono_cliente: '',
  estado: 'NUEVO',
  total: '',
  notas: ''
};

const initialFilters = {
  cliente: '',
  estado: '',
  fecha: '',
  sort: 'newest'
};

const orderStatusConfig = {
  NUEVO: { label: 'Pendiente', tone: 'pending', step: 1 },
  PENDIENTE: { label: 'Pendiente', tone: 'pending', step: 1 },
  CONFIRMADO: { label: 'Confirmado', tone: 'process', step: 2 },
  EN_PROCESO: { label: 'En proceso', tone: 'process', step: 3 },
  ENTREGADO: { label: 'Completado', tone: 'success', step: 4 },
  PAGADO: { label: 'Pagado', tone: 'success', step: 4 },
  ATENDIDO: { label: 'Atendido', tone: 'success', step: 4 },
  RECHAZADO: { label: 'Rechazado', tone: 'danger', step: 0 },
  CANCELADO: { label: 'Cancelado', tone: 'danger', step: 0 }
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

function getOrderStatus(order) {
  return String(order?.estado ?? 'NUEVO').toUpperCase();
}

function getStatusConfig(status) {
  return orderStatusConfig[status] ?? { label: status || 'Sin estado', tone: 'neutral', step: 1 };
}

function getOrderDate(order) {
  return order?.fecha ?? order?.created_at ?? order?.fecha_creacion ?? order?.updated_at ?? '';
}

function getUpdatedDate(order) {
  return order?.updated_at ?? order?.fecha_actualizacion ?? order?.fecha_modificacion ?? getOrderDate(order);
}

function parseOrderDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseOrderDate(value);

  if (!date) {
    return '-';
  }

  return date.toLocaleString('es-MX', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function getPaymentMethod(order) {
  return order?.metodo_pago ?? order?.payment_method ?? order?.forma_pago ?? order?.medio_pago ?? '';
}

function getOrderId(order) {
  return order?.folio ?? order?.numero ?? order?.codigo ?? `#${order?.id ?? '-'}`;
}

function getItemsCount(order) {
  const details = order?.items ?? order?.productos ?? order?.detalles ?? order?.line_items ?? [];
  if (Array.isArray(details) && details.length) {
    return details.reduce((total, item) => total + Number(item.cantidad ?? item.quantity ?? 1), 0);
  }

  return Number(order?.cantidad_productos ?? order?.items_count ?? order?.productos_count ?? 0);
}

function getOrderItems(order) {
  const details = order?.items ?? order?.productos ?? order?.detalles ?? order?.line_items ?? [];
  return Array.isArray(details) ? details : [];
}

function OrderStatusBadge({ status }) {
  const normalizedStatus = String(status ?? 'NUEVO').toUpperCase();
  const config = getStatusConfig(normalizedStatus);

  return <span className={`order-status-badge ${config.tone}`}>{config.label}</span>;
}

function OrderProgress({ status }) {
  const normalizedStatus = String(status ?? 'NUEVO').toUpperCase();
  const { step } = getStatusConfig(normalizedStatus);
  const isCancelled = ['CANCELADO', 'RECHAZADO'].includes(normalizedStatus);
  const stages = [
    { key: 'PENDIENTE', label: 'Pendiente' },
    { key: 'CONFIRMADO', label: 'Confirmado' },
    { key: 'EN_PROCESO', label: 'Proceso' },
    { key: 'ENTREGADO', label: normalizedStatus === 'PAGADO' ? 'Pagado' : 'Completado' }
  ];

  return (
    <div className={`order-progress ${isCancelled ? 'cancelled' : ''}`} aria-label={`Progreso: ${getStatusConfig(normalizedStatus).label}`}>
      {stages.map((stage, index) => (
        <span className={step >= index + 1 ? 'active' : ''} key={stage.key}>
          {stage.label}
        </span>
      ))}
    </div>
  );
}

function OrderForm({ initialOrder, isSaving, onCancel, onSubmit }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialOrder) {
      setForm({
        cliente_nombre: initialOrder.cliente_nombre ?? '',
        telefono_cliente: initialOrder.telefono_cliente ?? '',
        estado: initialOrder.estado ?? 'NUEVO',
        total: String(initialOrder.total ?? ''),
        notas: initialOrder.notas ?? ''
      });
      return;
    }

    setForm(emptyForm);
  }, [initialOrder]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
    setErrors((currentErrors) => ({ ...currentErrors, [name]: '' }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};

    if (!form.cliente_nombre.trim()) {
      nextErrors.cliente_nombre = 'El cliente es requerido.';
    }

    if (form.total === '' || Number(form.total) < 0) {
      nextErrors.total = 'El total debe ser mayor o igual a 0.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({
      ...form,
      total: Number(form.total)
    });
  }

  return (
    <form className="company-form order-form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid order-form-grid">
        <label className="field-group" htmlFor="order-customer">
          <span>Cliente</span>
          <input id="order-customer" name="cliente_nombre" onChange={handleChange} type="text" value={form.cliente_nombre} />
          {errors.cliente_nombre ? <small>{errors.cliente_nombre}</small> : null}
        </label>
        <label className="field-group" htmlFor="order-phone">
          <span>Telefono</span>
          <input id="order-phone" name="telefono_cliente" onChange={handleChange} type="tel" value={form.telefono_cliente} />
        </label>
        <label className="field-group" htmlFor="order-status">
          <span>Estado</span>
          <select id="order-status" name="estado" onChange={handleChange} value={form.estado}>
            <option value="NUEVO">Pendiente</option>
            <option value="CONFIRMADO">Confirmado</option>
            <option value="EN_PROCESO">En proceso</option>
            <option value="ENTREGADO">Completado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </label>
        <label className="field-group" htmlFor="order-total">
          <span>Total</span>
          <input id="order-total" min="0" name="total" onChange={handleChange} step="0.01" type="number" value={form.total} />
          {errors.total ? <small>{errors.total}</small> : null}
        </label>
        <label className="field-group full-field" htmlFor="order-notes">
          <span>Notas</span>
          <textarea id="order-notes" name="notas" onChange={handleChange} rows={3} value={form.notas} />
        </label>
      </div>
      <div className="form-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? 'Guardando...' : 'Guardar pedido'}
        </button>
      </div>
    </form>
  );
}

function OrdersSkeleton() {
  return (
    <div className="orders-skeleton" aria-label="Cargando pedidos">
      {Array.from({ length: 6 }).map((_, index) => (
        <article className="order-card skeleton" key={index}>
          <span className="order-avatar order-skeleton-piece" />
          <div className="order-card-main">
            <span className="order-skeleton-line wide" />
            <span className="order-skeleton-line medium" />
            <span className="order-skeleton-line short" />
          </div>
          <span className="order-skeleton-block" />
          <span className="order-skeleton-block" />
          <span className="order-skeleton-actions" />
        </article>
      ))}
    </div>
  );
}

function OrdersHeader({ isSaving, onCreate, onRefresh, summary }) {
  return (
    <header className="orders-hero">
      <div>
        <span className="orders-hero-icon">
          <ShoppingBag size={22} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">Order Management</p>
          <h1>Pedidos</h1>
          <p>Consulta, organiza y da seguimiento a los pedidos de tus clientes.</p>
        </div>
      </div>
      <div className="orders-header-actions">
        <button className="secondary-button" disabled={isSaving} onClick={onRefresh} type="button">
          <RefreshCcw size={18} aria-hidden="true" />
          Actualizar
        </button>
        <Can permission="orders.manage">
          <button className="primary-button" onClick={onCreate} type="button">
            <Plus size={18} aria-hidden="true" />
            Nuevo pedido
          </button>
        </Can>
      </div>
      <span className="orders-hero-summary">{summary.total} pedidos - {formatCurrency(summary.sales)}</span>
    </header>
  );
}

function OrdersStats({ summary }) {
  const cards = [
    { key: 'total', icon: ShoppingBag, label: 'Total de pedidos', value: summary.total, detail: 'Registros activos', tone: 'blue' },
    { key: 'pending', icon: Clock3, label: 'Pendientes', value: summary.pending, detail: 'Esperan atencion', tone: 'warning' },
    { key: 'process', icon: PackageCheck, label: 'En proceso', value: summary.process, detail: 'En seguimiento', tone: 'info' },
    { key: 'completed', icon: CheckCircle2, label: 'Completados', value: summary.completed, detail: 'Entregados o pagados', tone: 'success' },
    { key: 'cancelled', icon: XCircle, label: 'Cancelados', value: summary.cancelled, detail: 'Cancelados o rechazados', tone: 'danger' },
    { key: 'sales', icon: CreditCard, label: 'Venta total', value: formatCurrency(summary.sales), detail: 'Ingreso estimado', tone: 'revenue' }
  ];

  return (
    <section className="orders-kpi-grid" aria-label="Resumen de pedidos">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article className={`order-kpi-card ${card.tone}`} key={card.key}>
            <span className="order-kpi-icon">
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

function OrdersToolbar({ filters, hasFilters, onClear, onFilterChange, orders, visible }) {
  return (
    <div className="orders-toolbar">
      <label className="orders-search" htmlFor="orders-customer-search">
        <Search size={18} aria-hidden="true" />
        <input
          id="orders-customer-search"
          onChange={(event) => onFilterChange({ cliente: event.target.value })}
          placeholder="Buscar por cliente, telefono, ID o producto"
          type="search"
          value={filters.cliente}
        />
      </label>
      <label className="orders-filter" htmlFor="orders-status-filter">
        <ShoppingBag size={18} aria-hidden="true" />
        <select
          id="orders-status-filter"
          onChange={(event) => onFilterChange({ estado: event.target.value })}
          value={filters.estado}
        >
          <option value="">Todos los estados</option>
          <option value="NUEVO">Pendiente</option>
          <option value="CONFIRMADO">Confirmado</option>
          <option value="EN_PROCESO">En proceso</option>
          <option value="ENTREGADO">Completado</option>
          <option value="CANCELADO">Cancelado</option>
          <option value="PAGADO">Pagado</option>
          <option value="RECHAZADO">Rechazado</option>
        </select>
      </label>
      <label className="orders-filter" htmlFor="orders-date-filter">
        <CalendarDays size={18} aria-hidden="true" />
        <input
          id="orders-date-filter"
          onChange={(event) => onFilterChange({ fecha: event.target.value })}
          type="date"
          value={filters.fecha}
        />
      </label>
      <label className="orders-filter" htmlFor="orders-sort-filter">
        <ArrowDownUp size={18} aria-hidden="true" />
        <select
          id="orders-sort-filter"
          onChange={(event) => onFilterChange({ sort: event.target.value })}
          value={filters.sort}
        >
          <option value="newest">Mas recientes</option>
          <option value="oldest">Mas antiguos</option>
          <option value="highest">Mayor total</option>
        </select>
      </label>
      <button className="secondary-button orders-clear-button" disabled={!hasFilters} onClick={onClear} type="button">
        <FilterX size={17} aria-hidden="true" />
        Limpiar
      </button>
      <span className="orders-visible-count">
        {visible} de {orders} visibles
      </span>
    </div>
  );
}

function OrderCard({ isSaving, onDelete, onEdit, onView, order }) {
  const orderDate = getOrderDate(order);
  const itemsCount = getItemsCount(order);
  const payment = getPaymentMethod(order);

  return (
    <article className="order-card">
      <button className="order-avatar" onClick={() => onView(order)} type="button" aria-label={`Ver pedido ${getOrderId(order)}`}>
        <ShoppingBag size={18} aria-hidden="true" />
      </button>
      <div className="order-card-main">
        <div className="order-card-title">
          <button onClick={() => onView(order)} type="button">{getOrderId(order)}</button>
          <OrderStatusBadge status={order.estado} />
        </div>
        <strong>{order.cliente_nombre || 'Cliente sin nombre'}</strong>
        <span>
          <Phone size={14} aria-hidden="true" />
          {order.telefono_cliente || 'Sin telefono'}
        </span>
      </div>
      <div className="order-card-meta">
        <span>Fecha</span>
        <strong>{formatDate(orderDate)}</strong>
        <small>Actualizado: {formatDate(getUpdatedDate(order))}</small>
      </div>
      <div className="order-card-meta">
        <span>Total</span>
        <strong>{formatCurrency(order.total)}</strong>
        <small>{itemsCount || 'Sin'} productos</small>
      </div>
      <div className="order-card-payment">
        <span className="payment-method">
          <CreditCard size={15} aria-hidden="true" />
          {payment || 'No especificado'}
        </span>
      </div>
      <div className="order-card-actions">
        <button className="order-icon-button view" onClick={() => onView(order)} type="button" aria-label="Ver detalle">
          <Eye size={16} aria-hidden="true" />
        </button>
        <Can permission="orders.manage">
          <button className="order-icon-button edit" onClick={() => onEdit(order)} type="button" aria-label="Editar pedido">
            <Edit3 size={16} aria-hidden="true" />
          </button>
          <button className="order-icon-button delete" disabled={isSaving} onClick={() => onDelete(order)} type="button" aria-label="Eliminar pedido">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </Can>
      </div>
    </article>
  );
}

function OrdersList({ filteredOrders, isLoading, isSaving, onCreate, onDelete, onEdit, onRefresh, onView, orders }) {
  if (isLoading) {
    return <OrdersSkeleton />;
  }

  if (!orders.length) {
    return (
      <div className="orders-empty-shell">
        <EmptyState
          description="Cuando tus clientes realicen pedidos, apareceran aqui para que puedas darles seguimiento."
          title="No hay pedidos registrados."
        />
        <div className="orders-empty-actions">
          <button className="secondary-button" onClick={onRefresh} type="button">
            <RefreshCcw size={17} aria-hidden="true" />
            Actualizar
          </button>
          <Can permission="orders.manage">
            <button className="primary-button" onClick={onCreate} type="button">
              Crear primer pedido
            </button>
          </Can>
        </div>
      </div>
    );
  }

  if (!filteredOrders.length) {
    return (
      <div className="orders-empty-shell">
        <EmptyState description="Ajusta busqueda, fecha, estado u orden para volver a ver resultados." title="Sin pedidos con estos filtros" />
      </div>
    );
  }

  return (
    <div className="orders-list" aria-label="Lista de pedidos">
      {filteredOrders.map((order) => (
        <OrderCard
          isSaving={isSaving}
          key={order.id}
          onDelete={onDelete}
          onEdit={onEdit}
          onView={onView}
          order={order}
        />
      ))}
    </div>
  );
}

function OrderDetailDrawer({ onClose, onEdit, order }) {
  const items = getOrderItems(order);

  return (
    <div className="orders-drawer-backdrop" role="presentation">
      <aside className="orders-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
        <button className="modal-close icon-button" onClick={onClose} type="button" aria-label="Cerrar detalle">
          <X size={16} aria-hidden="true" />
        </button>
        <div className="orders-detail-header">
          <span>
            <ShoppingBag size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Detalle del pedido</p>
            <h2 id="order-detail-title">{getOrderId(order)}</h2>
            <p>{order.cliente_nombre || 'Cliente sin nombre'} - {formatDate(getOrderDate(order))}</p>
          </div>
        </div>

        <div className="orders-detail-summary">
          <div>
            <span>Estado</span>
            <OrderStatusBadge status={order.estado} />
          </div>
          <div>
            <span>Total</span>
            <strong>{formatCurrency(order.total)}</strong>
          </div>
          <div>
            <span>Cliente</span>
            <strong>{order.cliente_nombre || '-'}</strong>
          </div>
          <div>
            <span>Telefono</span>
            <strong>{order.telefono_cliente || '-'}</strong>
          </div>
        </div>

        <section className="orders-detail-section">
          <h3>Progreso</h3>
          <OrderProgress status={order.estado} />
        </section>

        <section className="orders-detail-section">
          <h3>Productos</h3>
          {items.length ? (
            <div className="orders-products-list">
              {items.map((item, index) => {
                const name = item.nombre ?? item.producto_nombre ?? item.name ?? `Producto ${index + 1}`;
                const quantity = Number(item.cantidad ?? item.quantity ?? 1);
                const price = Number(item.precio_unitario ?? item.precio ?? item.price ?? 0);
                return (
                  <article key={`${name}-${index}`}>
                    <div>
                      <strong>{name}</strong>
                      <span>Cantidad {quantity}</span>
                    </div>
                    <div>
                      <span>{formatCurrency(price)} c/u</span>
                      <strong>{formatCurrency(price * quantity)}</strong>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="orders-muted-copy">Este pedido no tiene productos detallados en la respuesta actual.</p>
          )}
        </section>

        <section className="orders-detail-section">
          <h3>Notas</h3>
          <p className="orders-muted-copy">{order.notas || 'Sin notas registradas.'}</p>
        </section>

        <div className="orders-detail-actions">
          <button className="secondary-button" onClick={onClose} type="button">Cerrar</button>
          <Can permission="orders.manage">
            <button className="primary-button" onClick={() => onEdit(order)} type="button">Editar pedido</button>
          </Can>
        </div>
      </aside>
    </div>
  );
}

export function OrdersPlaceholder() {
  const [orders, setOrders] = useState([]);
  const [editingOrder, setEditingOrder] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const summary = useMemo(() => ({
    cancelled: orders.filter((order) => ['CANCELADO', 'RECHAZADO'].includes(getOrderStatus(order))).length,
    completed: orders.filter((order) => ['ENTREGADO', 'PAGADO', 'ATENDIDO'].includes(getOrderStatus(order))).length,
    pending: orders.filter((order) => ['NUEVO', 'PENDIENTE'].includes(getOrderStatus(order))).length,
    process: orders.filter((order) => ['CONFIRMADO', 'EN_PROCESO'].includes(getOrderStatus(order))).length,
    sales: orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
    total: orders.length
  }), [orders]);

  const filteredOrders = useMemo(() => {
    const customerQuery = filters.cliente.trim().toLowerCase();

    const matches = orders.filter((order) => {
      const orderDate = getOrderDate(order);
      const orderId = String(getOrderId(order)).toLowerCase();
      const itemsText = getOrderItems(order)
        .map((item) => item.nombre ?? item.producto_nombre ?? item.name ?? '')
        .join(' ')
        .toLowerCase();
      const matchesCustomer =
        !customerQuery ||
        orderId.includes(customerQuery) ||
        itemsText.includes(customerQuery) ||
        order.cliente_nombre?.toLowerCase().includes(customerQuery) ||
        order.telefono_cliente?.toLowerCase().includes(customerQuery);
      const matchesStatus = !filters.estado || getOrderStatus(order) === filters.estado;
      const parsedDate = parseOrderDate(orderDate);
      const matchesDate = !filters.fecha || (parsedDate ? parsedDate.toISOString().slice(0, 10) === filters.fecha : false);

      return matchesCustomer && matchesStatus && matchesDate;
    });

    return [...matches].sort((first, second) => {
      if (filters.sort === 'highest') {
        return Number(second.total ?? 0) - Number(first.total ?? 0);
      }

      const firstDate = parseOrderDate(getOrderDate(first))?.getTime() ?? 0;
      const secondDate = parseOrderDate(getOrderDate(second))?.getTime() ?? 0;
      return filters.sort === 'oldest' ? firstDate - secondDate : secondDate - firstDate;
    });
  }, [filters, orders]);

  const hasFilters = Object.values(filters).some((value) => value && value !== 'newest');

  async function loadOrders() {
    try {
      setIsLoading(true);
      setError('');
      setOrders(await fetchOrders());
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  function openCreateForm() {
    setEditingOrder(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setEditingOrder(null);
    setIsFormOpen(false);
  }

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingOrder) {
        await updateOrder(editingOrder.id, payload);
      } else {
        await createOrder(payload);
      }

      closeForm();
      await loadOrders();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(order) {
    try {
      setIsSaving(true);
      setError('');
      await deleteOrder(order.id);
      await loadOrders();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="resource-page orders-page">
      <OrdersHeader
        isSaving={isSaving}
        onCreate={openCreateForm}
        onRefresh={loadOrders}
        summary={summary}
      />

      {error ? <ErrorState message={error} onRetry={loadOrders} /> : null}

      <OrdersStats summary={summary} />

      <section className="orders-directory-panel" aria-label="Pedidos registrados">
        <OrdersToolbar
          filters={filters}
          hasFilters={hasFilters}
          onClear={() => setFilters(initialFilters)}
          onFilterChange={(nextFilter) => setFilters((current) => ({ ...current, ...nextFilter }))}
          orders={orders.length}
          visible={filteredOrders.length}
        />

        <OrdersList
          filteredOrders={filteredOrders}
          isLoading={isLoading}
          isSaving={isSaving}
          onCreate={openCreateForm}
          onDelete={handleDelete}
          onEdit={(order) => {
            setEditingOrder(order);
            setIsFormOpen(true);
          }}
          onRefresh={loadOrders}
          onView={setSelectedOrder}
          orders={orders}
        />
      </section>

      {selectedOrder ? (
        <OrderDetailDrawer
          onClose={() => setSelectedOrder(null)}
          onEdit={(order) => {
            setEditingOrder(order);
            setIsFormOpen(true);
            setSelectedOrder(null);
          }}
          order={selectedOrder}
        />
      ) : null}

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide order-form-modal" role="dialog" aria-modal="true" aria-labelledby="order-form-title">
            <button className="modal-close icon-button" onClick={closeForm} type="button" aria-label="Cerrar formulario">
              <X size={16} aria-hidden="true" />
            </button>
            <div className="catalog-modal-header">
              <span>
                <ShoppingBag size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Pedido</p>
                <h2 id="order-form-title">{editingOrder ? 'Editar pedido' : 'Crear pedido'}</h2>
                <p>Registra cliente, estado, total y notas del pedido.</p>
              </div>
            </div>
            <OrderForm initialOrder={editingOrder} isSaving={isSaving} onCancel={closeForm} onSubmit={handleSubmit} />
          </article>
        </div>
      ) : null}
    </section>
  );
}
