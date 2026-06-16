import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Boxes,
  Building2,
  MessageCircle,
  ShoppingBag,
  TrendingUp,
  UserPlus,
  Users
} from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/index.js';
import { isSuperAdminRole } from '../../config/permissions.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchCompanies } from '../companies/companiesApi.js';
import { fetchReportsOverview } from './reportsApi.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return date.toISOString().slice(0, 10);
}

const emptyReports = {
  date_range: {
    fecha_inicio: thirtyDaysAgo(),
    fecha_fin: today()
  },
  metrics: {
    total_conversaciones: 0,
    conversaciones_atendidas_bot: 0,
    conversaciones_pidieron_humano: 0,
    pedidos_generados: 0,
    ventas_estimadas: 0,
    clientes_nuevos: 0,
    tasa_conversion_conversacion_pedido: 0,
    orders_source: 'pending_orders_module'
  },
  productos_mas_consultados: [],
  consumo_ia: {
    total_requests: 0,
    total_tokens: 0,
    costo_estimado: 0
  },
  mensajes_por_dia: [],
  desglose_empresas: []
};

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 2,
    style: 'currency'
  });
}

function ReportMetric({ icon: Icon, label, value, detail, tone = 'blue' }) {
  return (
    <article className={`enterprise-metric ${tone}`}>
      <span className="enterprise-metric-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function BarList({ emptyTitle, items, labelKey, valueKey }) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] ?? 0)), 1);

  if (!items.length || items.every((item) => Number(item[valueKey] ?? 0) === 0)) {
    return <EmptyState title={emptyTitle} description="Aun no hay datos para el periodo seleccionado." />;
  }

  return (
    <div className="dashboard-bar-list">
      {items.map((item) => (
        <div className="dashboard-bar-row" key={`${item[labelKey]}-${item.tenant_id ?? ''}`}>
          <div>
            <strong>{item[labelKey]}</strong>
            <span>{Number(item[valueKey] ?? 0).toLocaleString('es-MX')}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(Number(item[valueKey] ?? 0) / maxValue) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportsManager() {
  const { user } = useAuth();
  const isSuperAdmin = isSuperAdminRole(user?.rol);
  const [companies, setCompanies] = useState([]);
  const [filters, setFilters] = useState({
    fecha_inicio: thirtyDaysAgo(),
    fecha_fin: today(),
    empresa_id: ''
  });
  const [reports, setReports] = useState(emptyReports);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const metrics = reports.metrics ?? emptyReports.metrics;
  const aiUsage = reports.consumo_ia ?? emptyReports.consumo_ia;
  const dailyMessages = useMemo(
    () => (reports.mensajes_por_dia ?? []).map((item) => ({ ...item, label: item.fecha.slice(5) })),
    [reports.mensajes_por_dia]
  );

  async function loadReports(nextFilters = filters) {
    try {
      setIsLoading(true);
      setError('');
      const [nextReports, nextCompanies] = await Promise.all([
        fetchReportsOverview({
          fecha_inicio: nextFilters.fecha_inicio,
          fecha_fin: nextFilters.fecha_fin,
          empresa_id: isSuperAdmin && nextFilters.empresa_id ? nextFilters.empresa_id : undefined
        }),
        isSuperAdmin ? fetchCompanies() : Promise.resolve([])
      ]);
      setReports({ ...emptyReports, ...nextReports });
      setCompanies(nextCompanies);
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? 'No se pudieron cargar los reportes.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, [isSuperAdmin]);

  function handleFilterChange(event) {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    loadReports(filters);
  }

  return (
    <section className="commercial-dashboard enterprise-dashboard" aria-label="Reportes">
      <div className="dashboard-hero enterprise-hero">
        <div>
          <p className="eyebrow">Reportes</p>
          <h2>{isSuperAdmin ? 'Reportes globales' : 'Reportes de empresa'}</h2>
          <p>Conversaciones, atencion, productos, clientes y consumo IA filtrados por tenant.</p>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={() => loadReports(filters)} /> : null}

      <form className="dashboard-filters enterprise-filters" onSubmit={handleSubmit}>
        <label className="field-group" htmlFor="reports-start-date">
          <span>Fecha inicio</span>
          <input id="reports-start-date" name="fecha_inicio" onChange={handleFilterChange} type="date" value={filters.fecha_inicio} />
        </label>
        <label className="field-group" htmlFor="reports-end-date">
          <span>Fecha fin</span>
          <input id="reports-end-date" name="fecha_fin" onChange={handleFilterChange} type="date" value={filters.fecha_fin} />
        </label>
        {isSuperAdmin ? (
          <label className="field-group" htmlFor="reports-company">
            <span>Empresa</span>
            <select id="reports-company" name="empresa_id" onChange={handleFilterChange} value={filters.empresa_id}>
              <option value="">Global</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="primary-button" disabled={isLoading} type="submit">
          {isLoading ? 'Actualizando...' : 'Aplicar filtros'}
        </button>
      </form>

      {isLoading ? <LoadingState message="Cargando reportes..." /> : null}

      <div className="enterprise-metrics-grid">
        <ReportMetric icon={MessageCircle} label="Conversaciones" value={metrics.total_conversaciones} detail="Total del periodo" />
        <ReportMetric icon={Bot} label="Atendidas por bot" value={metrics.conversaciones_atendidas_bot} detail="Respuesta automatica registrada" tone="green" />
        <ReportMetric icon={Users} label="Pidieron humano" value={metrics.conversaciones_pidieron_humano} detail="Handoff o atencion humana" tone="amber" />
        <ReportMetric icon={ShoppingBag} label="Pedidos" value={metrics.pedidos_generados} detail={metrics.orders_source === 'pending_orders_module' ? 'Modulo pendiente' : 'Generados'} tone="purple" />
        <ReportMetric icon={TrendingUp} label="Ventas estimadas" value={formatCurrency(metrics.ventas_estimadas)} detail="Segun pedidos registrados" />
        <ReportMetric icon={UserPlus} label="Clientes nuevos" value={metrics.clientes_nuevos} detail="Primer mensaje en el periodo" tone="green" />
        <ReportMetric icon={Bot} label="Consumo IA" value={aiUsage.total_requests ?? 0} detail={`${Number(aiUsage.total_tokens ?? 0).toLocaleString('es-MX')} tokens`} tone="amber" />
        <ReportMetric icon={TrendingUp} label="Conversion" value={`${metrics.tasa_conversion_conversacion_pedido}%`} detail="Conversacion a pedido" />
      </div>

      <div className="enterprise-dashboard-grid">
        <article className="panel-section chart-panel">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Mensajes por dia</h2>
              <p>Volumen diario de conversaciones.</p>
            </div>
            <MessageCircle size={22} aria-hidden="true" />
          </div>
          <BarList emptyTitle="Sin mensajes" items={dailyMessages} labelKey="label" valueKey="mensajes" />
        </article>

        <article className="panel-section chart-panel">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Productos mas consultados</h2>
              <p>Consultas detectadas en conversaciones y leads.</p>
            </div>
            <Boxes size={22} aria-hidden="true" />
          </div>
          <BarList emptyTitle="Sin productos consultados" items={reports.productos_mas_consultados ?? []} labelKey="nombre" valueKey="consultas" />
        </article>
      </div>

      {isSuperAdmin ? (
        <article className="panel-section chart-panel">
          <div className="section-header dashboard-section-header">
            <div>
              <h2>Desglose por empresa</h2>
              <p>Vista global para Super Admin.</p>
            </div>
            <Building2 size={22} aria-hidden="true" />
          </div>
          <BarList emptyTitle="Sin actividad por empresa" items={reports.desglose_empresas ?? []} labelKey="empresa_nombre" valueKey="total_conversaciones" />
        </article>
      ) : null}
    </section>
  );
}
