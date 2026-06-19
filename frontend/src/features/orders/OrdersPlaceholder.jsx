import { useEffect, useMemo, useState } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import {
  CalendarDays,
  CreditCard,
  Edit3,
  Eye,
  Plus,
  RefreshCcw,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  X
} from 'lucide-react';
import { Can } from '../../components/Can.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/index.js';
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
  fecha: ''
};

const orderStatusConfig = {
  NUEVO: { label: 'Pendiente', step: 1 },
  PENDIENTE: { label: 'Pendiente', step: 1 },
  CONFIRMADO: { label: 'Confirmado', step: 2 },
  EN_PROCESO: { label: 'En proceso', step: 3 },
  ENTREGADO: { label: 'Entregado', step: 4 },
  PAGADO: { label: 'Pagado', step: 4 },
  CANCELADO: { label: 'Cancelado', step: 0 }
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
  return orderStatusConfig[status] ?? { label: status || 'Sin estado', step: 1 };
}

function getOrderDate(order) {
  return order?.fecha ?? order?.created_at ?? order?.fecha_creacion ?? order?.updated_at ?? '';
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

function getDateKey(order) {
  const date = parseOrderDate(getOrderDate(order));

  if (!date) {
    return 'Sin fecha';
  }

  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short'
  });
}

function getPaymentMethod(order) {
  return order?.metodo_pago ?? order?.payment_method ?? order?.forma_pago ?? order?.medio_pago ?? '';
}

function OrderStatusBadge({ status }) {
  const normalizedStatus = String(status ?? 'NUEVO').toUpperCase();
  const config = getStatusConfig(normalizedStatus);

  return <span className={`order-status-badge ${normalizedStatus.toLowerCase()}`}>{config.label}</span>;
}

function OrderProgress({ status }) {
  const normalizedStatus = String(status ?? 'NUEVO').toUpperCase();
  const { step } = getStatusConfig(normalizedStatus);
  const stages = [
    { key: 'PENDIENTE', label: 'Pendiente' },
    { key: 'CONFIRMADO', label: 'Confirmado' },
    { key: 'EN_PROCESO', label: 'Proceso' },
    { key: 'ENTREGADO', label: normalizedStatus === 'PAGADO' ? 'Pagado' : 'Entregado' }
  ];

  return (
    <div className={`order-progress ${normalizedStatus === 'CANCELADO' ? 'cancelled' : ''}`} aria-label={`Progreso: ${getStatusConfig(normalizedStatus).label}`}>
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
      <div className="form-grid">
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
            <option value="NUEVO">NUEVO</option>
            <option value="CONFIRMADO">CONFIRMADO</option>
            <option value="EN_PROCESO">EN_PROCESO</option>
            <option value="ENTREGADO">ENTREGADO</option>
            <option value="CANCELADO">CANCELADO</option>
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
    completed: orders.filter((order) => ['ENTREGADO', 'PAGADO'].includes(getOrderStatus(order))).length,
    pending: orders.filter((order) => ['NUEVO', 'PENDIENTE'].includes(getOrderStatus(order))).length,
    sales: orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
    total: orders.length
  }), [orders]);

  const filteredOrders = useMemo(() => {
    const customerQuery = filters.cliente.trim().toLowerCase();

    return orders.filter((order) => {
      const orderDate = getOrderDate(order);
      const matchesCustomer =
        !customerQuery ||
        order.cliente_nombre?.toLowerCase().includes(customerQuery) ||
        order.telefono_cliente?.toLowerCase().includes(customerQuery);
      const matchesStatus = !filters.estado || getOrderStatus(order) === filters.estado;
      const parsedDate = parseOrderDate(orderDate);
      const matchesDate = !filters.fecha || (parsedDate ? parsedDate.toISOString().slice(0, 10) === filters.fecha : false);

      return matchesCustomer && matchesStatus && matchesDate;
    });
  }, [filters, orders]);

  const ordersByStatus = useMemo(() => {
    const statusTotals = new Map();

    orders.forEach((order) => {
      const status = getOrderStatus(order);
      const label = getStatusConfig(status).label;
      statusTotals.set(label, (statusTotals.get(label) ?? 0) + 1);
    });

    return [...statusTotals.entries()].map(([label, value], id) => ({ id, label, value }));
  }, [orders]);

  const ordersByDay = useMemo(() => {
    const dayTotals = new Map();

    orders.forEach((order) => {
      const key = getDateKey(order);
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + 1);
    });

    return [...dayTotals.entries()].slice(-8).map(([day, total]) => ({ day, total }));
  }, [orders]);

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

  async function handleSubmit(payload) {
    try {
      setIsSaving(true);
      setError('');

      if (editingOrder) {
        await updateOrder(editingOrder.id, payload);
      } else {
        await createOrder(payload);
      }

      setEditingOrder(null);
      setIsFormOpen(false);
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
      <div className="orders-hero">
        <div>
          <span className="orders-hero-icon">
            <ShoppingBag size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Operacion comercial</p>
            <h1>Pedidos</h1>
            <p>{summary.total} pedidos - {formatCurrency(summary.sales)} en ventas estimadas.</p>
          </div>
        </div>
        <div className="orders-header-actions">
          <button className="secondary-button" disabled={isSaving} onClick={loadOrders} type="button">
            <RefreshCcw size={18} aria-hidden="true" />
            Actualizar
          </button>
          <Can permission="orders.manage">
            <button
              className="primary-button"
              onClick={() => {
                setEditingOrder(null);
                setIsFormOpen(true);
              }}
              type="button"
            >
              <Plus size={18} aria-hidden="true" />
              Crear pedido
            </button>
          </Can>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={loadOrders} /> : null}

      <div className="orders-kpi-grid">
        <article className="order-kpi-card">
          <span>Total</span>
          <strong>{summary.total}</strong>
          <p>Pedidos registrados.</p>
        </article>
        <article className="order-kpi-card pending">
          <span>Pendientes</span>
          <strong>{summary.pending}</strong>
          <p>Esperan confirmacion.</p>
        </article>
        <article className="order-kpi-card completed">
          <span>Cerrados</span>
          <strong>{summary.completed}</strong>
          <p>Entregados o pagados.</p>
        </article>
        <article className="order-kpi-card revenue">
          <span>Venta estimada</span>
          <strong>{formatCurrency(summary.sales)}</strong>
          <p>Total acumulado.</p>
        </article>
      </div>

      <div className="orders-insights-grid">
        <article className="orders-chart-card">
          <div>
            <h2>Pedidos por estado</h2>
            <p>Distribucion actual del flujo.</p>
          </div>
          {ordersByStatus.length ? (
            <PieChart
              height={220}
              series={[{ data: ordersByStatus, innerRadius: 58, outerRadius: 92, paddingAngle: 3 }]}
              slotProps={{ legend: { direction: 'row', position: { horizontal: 'middle', vertical: 'bottom' } } }}
            />
          ) : (
            <EmptyState description="Aun no hay pedidos para graficar." title="Sin distribucion" />
          )}
        </article>
        <article className="orders-chart-card">
          <div>
            <h2>Pedidos por dia</h2>
            <p>Volumen reciente de registros.</p>
          </div>
          {ordersByDay.length ? (
            <BarChart
              height={220}
              series={[{ data: ordersByDay.map((item) => item.total), label: 'Pedidos' }]}
              xAxis={[{ data: ordersByDay.map((item) => item.day), scaleType: 'band' }]}
            />
          ) : (
            <EmptyState description="Los pedidos apareceran aqui al registrarse." title="Sin tendencia" />
          )}
        </article>
      </div>

      <section className="panel-section orders-directory-panel">
        <div className="orders-toolbar">
          <label className="orders-search" htmlFor="orders-customer-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="orders-customer-search"
              onChange={(event) => setFilters((current) => ({ ...current, cliente: event.target.value }))}
              placeholder="Buscar por cliente o telefono"
              type="search"
              value={filters.cliente}
            />
          </label>
          <label className="orders-filter" htmlFor="orders-date-filter">
            <CalendarDays size={18} aria-hidden="true" />
            <input
              id="orders-date-filter"
              onChange={(event) => setFilters((current) => ({ ...current, fecha: event.target.value }))}
              type="date"
              value={filters.fecha}
            />
          </label>
          <label className="orders-filter" htmlFor="orders-status-filter">
            <ShoppingBag size={18} aria-hidden="true" />
            <select
              id="orders-status-filter"
              onChange={(event) => setFilters((current) => ({ ...current, estado: event.target.value }))}
              value={filters.estado}
            >
              <option value="">Todos los estados</option>
              <option value="NUEVO">Pendiente</option>
              <option value="CONFIRMADO">Confirmado</option>
              <option value="EN_PROCESO">En proceso</option>
              <option value="ENTREGADO">Entregado</option>
              <option value="CANCELADO">Cancelado</option>
              <option value="PAGADO">Pagado</option>
            </select>
          </label>
          <span className="orders-visible-count">
            {filteredOrders.length} de {orders.length} visibles
          </span>
        </div>

        {isLoading ? (
          <LoadingState message="Cargando pedidos..." />
        ) : orders.length === 0 ? (
          <EmptyState description="Los pedidos creados por el equipo o por el bot apareceran aqui filtrados por tenant." title="Sin pedidos registrados" />
        ) : filteredOrders.length === 0 ? (
          <EmptyState description="Ajusta fecha, cliente o estado para volver a ver resultados." title="Sin pedidos con estos filtros" />
        ) : (
          <div className="data-table-wrapper orders-table-wrapper">
            <table className="data-table orders-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Progreso</th>
                  <th>Metodo de pago</th>
                  <th>Total</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <div className="order-customer-cell">
                        <span><UserRound size={17} aria-hidden="true" /></span>
                        <div>
                          <strong>{order.cliente_nombre}</strong>
                          <small>{order.telefono_cliente ?? 'Sin telefono'}</small>
                        </div>
                      </div>
                    </td>
                    <td>{formatDate(getOrderDate(order))}</td>
                    <td><OrderStatusBadge status={order.estado} /></td>
                    <td><OrderProgress status={order.estado} /></td>
                    <td>
                      <span className="payment-method">
                        <CreditCard size={15} aria-hidden="true" />
                        {getPaymentMethod(order) || 'No especificado'}
                      </span>
                    </td>
                    <td><strong>{formatCurrency(order.total)}</strong></td>
                    <td>
                      <div className="table-actions order-actions">
                        <button className="icon-button order-action view" onClick={() => setSelectedOrder(order)} type="button" aria-label="Ver detalle">
                          <Eye size={16} aria-hidden="true" />
                        </button>
                        <Can permission="orders.manage">
                          <button
                            className="icon-button order-action edit"
                            onClick={() => {
                              setEditingOrder(order);
                              setIsFormOpen(true);
                            }}
                            type="button"
                            aria-label="Editar pedido"
                          >
                            <Edit3 size={16} aria-hidden="true" />
                          </button>
                          <button className="icon-button order-action delete" disabled={isSaving} onClick={() => handleDelete(order)} type="button" aria-label="Eliminar pedido">
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedOrder ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
            <button className="modal-close icon-button" onClick={() => setSelectedOrder(null)} type="button" aria-label="Cerrar detalle">
              <X size={16} aria-hidden="true" />
            </button>
            <div className="catalog-modal-header">
              <span>
                <ShoppingBag size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Detalle del pedido</p>
                <h2 id="order-detail-title">{selectedOrder.cliente_nombre}</h2>
                <p>{formatDate(getOrderDate(selectedOrder))}</p>
              </div>
            </div>
            <div className="order-detail-grid">
              <div>
                <span>Estado</span>
                <OrderStatusBadge status={selectedOrder.estado} />
              </div>
              <div>
                <span>Total</span>
                <strong>{formatCurrency(selectedOrder.total)}</strong>
              </div>
              <div>
                <span>Metodo de pago</span>
                <strong>{getPaymentMethod(selectedOrder) || 'No especificado'}</strong>
              </div>
              <div>
                <span>Telefono</span>
                <strong>{selectedOrder.telefono_cliente ?? 'Sin telefono'}</strong>
              </div>
            </div>
            <div className="order-detail-progress">
              <span>Progreso</span>
              <OrderProgress status={selectedOrder.estado} />
            </div>
            <div className="order-detail-notes">
              <span>Notas</span>
              <p>{selectedOrder.notas || 'Sin notas registradas.'}</p>
            </div>
          </article>
        </div>
      ) : null}

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide order-form-modal" role="dialog" aria-modal="true" aria-labelledby="order-form-title">
            <button
              className="modal-close icon-button"
              onClick={() => {
                setEditingOrder(null);
                setIsFormOpen(false);
              }}
              type="button"
              aria-label="Cerrar formulario"
            >
              <X size={16} aria-hidden="true" />
            </button>
            <div className="catalog-modal-header">
              <span>
                <ShoppingBag size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">Pedido</p>
                <h2 id="order-form-title">{editingOrder ? 'Editar pedido' : 'Crear pedido'}</h2>
                <p>El backend asigna y valida el tenant_id antes de guardar.</p>
              </div>
            </div>
            <OrderForm
              initialOrder={editingOrder}
              isSaving={isSaving}
              onCancel={() => {
                setEditingOrder(null);
                setIsFormOpen(false);
              }}
              onSubmit={handleSubmit}
            />
          </article>
        </div>
      ) : null}
    </section>
  );
}
