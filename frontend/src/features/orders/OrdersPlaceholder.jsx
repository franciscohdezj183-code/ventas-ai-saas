import { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, RefreshCcw, ShoppingBag, Trash2 } from 'lucide-react';
import { Can } from '../../components/Can.jsx';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '../../components/ui/index.js';
import { createOrder, deleteOrder, fetchOrders, updateOrder } from './ordersApi.js';

const emptyForm = {
  cliente_nombre: '',
  telefono_cliente: '',
  estado: 'NUEVO',
  total: '',
  notas: ''
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
    <form className="company-form" onSubmit={handleSubmit} noValidate>
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const summary = useMemo(() => ({
    total: orders.length,
    sales: orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0)
  }), [orders]);

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

  if (isLoading) {
    return <LoadingState message="Cargando pedidos..." />;
  }

  return (
    <section className="panel-section">
      <div className="section-header dashboard-section-header">
        <div>
          <h2>Pedidos</h2>
          <p>{summary.total} pedidos · {formatCurrency(summary.sales)} en ventas estimadas.</p>
        </div>
        <div className="header-actions">
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

      {orders.length === 0 ? (
        <EmptyState description="Los pedidos creados por el equipo o por el bot apareceran aqui filtrados por tenant." title="Sin pedidos registrados" />
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefono</th>
                <th>Estado</th>
                <th>Total</th>
                <th>Fecha</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.cliente_nombre}</td>
                  <td>{order.telefono_cliente ?? '-'}</td>
                  <td><StatusBadge status={order.estado} /></td>
                  <td>{formatCurrency(order.total)}</td>
                  <td>{order.fecha ? new Date(order.fecha).toLocaleString('es-MX') : '-'}</td>
                  <td>
                    <div className="table-actions">
                      <Can permission="orders.manage">
                        <button
                          className="icon-button"
                          onClick={() => {
                            setEditingOrder(order);
                            setIsFormOpen(true);
                          }}
                          type="button"
                          aria-label="Editar pedido"
                        >
                          <Edit3 size={16} aria-hidden="true" />
                        </button>
                        <button className="icon-button danger" disabled={isSaving} onClick={() => handleDelete(order)} type="button" aria-label="Eliminar pedido">
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

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <article className="catalog-modal wide" role="dialog" aria-modal="true" aria-labelledby="order-form-title">
            <div className="section-header">
              <div>
                <h2 id="order-form-title">{editingOrder ? 'Editar pedido' : 'Crear pedido'}</h2>
                <p>El backend asigna y valida el tenant_id antes de guardar.</p>
              </div>
              <ShoppingBag size={22} aria-hidden="true" />
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
