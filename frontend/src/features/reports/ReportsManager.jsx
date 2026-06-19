import { useEffect, useMemo, useState } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import { PieChart } from '@mui/x-charts/PieChart';
import {
  Bot,
  Boxes,
  Building2,
  CalendarDays,
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
  ventas_por_dia: [],
  pedidos_por_periodo: [],
  pedidos_por_estado: [],
  leads_por_origen: [],
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

function chartHasData(items, valueKey) {
  return items.length > 0 && items.some((item) => Number(item[valueKey] ?? 0) > 0);
}

function ReportChartCard({ children, description, icon: Icon, title }) {
  return (
    <article className="panel-section report-chart-card">
      <div className="section-header dashboard-section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <Icon size={22} aria-hidden="true" />
      </div>
      {children}
    </article>
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
  const salesOverTime = useMemo(
    () => (reports.ventas_por_dia ?? reports.ventas_en_tiempo ?? reports.sales_over_time ?? dailyMessages)
      .map((item) => ({
        label: item.label ?? item.fecha?.slice(5) ?? item.periodo ?? item.date ?? '',
        ventas: Number(item.ventas ?? item.ventas_estimadas ?? item.total_ventas ?? item.total ?? 0)
      })),
    [dailyMessages, reports]
  );
  const ordersByPeriod = useMemo(
    () => (reports.pedidos_por_periodo ?? reports.pedidos_por_dia ?? reports.orders_by_period ?? dailyMessages)
      .map((item) => ({
        label: item.label ?? item.fecha?.slice(5) ?? item.periodo ?? item.date ?? '',
        pedidos: Number(item.pedidos ?? item.total_pedidos ?? item.orders ?? 0)
      })),
    [dailyMessages, reports]
  );
  const ordersByStatus = useMemo(
    () => (reports.pedidos_por_estado ?? reports.orders_by_status ?? [])
      .map((item, id) => ({
        id,
        label: item.estado ?? item.status ?? item.label ?? 'Sin estado',
        value: Number(item.total ?? item.pedidos ?? item.value ?? 0)
      })),
    [reports]
  );
  const leadsByOrigin = useMemo(
    () => (reports.leads_por_origen ?? reports.leads_by_origin ?? [])
      .map((item) => ({
        origen: item.origen ?? item.source ?? item.label ?? 'Sin origen',
        leads: Number(item.total ?? item.leads ?? item.value ?? 0)
      })),
    [reports]
  );
  const topProducts = reports.productos_mas_consultados ?? [];

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
    <section className="commercial-dashboard enterprise-dashboard reports-page" aria-label="Reportes">
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
          <div className="report-date-input">
            <CalendarDays size={17} aria-hidden="true" />
            <input id="reports-start-date" name="fecha_inicio" onChange={handleFilterChange} type="date" value={filters.fecha_inicio} />
          </div>
        </label>
        <label className="field-group" htmlFor="reports-end-date">
          <span>Fecha fin</span>
          <div className="report-date-input">
            <CalendarDays size={17} aria-hidden="true" />
            <input id="reports-end-date" name="fecha_fin" onChange={handleFilterChange} type="date" value={filters.fecha_fin} />
          </div>
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
        <ReportChartCard icon={TrendingUp} title="Ventas en el tiempo" description="Evolucion de ventas reportadas para el periodo.">
          {chartHasData(salesOverTime, 'ventas') ? (
            <LineChart
              height={260}
              series={[{ area: true, curve: 'monotoneX', data: salesOverTime.map((item) => item.ventas), label: 'Ventas' }]}
              xAxis={[{ data: salesOverTime.map((item) => item.label), scaleType: 'point' }]}
            />
          ) : (
            <EmptyState title="Sin ventas" description="Aun no hay ventas para graficar en el periodo seleccionado." />
          )}
        </ReportChartCard>

        <ReportChartCard icon={ShoppingBag} title="Pedidos por periodo" description="Volumen de pedidos agrupado por fecha o periodo.">
          {chartHasData(ordersByPeriod, 'pedidos') ? (
            <BarChart
              height={260}
              series={[{ data: ordersByPeriod.map((item) => item.pedidos), label: 'Pedidos' }]}
              xAxis={[{ data: ordersByPeriod.map((item) => item.label), scaleType: 'band' }]}
            />
          ) : (
            <EmptyState title="Sin pedidos" description="Aun no hay pedidos para el periodo seleccionado." />
          )}
        </ReportChartCard>
      </div>

      <div className="enterprise-dashboard-grid">
        <ReportChartCard icon={MessageCircle} title="Mensajes por dia" description="Volumen diario de conversaciones.">
          {chartHasData(dailyMessages, 'mensajes') ? (
            <BarChart
              height={260}
              series={[{ data: dailyMessages.map((item) => Number(item.mensajes ?? 0)), label: 'Mensajes' }]}
              xAxis={[{ data: dailyMessages.map((item) => item.label), scaleType: 'band' }]}
            />
          ) : (
            <EmptyState title="Sin mensajes" description="Aun no hay datos para el periodo seleccionado." />
          )}
        </ReportChartCard>

        <ReportChartCard icon={ShoppingBag} title="Pedidos por estado" description="Distribucion operativa de pedidos.">
          {ordersByStatus.length && ordersByStatus.some((item) => item.value > 0) ? (
            <PieChart
              height={260}
              series={[{ data: ordersByStatus, innerRadius: 58, outerRadius: 98, paddingAngle: 3 }]}
              slotProps={{ legend: { direction: 'row', position: { horizontal: 'middle', vertical: 'bottom' } } }}
            />
          ) : (
            <EmptyState title="Sin estados" description="Aun no hay distribucion de pedidos por estado." />
          )}
        </ReportChartCard>
      </div>

      <div className="enterprise-dashboard-grid">
        <ReportChartCard icon={UserPlus} title="Leads por origen" description="Canales que generan nuevos clientes.">
          {chartHasData(leadsByOrigin, 'leads') ? (
            <BarChart
              height={260}
              series={[{ data: leadsByOrigin.map((item) => item.leads), label: 'Leads' }]}
              xAxis={[{ data: leadsByOrigin.map((item) => item.origen), scaleType: 'band' }]}
            />
          ) : (
            <EmptyState title="Sin leads por origen" description="Aun no hay datos de origen para este periodo." />
          )}
        </ReportChartCard>

        <ReportChartCard icon={Boxes} title="Productos mas consultados" description="Consultas detectadas en conversaciones y leads.">
          {chartHasData(topProducts, 'consultas') ? (
            <BarChart
              height={260}
              layout="horizontal"
              series={[{ data: topProducts.map((item) => Number(item.consultas ?? 0)), label: 'Consultas' }]}
              yAxis={[{ data: topProducts.map((item) => item.nombre), scaleType: 'band' }]}
            />
          ) : (
            <EmptyState title="Sin productos consultados" description="Aun no hay datos para el periodo seleccionado." />
          )}
        </ReportChartCard>
      </div>

      {isSuperAdmin ? (
        <article className="panel-section chart-panel reports-table-card">
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
